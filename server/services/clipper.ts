import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { spawn, spawnSync } from "child_process";
import { eq, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { z } from "zod/v4";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { claudeConfigured } from "./ai-writer.js";
import { enqueue } from "./job-queue.js";
import {
  ffmpegPath,
  hasAudioStream,
  localize,
  mediaUrlFor,
  probeDuration,
  rendersDir,
  runFfmpeg,
  workDir,
} from "./media.js";
import {
  assText,
  assTime,
  fitChain,
  fontsDir,
  FRAME_SIZES,
  probeVideoSize,
  type AspectRatio,
} from "./video-renderer.js";

export interface ClipOptions {
  clipCount: number;
  minSeconds: number;
  maxSeconds: number;
  aspectRatio: AspectRatio;
  /** fit = whole frame on a blurred fill; crop = fill the frame, trimming the sides. */
  layout: "fit" | "crop";
  captions: boolean;
  /** Show the clip's hook as a banner across the top. */
  hookBanner: boolean;
  disclosure?: string;
}

interface Word { word: string; start: number; end: number }
interface Segment { start: number; end: number; text: string }
interface Transcript { segments: Segment[]; words: Word[] }

interface Highlight {
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
  postCaption: string;
  hashtags: string[];
}

const MAX_SOURCE_SECONDS = Number(process.env.CLIP_MAX_SOURCE_SECONDS) || 4 * 3600;
const DIRECT_MEDIA = /\.(mp4|mov|m4v|webm|mkv|flv|ts|m3u8)(\?|$)/i;

export function transcriptionConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function ytDlpBinary(): string {
  return process.env.YTDLP_PATH || "yt-dlp";
}

let ytDlpChecked: boolean | null = null;
export function ytDlpAvailable(): boolean {
  if (ytDlpChecked === null) {
    const r = spawnSync(ytDlpBinary(), ["--version"], { stdio: "ignore" });
    ytDlpChecked = r.status === 0;
  }
  return ytDlpChecked;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (c) => (err = (err + c.toString()).slice(-4000)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}: ${err.trim().slice(-800)}`))));
  });
}

// ---------------------------------------------------------------------------
// 1. Getting the source video
// ---------------------------------------------------------------------------

async function acquireSource(project: typeof schema.clipProjects.$inferSelect, scratch: string, note: (m: string) => void): Promise<string> {
  if (project.sourceFile) return localize(project.sourceFile, scratch);
  const url = project.sourceUrl;
  if (!url) throw new Error("No source video was provided");

  const dest = path.join(scratch, "source.mp4");
  if (DIRECT_MEDIA.test(new URL(url).pathname + new URL(url).search)) {
    // ffmpeg reads plain files and HLS (.m3u8) stream recordings alike.
    const isHls = /\.m3u8/i.test(url);
    try {
      await runFfmpeg(["-i", url, "-t", String(MAX_SOURCE_SECONDS), "-c", "copy", ...(isHls ? ["-bsf:a", "aac_adtstoasc"] : []), dest]);
    } catch {
      await runFfmpeg(["-i", url, "-t", String(MAX_SOURCE_SECONDS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", dest]);
    }
    note("Downloaded the source video");
    return dest;
  }

  if (!ytDlpAvailable()) {
    throw new Error(
      "That link is a web page, not a video file. Install yt-dlp on the server (or set YTDLP_PATH), paste a direct .mp4/.m3u8 link, or upload the recording instead."
    );
  }
  await run(ytDlpBinary(), [
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
    "--merge-output-format", "mp4",
    "--ffmpeg-location", ffmpegPath(),
    "--no-playlist",
    "--download-sections", `*0-${MAX_SOURCE_SECONDS}`,
    "-o", dest,
    url,
  ]);
  if (!fs.existsSync(dest)) throw new Error("yt-dlp finished but produced no file");
  note("Downloaded the source with yt-dlp");
  return dest;
}

// ---------------------------------------------------------------------------
// 2. Transcription (OpenAI Whisper, word timestamps)
// ---------------------------------------------------------------------------

async function transcribe(source: string, scratch: string, onChunk: (i: number, n: number) => void): Promise<Transcript> {
  const chunkDir = path.join(scratch, "audio");
  fs.mkdirSync(chunkDir, { recursive: true });
  // 10 minute mono chunks stay well under the 25 MB upload limit.
  await runFfmpeg([
    "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
    "-f", "segment", "-segment_time", "600", "-reset_timestamps", "1",
    path.join(chunkDir, "chunk_%03d.mp3"),
  ]);
  const chunks = fs.readdirSync(chunkDir).filter((f) => f.endsWith(".mp3")).sort();
  const out: Transcript = { segments: [], words: [] };
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    onChunk(i, chunks.length);
    const file = path.join(chunkDir, chunks[i]);
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(file)], { type: "audio/mpeg" }), chunks[i]);
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { segments?: Segment[]; words?: Word[] };
    for (const s of json.segments ?? []) out.segments.push({ start: s.start + offset, end: s.end + offset, text: s.text.trim() });
    for (const w of json.words ?? []) out.words.push({ word: w.word.trim(), start: w.start + offset, end: w.end + offset });
    offset += await probeDuration(file);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Picking the moments
// ---------------------------------------------------------------------------

const ClipPickSchema = z.object({
  clips: z.array(
    z.object({
      start: z.number().describe("Clip start in seconds, at the start of a sentence"),
      end: z.number().describe("Clip end in seconds, after the payoff lands"),
      title: z.string().describe("Short internal title"),
      hook: z.string().describe("On-screen banner text for the top of the clip, max 8 words, curiosity-driven"),
      reason: z.string().describe("Why this moment will perform"),
      score: z.number().describe("Predicted virality from 0 to 100"),
      postCaption: z.string().describe("Caption to post with the clip"),
      hashtags: z.array(z.string()),
    })
  ),
});

const CLIP_SYSTEM = `You are a professional clipper who turns long livestreams, podcasts and videos into short vertical clips for TikTok, Reels, Shorts and X. A lot of the footage is crypto livestreams (for example pump.fun coin streams), gaming and talk streams.

Pick the moments most likely to go viral: big reactions, hot takes, funny exchanges, reveals, wins and losses, quotable one-liners, or a complete story with a payoff. Every clip must make sense on its own without the rest of the stream, start at the beginning of a sentence and end right after the payoff.

Captions and hooks must not promise profits, price targets or guaranteed returns, and must not tell people to buy a token. Describe what happened in the clip instead.`;

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, "0")}`;
}

async function pickWithClaude(t: Transcript, duration: number, options: ClipOptions, context: string | null): Promise<Highlight[]> {
  const client = new Anthropic();
  const lines = t.segments.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)} | ${mmss(s.start)}] ${s.text}`).join("\n");
  const response = await client.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    max_tokens: 16000,
    output_config: {
      effort: (process.env.ANTHROPIC_EFFORT as "low" | "medium" | "high") || "medium",
      format: betaZodOutputFormat(ClipPickSchema),
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: CLIP_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `${context ? `About this video: ${context}\n` : ""}` +
          `Length: ${duration.toFixed(0)} seconds.\n` +
          `Find the best ${options.clipCount} clips, each between ${options.minSeconds} and ${options.maxSeconds} seconds long, with no overlaps. Rank best first.\n\n` +
          `Transcript (start-end seconds | mm:ss):\n${lines}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to pick clips from this transcript");
  const parsed = response.parsed_output;
  if (!parsed?.clips.length) throw new Error("Claude returned no clips");
  return parsed.clips.map((c) => ({ ...c, hashtags: c.hashtags ?? [] }));
}

/** Per-second loudness of the source, used when there is no transcript. */
async function loudnessCurve(source: string, scratch: string): Promise<number[]> {
  const file = path.join(scratch, "rms.txt");
  await runFfmpeg([
    "-i", source, "-vn", "-ac", "1",
    "-af", `aresample=8000,asetnsamples=n=8000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=${file.replace(/\\/g, "/").replace(/:/g, "\\:")}`,
    "-f", "null", "-",
  ]);
  const values: number[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/RMS_level=(-?[\d.]+|-inf)/);
    if (m) values.push(m[1] === "-inf" ? 0 : Math.pow(10, Number(m[1]) / 20));
  }
  return values;
}

function pickByLoudness(curve: number[], duration: number, options: ClipOptions, t: Transcript | null): Highlight[] {
  const len = Math.round(Math.min(options.maxSeconds, Math.max(options.minSeconds, (options.minSeconds + options.maxSeconds) / 2)));
  if (curve.length <= len) {
    return [{ start: 0, end: Math.min(duration, options.maxSeconds), title: "Highlight 1", hook: "", reason: "Whole video", score: 50, postCaption: "", hashtags: [] }];
  }
  // Sliding window of average loudness plus how much it jumps (hype spikes).
  const scores: number[] = [];
  let sum = curve.slice(0, len).reduce((a, b) => a + b, 0);
  for (let s = 0; s + len <= curve.length; s++) {
    if (s > 0) sum += curve[s + len - 1] - curve[s - 1];
    const peak = Math.max(...curve.slice(s, s + len));
    scores.push(sum / len + 0.5 * peak);
  }
  const order = scores.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const chosen: number[] = [];
  for (const [, i] of order) {
    if (chosen.length >= options.clipCount) break;
    if (chosen.every((c) => Math.abs(c - i) >= len)) chosen.push(i);
  }
  const top = scores[order[0][1]] || 1;
  return chosen.map((start, k) => {
    const end = Math.min(duration, start + len);
    const said = t?.segments.filter((s) => s.start >= start && s.start < end).map((s) => s.text).join(" ") ?? "";
    const firstSentence = said.split(/(?<=[.!?])\s/)[0]?.slice(0, 60) ?? "";
    return {
      start,
      end,
      title: firstSentence || `Highlight ${k + 1}`,
      hook: firstSentence ? firstSentence.split(" ").slice(0, 8).join(" ") : "",
      reason: "Loudest, most energetic stretch of the stream",
      score: Math.round((scores[start] / top) * 100),
      postCaption: said.slice(0, 180),
      hashtags: [],
    };
  });
}

/** Clamp to the video, enforce lengths, snap to word edges, drop overlaps. */
function tidy(highlights: Highlight[], duration: number, options: ClipOptions, words: Word[]): Highlight[] {
  const out: Highlight[] = [];
  for (const h of highlights) {
    let start = Math.max(0, Math.min(h.start, duration - 1));
    let end = Math.min(duration, Math.max(h.end, start + 1));
    if (words.length) {
      const first = words.find((w) => w.end > start + 0.05);
      if (first && first.start - start < 1.5) start = Math.max(0, first.start - 0.15);
      const last = [...words].reverse().find((w) => w.start < end - 0.05);
      if (last && end - last.end < 1.5) end = Math.min(duration, last.end + 0.35);
    }
    if (end - start > options.maxSeconds) end = start + options.maxSeconds;
    if (end - start < options.minSeconds) end = Math.min(duration, start + options.minSeconds);
    if (end - start < 3) continue;
    if (out.some((o) => start < o.end && end > o.start)) continue;
    out.push({ ...h, start, end });
    if (out.length >= options.clipCount) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Cutting and styling each clip
// ---------------------------------------------------------------------------

function clipAss(h: Highlight, words: Word[], options: ClipOptions, size: { w: number; h: number }) {
  const { w, h: H } = size;
  const font = process.env.CAPTION_FONT || "DejaVu Sans";
  const base = Math.min(w, H);
  const cap = Math.round(base * 0.075);
  const tag = Math.round(base * 0.05);
  const small = Math.round(base * 0.028);
  const vertical = H > w;
  const dur = h.end - h.start;

  const lines: string[] = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${w}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${font},${cap},&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,${Math.round(cap * 0.09)},${Math.round(cap * 0.05)},2,${Math.round(w * 0.07)},${Math.round(w * 0.07)},${Math.round(H * (vertical ? 0.2 : 0.1))},1`,
    `Style: Hook,${font},${tag},&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,${Math.round(tag * 0.4)},0,8,${Math.round(w * 0.07)},${Math.round(w * 0.07)},${Math.round(H * 0.08)},1`,
    `Style: Disclosure,${font},${small},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,3,${Math.round(small * 0.3)},0,1,${Math.round(w * 0.04)},${Math.round(w * 0.04)},${Math.round(H * 0.03)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const add = (a: number, b: number, style: string, text: string, layer: number) => {
    if (text.trim() && b - a > 0.04) lines.push(`Dialogue: ${layer},${assTime(a)},${assTime(b)},${style},,0,0,0,,${text}`);
  };

  if (options.hookBanner && h.hook) add(0, dur, "Hook", `{\\fad(200,0)}${assText(h.hook)}`, 1);

  if (options.captions) {
    const inClip = words.filter((wd) => wd.start >= h.start - 0.05 && wd.end <= h.end + 0.05 && wd.word);
    let group: Word[] = [];
    const flush = () => {
      if (!group.length) return;
      const a = group[0].start - h.start;
      const b = group[group.length - 1].end - h.start;
      add(Math.max(0, a), Math.min(dur, Math.max(b, a + 0.3)), "Caption",
        `{\\fscx88\\fscy88\\t(0,80,\\fscx100\\fscy100)}${assText(group.map((g) => g.word).join(" ").toUpperCase())}`, 3);
      group = [];
    };
    for (const wd of inClip) {
      if (group.length && wd.start - group[group.length - 1].end > 0.6) flush();
      group.push(wd);
      const text = group.map((g) => g.word).join(" ");
      if (group.length >= 4 || text.length > 16 || /[.!?,;:]$/.test(wd.word)) flush();
    }
    flush();
  }

  if (options.disclosure) add(0, dur, "Disclosure", assText(options.disclosure), 4);
  return lines.join("\n") + "\n";
}

async function cutClip(source: string, h: Highlight, words: Word[], options: ClipOptions, scratch: string, index: number) {
  const size = FRAME_SIZES[options.aspectRatio];
  const dims = await probeVideoSize(source);
  const srcAspect = options.layout === "crop" ? size.w / size.h : dims ? dims.w / dims.h : null;
  const dur = h.end - h.start;

  const assName = `clip_${index}.ass`;
  fs.writeFileSync(path.join(scratch, assName), clipAss(h, words, options, size));
  const fonts = fontsDir();
  const subs = `subtitles=${assName}${fonts ? `:fontsdir='${fonts.replace(/\\/g, "/").replace(/:/g, "\\:")}'` : ""}`;

  const withAudio = await hasAudioStream(source);
  const stamp = Date.now();
  const outFile = path.join(rendersDir, `clip_${stamp}_${index}.mp4`);
  const thumbFile = path.join(rendersDir, `clip_${stamp}_${index}.jpg`);
  const filter = `${fitChain("0:v", "fit", size.w, size.h, srcAspect)};[fit]${subs},fade=t=in:st=0:d=0.15,fade=t=out:st=${Math.max(0, dur - 0.3).toFixed(2)}:d=0.3,format=yuv420p[v]`;

  await runFfmpeg(
    [
      "-ss", h.start.toFixed(3), "-t", dur.toFixed(3), "-i", source,
      ...(withAudio ? [] : ["-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo"]),
      "-filter_complex", filter,
      "-map", "[v]", "-map", withAudio ? "0:a:0" : "1:a",
      ...(withAudio ? ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11"] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", "30",
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
      "-movflags", "+faststart", "-t", dur.toFixed(3),
      outFile,
    ],
    scratch
  );
  await runFfmpeg(["-ss", String(Math.min(1, dur / 2)), "-i", outFile, "-frames:v", "1", "-q:v", "3", thumbFile]);
  return { videoUrl: mediaUrlFor(outFile), thumbnailUrl: mediaUrlFor(thumbFile) };
}

// ---------------------------------------------------------------------------

function updateProject(id: number, values: Partial<typeof schema.clipProjects.$inferInsert>) {
  db.update(schema.clipProjects).set(values).where(eq(schema.clipProjects.id, id)).run();
}

async function runClipProject(projectId: number) {
  const project = db.query.clipProjects.findFirst({ where: eq(schema.clipProjects.id, projectId) }).sync();
  if (!project) return;
  const options = JSON.parse(project.options || "{}") as ClipOptions;
  const log: string[] = [];
  const note = (m: string) => {
    log.push(m);
    updateProject(projectId, { log: JSON.stringify(log) });
  };
  const stage = (s: string, p: number) => updateProject(projectId, { stage: s, progress: Math.round(p) });
  const scratch = path.join(workDir, `clips_${projectId}_${Date.now()}`);
  fs.mkdirSync(scratch, { recursive: true });

  try {
    updateProject(projectId, { status: "processing", error: null, log: "[]" });
    db.delete(schema.clips).where(eq(schema.clips.projectId, projectId)).run();

    stage("Getting the source video", 2);
    const source = await acquireSource(project, scratch, note);
    const duration = Math.min(await probeDuration(source), MAX_SOURCE_SECONDS);
    updateProject(projectId, { sourceDuration: duration });

    let transcript: Transcript | null = project.transcript ? JSON.parse(project.transcript) : null;
    if (!transcript && transcriptionConfigured() && (await hasAudioStream(source))) {
      try {
        transcript = await transcribe(source, scratch, (i, n) => stage(`Transcribing (${i + 1}/${n})`, 8 + (i / n) * 30));
        updateProject(projectId, { transcript: JSON.stringify(transcript) });
        note(`Transcribed ${transcript.words.length} words`);
      } catch (e) {
        note(`Transcription failed (${(e as Error).message}); clips will have no captions`);
      }
    } else if (!transcript) {
      note("OPENAI_API_KEY not set, so there is no transcript: clips are picked by loudness and have no captions");
    }

    stage("Finding the best moments", 40);
    let highlights: Highlight[] = [];
    if (transcript?.segments.length && claudeConfigured()) {
      try {
        highlights = await pickWithClaude(transcript, duration, options, project.context);
        note("Claude picked the moments from the transcript");
      } catch (e) {
        note(`Claude could not pick clips (${(e as Error).message}); falling back to loudness`);
      }
    }
    if (!highlights.length) {
      highlights = pickByLoudness(await loudnessCurve(source, scratch), duration, options, transcript);
      if (!claudeConfigured() && transcript) note("ANTHROPIC_API_KEY not set; picked the loudest moments instead");
    }
    highlights = tidy(highlights, duration, options, transcript?.words ?? []);
    if (!highlights.length) throw new Error("No usable moments found in this video");

    for (let i = 0; i < highlights.length; i++) {
      stage(`Cutting clip ${i + 1} of ${highlights.length}`, 45 + (i / highlights.length) * 54);
      const h = highlights[i];
      const { videoUrl, thumbnailUrl } = await cutClip(source, h, transcript?.words ?? [], options, scratch, i);
      db.insert(schema.clips).values({
        projectId, workspaceId: project.workspaceId,
        title: h.title, hook: h.hook, reason: h.reason, score: h.score,
        startSec: h.start, endSec: h.end,
        postCaption: h.postCaption, hashtags: JSON.stringify(h.hashtags),
        videoUrl, thumbnailUrl,
      }).run();
      db.insert(schema.contentItems).values({
        workspaceId: project.workspaceId, title: `${project.title}: ${h.title}`, kind: "video",
        channel: "clip", format: `clip ${options.aspectRatio} (${Math.round(h.end - h.start)}s)`,
        body: h.postCaption, assetUrl: videoUrl, status: "ready",
      }).run();
    }

    updateProject(projectId, { status: "ready", stage: "Done", progress: 100 });
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[clipper] project ${projectId} failed:`, message);
    updateProject(projectId, { status: "failed", error: message.slice(0, 2000) });
  }
}

export function queueClipProject(projectId: number) {
  updateProject(projectId, { status: "queued", stage: "Waiting in queue", progress: 0, error: null });
  enqueue(`clips:${projectId}`, () => runClipProject(projectId));
}

export function resumeInterruptedClipProjects() {
  const stuck = db
    .select({ id: schema.clipProjects.id })
    .from(schema.clipProjects)
    .where(inArray(schema.clipProjects.status, ["queued", "processing"]))
    .all();
  for (const { id } of stuck) queueClipProject(id);
}
