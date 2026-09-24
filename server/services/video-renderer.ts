import fs from "fs";
import path from "path";
import type { PlanScene, VideoPlan } from "./ai-writer.js";
import { ffmpegPath, hasAudioStream, probeDuration, runFfmpeg } from "./media.js";
import { spawn } from "child_process";

export type AspectRatio = "9:16" | "1:1" | "16:9";

export const FRAME_SIZES: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

const FPS = 30;

export interface RenderInput {
  plan: VideoPlan;
  aspectRatio: AspectRatio;
  /** One entry per scene: a local still to animate, or null for a colour card. */
  sceneImages: Array<string | null>;
  /** One entry per scene: local voice clip for that scene's dialogue, or null. */
  sceneAudio?: Array<string | null>;
  /** A full-length talking presenter video; its audio track is the voice. */
  avatarVideo?: string;
  music?: string;
  captions: boolean;
  brandColors: [string, string];
  disclosure?: string;
  scratchDir: string;
  outFile: string;
  thumbFile: string;
  onProgress?: (fraction: number, stage: string) => void;
}

interface TimedScene {
  scene: PlanScene;
  image: string | null;
  start: number;
  duration: number;
  /** Seconds of speech inside the scene (captions are spread across this). */
  speech: number;
  /** Offset into the avatar video when this scene shows the presenter. */
  avatarOffset?: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const hex = (c: string) => (/^#?[0-9a-f]{6}$/i.test(c) ? c.replace("#", "") : "3155d8");

export async function probeVideoSize(file: string): Promise<{ w: number; h: number } | null> {
  const stderr: string = await new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-i", file], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let out = "";
    proc.stderr.on("data", (c) => (out += c.toString()));
    proc.on("close", () => resolve(out));
    proc.on("error", () => resolve(out));
  });
  const m = stderr.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/**
 * Filter chain that fits an input into WxH. Sources close to the target
 * aspect are cover-cropped; others (a square product photo in a vertical
 * video, say) sit on a blurred copy of themselves so nothing gets cut off.
 */
export function fitChain(
  input: string,
  out: string,
  w: number,
  h: number,
  srcAspect: number | null
): string {
  const target = w / h;
  if (srcAspect && Math.abs(srcAspect - target) / target < 0.18) {
    return `[${input}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[${out}]`;
  }
  return (
    `[${input}]split[${out}_a][${out}_b];` +
    `[${out}_a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=40,eq=brightness=-0.12[${out}_bg];` +
    `[${out}_b]scale=${Math.round(w * 0.94)}:${Math.round(h * 0.86)}:force_original_aspect_ratio=decrease[${out}_fg];` +
    `[${out}_bg][${out}_fg]overlay=(W-w)/2:(H-h)/2,setsar=1[${out}]`
  );
}

/** Slow push-in / pull-out on a still, alternating by scene index. */
function kenBurns(input: string, out: string, w: number, h: number, frames: number, index: number) {
  const zoomIn = index % 2 === 0;
  const z = zoomIn
    ? `1+0.12*on/${frames}`
    : `1.12-0.12*on/${frames}`;
  // Upscale first so zoompan's integer cropping does not jitter.
  const bw = Math.round(w * 1.5 / 2) * 2;
  const bh = Math.round(h * 1.5 / 2) * 2;
  return (
    `[${input}]scale=${bw}:${bh},` +
    `zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${FPS},setsar=1[${out}]`
  );
}

const ENCODE = [
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
  "-pix_fmt", "yuv420p", "-r", String(FPS),
];

async function renderSceneClip(
  t: TimedScene,
  index: number,
  input: RenderInput,
  size: { w: number; h: number },
  avatarAspect: number | null,
  clipPath: string
) {
  const { w, h } = size;
  const d = round(t.duration);
  const frames = Math.max(1, Math.round(t.duration * FPS));
  const kind = t.scene.kind;
  const args: string[] = [];
  const filters: string[] = [];

  const useAvatarFull =
    input.avatarVideo !== undefined &&
    t.avatarOffset !== undefined &&
    (kind === "presenter" || !t.image);
  const useAvatarPip =
    input.avatarVideo !== undefined && t.avatarOffset !== undefined && !useAvatarFull;

  if (useAvatarFull) {
    args.push("-ss", String(round(t.avatarOffset!)), "-t", String(d), "-i", input.avatarVideo!);
    filters.push(fitChain("0:v", "base", w, h, avatarAspect));
  } else if (t.image && kind !== "title" && kind !== "cta") {
    args.push("-loop", "1", "-framerate", String(FPS), "-t", String(d), "-i", t.image);
    const dims = await probeVideoSize(t.image);
    filters.push(fitChain("0:v", "fit", w, h, dims ? dims.w / dims.h : null));
    filters.push(kenBurns("fit", "base", w, h, frames, index));
  } else {
    // Title / CTA card: animated brand gradient, product image floated on top.
    const [c0, c1] = input.brandColors.map(hex);
    args.push(
      "-f", "lavfi", "-t", String(d),
      "-i", `gradients=s=${w}x${h}:c0=0x${c0}:c1=0x${c1}:x0=0:y0=0:x1=${w}:y1=${h}:speed=0.015:rate=${FPS}`
    );
    if (t.image) {
      args.push("-loop", "1", "-framerate", String(FPS), "-t", String(d), "-i", t.image);
      const maxW = Math.round(w * 0.62);
      const maxH = Math.round(h * 0.36);
      filters.push(`[1:v]scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease[prod]`);
      // Park the product in the lower half so the headline has room above it.
      filters.push(`[0:v][prod]overlay=(W-w)/2:H*0.55-h/2+${Math.round(h * 0.06)},setsar=1[base]`);
    } else {
      filters.push(`[0:v]setsar=1[base]`);
    }
  }

  let last = "base";
  if (useAvatarPip) {
    const idx = args.filter((a) => a === "-i").length;
    args.push("-ss", String(round(t.avatarOffset!)), "-t", String(d), "-i", input.avatarVideo!);
    const pipW = Math.round(w * (w < h ? 0.34 : 0.24));
    const pipH = Math.round(h * 0.3);
    filters.push(
      `[${idx}:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,` +
        `pad=iw+12:ih+12:6:6:color=white[pip]`
    );
    filters.push(
      `[${last}][pip]overlay=W-w-${Math.round(w * 0.05)}:${Math.round(h * 0.15)}[withpip]`
    );
    last = "withpip";
  }

  const fades: string[] = [];
  if (index === 0) fades.push("fade=t=in:st=0:d=0.3");
  if (index === -1) fades.push(`fade=t=out:st=${Math.max(0, d - 0.5)}:d=0.5`);
  filters.push(`[${last}]${fades.length ? fades.join(",") + "," : ""}format=yuv420p[v]`);

  await runFfmpeg([
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-an", "-t", String(d), "-frames:v", String(frames),
    ...ENCODE,
    clipPath,
  ]);
}

// ---------------------------------------------------------------------------
// Captions (ASS subtitles burned in with libass)
// ---------------------------------------------------------------------------

export function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function assText(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\\/g, "/").replace(/\r?\n/g, "\\N").trim();
}

/** Break dialogue into 2-4 word bursts, TikTok caption style. */
export function captionChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    const len = current.join(" ").length;
    if (current.length >= 4 || len > 16 || /[.!?,;:]$/.test(word)) {
      chunks.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function buildAss(timeline: TimedScene[], input: RenderInput, size: { w: number; h: number }, total: number) {
  const { w, h } = size;
  const font = process.env.CAPTION_FONT || "DejaVu Sans";
  const base = Math.min(w, h);
  const captionSize = Math.round(base * 0.075);
  const titleSize = Math.round(base * 0.11);
  const tagSize = Math.round(base * 0.045);
  const smallSize = Math.round(base * 0.028);
  const vertical = h > w;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${font},${captionSize},&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,${Math.round(captionSize * 0.09)},${Math.round(captionSize * 0.05)},2,${Math.round(w * 0.08)},${Math.round(w * 0.08)},${Math.round(h * (vertical ? 0.24 : 0.12))},1
Style: Title,${font},${titleSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,${Math.round(titleSize * 0.04)},5,${Math.round(w * 0.08)},${Math.round(w * 0.08)},0,1
Style: Sub,${font},${tagSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,${Math.round(w * 0.1)},${Math.round(w * 0.1)},${Math.round(h * 0.6)},1
Style: Tag,${font},${tagSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,3,${Math.round(tagSize * 0.35)},0,8,${Math.round(w * 0.08)},${Math.round(w * 0.08)},${Math.round(h * 0.07)},1
Style: Disclosure,${font},${smallSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,3,${Math.round(smallSize * 0.3)},0,1,${Math.round(w * 0.04)},${Math.round(w * 0.04)},${Math.round(h * 0.03)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  const add = (start: number, end: number, style: string, text: string, layer = 0) => {
    if (!text.trim() || end - start < 0.05) return;
    events.push(`Dialogue: ${layer},${assTime(start)},${assTime(end)},${style},,0,0,0,,${text}`);
  };

  for (const t of timeline) {
    const s = t.scene;
    const end = t.start + t.duration;
    if (s.kind === "title" || s.kind === "cta") {
      const headline = s.headline || s.textOverlay || (s.kind === "cta" ? input.plan.callToAction : input.plan.title);
      const titleY = t.image ? Math.round(h * 0.3) : Math.round(h * 0.45);
      // Bottom-anchored: a headline that wraps grows upward, clear of the subline.
      add(t.start + 0.1, end, "Title",
        `{\\an2\\pos(${Math.round(w / 2)},${titleY})\\fad(250,150)\\fscx80\\fscy80\\t(0,300,\\fscx100\\fscy100)}${assText(headline.toUpperCase())}`, 2);
      const sub = s.kind === "cta" ? (s.textOverlay && s.textOverlay !== headline ? s.textOverlay : input.plan.callToAction) : s.textOverlay !== headline ? s.textOverlay : "";
      if (sub) {
        add(t.start + 0.35, end, "Sub",
          `{\\an8\\pos(${Math.round(w / 2)},${titleY + Math.round(titleSize * 0.3)})\\fad(250,150)}${assText(sub)}`, 2);
      }
      continue;
    }
    if (s.textOverlay) add(t.start + 0.15, end - 0.05, "Tag", `{\\fad(150,100)}${assText(s.textOverlay)}`, 1);
    if (input.captions && s.dialogue.trim()) {
      const chunks = captionChunks(s.dialogue);
      const weights = chunks.map((c) => c.length + 4);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const span = Math.max(0.5, Math.min(t.speech, t.duration) - 0.1);
      let cursor = t.start + 0.05;
      chunks.forEach((chunk, i) => {
        const len = (span * weights[i]) / totalWeight;
        add(cursor, Math.min(end, cursor + len), "Caption",
          `{\\fscx88\\fscy88\\t(0,80,\\fscx100\\fscy100)}${assText(chunk.toUpperCase())}`, 3);
        cursor += len;
      });
    }
  }

  if (input.disclosure) add(0, total, "Disclosure", assText(input.disclosure), 4);
  return header + events.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Timeline + audio
// ---------------------------------------------------------------------------

async function buildTimeline(input: RenderInput): Promise<{ timeline: TimedScene[]; total: number }> {
  const scenes = input.plan.scenes;
  const timeline: TimedScene[] = [];

  if (input.avatarVideo) {
    // The avatar speaks the whole script in one take. Scenes that carry
    // dialogue split that take by word count; silent cards go after it.
    const avatarDuration = await probeDuration(input.avatarVideo);
    const speaking = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.dialogue.trim());
    const silent = scenes.map((s, i) => ({ s, i })).filter(({ s }) => !s.dialogue.trim());
    const words = speaking.map(({ s }) => s.dialogue.split(/\s+/).length);
    const totalWords = words.reduce((a, b) => a + b, 0) || 1;
    let cursor = 0;
    speaking.forEach(({ s, i }, k) => {
      const d = k === speaking.length - 1 ? avatarDuration - cursor : (avatarDuration * words[k]) / totalWords;
      timeline.push({ scene: s, image: input.sceneImages[i], start: cursor, duration: d, speech: d, avatarOffset: cursor });
      cursor += d;
    });
    for (const { s, i } of silent) {
      timeline.push({ scene: s, image: input.sceneImages[i], start: cursor, duration: s.durationSeconds, speech: 0 });
      cursor += s.durationSeconds;
    }
    return { timeline, total: cursor };
  }

  let cursor = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const audio = input.sceneAudio?.[i];
    let duration = s.durationSeconds;
    let speech = s.durationSeconds;
    if (audio) {
      speech = await probeDuration(audio);
      duration = Math.max(speech + 0.35, s.kind === "title" || s.kind === "cta" ? 2 : 1.5);
    }
    timeline.push({ scene: s, image: input.sceneImages[i], start: cursor, duration, speech });
    cursor += duration;
  }
  return { timeline, total: cursor };
}

async function buildVoiceTrack(timeline: TimedScene[], input: RenderInput, total: number, dir: string): Promise<string | null> {
  if (input.avatarVideo) {
    if (!(await hasAudioStream(input.avatarVideo))) return null;
    const out = path.join(dir, "voice.wav");
    await runFfmpeg(["-i", input.avatarVideo, "-vn", "-af", `apad=whole_dur=${round(total)}`, "-t", String(round(total)), "-ar", "44100", "-ac", "2", out]);
    return out;
  }
  if (!input.sceneAudio?.some(Boolean)) return null;

  const parts: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const part = path.join(dir, `voice_${i}.wav`);
    const audio = input.sceneAudio[input.plan.scenes.indexOf(t.scene)];
    if (audio) {
      await runFfmpeg(["-i", audio, "-af", `adelay=50|50,apad=whole_dur=${round(t.duration)}`, "-t", String(round(t.duration)), "-ar", "44100", "-ac", "2", part]);
    } else {
      await runFfmpeg(["-f", "lavfi", "-t", String(round(t.duration)), "-i", "anullsrc=r=44100:cl=stereo", part]);
    }
    parts.push(part);
  }
  const list = path.join(dir, "voice.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const out = path.join(dir, "voice.wav");
  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  return out;
}

async function buildAudioMix(voice: string | null, music: string | undefined, total: number, dir: string): Promise<string> {
  const out = path.join(dir, "mix.m4a");
  const T = String(round(total));
  const fadeStart = Math.max(0, total - 1.5);
  if (voice && music) {
    await runFfmpeg([
      "-i", voice, "-stream_loop", "-1", "-i", music,
      "-filter_complex",
      `[1:a]volume=0.12,afade=t=out:st=${fadeStart}:d=1.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
      "-map", "[a]", "-t", T, "-c:a", "aac", "-b:a", "192k", out,
    ]);
  } else if (voice) {
    await runFfmpeg(["-i", voice, "-t", T, "-c:a", "aac", "-b:a", "192k", out]);
  } else if (music) {
    await runFfmpeg([
      "-stream_loop", "-1", "-i", music,
      "-af", `volume=0.5,afade=t=in:d=0.5,afade=t=out:st=${fadeStart}:d=1.5`,
      "-t", T, "-c:a", "aac", "-b:a", "192k", out,
    ]);
  } else {
    await runFfmpeg(["-f", "lavfi", "-t", T, "-i", "anullsrc=r=44100:cl=stereo", "-c:a", "aac", out]);
  }
  return out;
}

export function fontsDir(): string | null {
  if (process.env.FONTS_DIR) return process.env.FONTS_DIR;
  for (const dir of ["/usr/share/fonts", "/System/Library/Fonts", "C:\\Windows\\Fonts"]) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

// ---------------------------------------------------------------------------

export async function renderVideo(input: RenderInput): Promise<{ duration: number }> {
  const size = FRAME_SIZES[input.aspectRatio];
  const dir = input.scratchDir;
  fs.mkdirSync(dir, { recursive: true });
  const progress = input.onProgress ?? (() => {});

  const { timeline, total } = await buildTimeline(input);
  const avatarDims = input.avatarVideo ? await probeVideoSize(input.avatarVideo) : null;
  const avatarAspect = avatarDims ? avatarDims.w / avatarDims.h : null;

  const clips: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    progress(i / (timeline.length + 2), `Rendering scene ${i + 1} of ${timeline.length}`);
    const clip = path.join(dir, `scene_${String(i).padStart(2, "0")}.mp4`);
    await renderSceneClip(timeline[i], i, input, size, avatarAspect, clip);
    clips.push(clip);
  }

  progress(timeline.length / (timeline.length + 2), "Mixing audio");
  const voice = await buildVoiceTrack(timeline, input, total, dir);
  const mix = await buildAudioMix(voice, input.music, total, dir);

  progress((timeline.length + 1) / (timeline.length + 2), "Burning captions and encoding");
  const list = path.join(dir, "clips.txt");
  fs.writeFileSync(list, clips.map((c) => `file '${path.basename(c)}'`).join("\n"));
  fs.writeFileSync(path.join(dir, "captions.ass"), buildAss(timeline, input, size, total));

  const fonts = fontsDir();
  const subtitleFilter = `subtitles=captions.ass${fonts ? `:fontsdir='${fonts.replace(/\\/g, "/").replace(/:/g, "\\:")}'` : ""}`;
  const fadeOut = `fade=t=out:st=${round(Math.max(0, total - 0.4))}:d=0.4`;
  const tmpOut = path.join(dir, "final.mp4");
  await runFfmpeg(
    [
      "-f", "concat", "-safe", "0", "-i", "clips.txt",
      "-i", mix,
      "-vf", `${subtitleFilter},${fadeOut}`,
      "-map", "0:v", "-map", "1:a",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-t", String(round(total)),
      tmpOut,
    ],
    dir
  );
  fs.copyFileSync(tmpOut, input.outFile);

  await runFfmpeg(["-ss", String(Math.min(1, total / 2)), "-i", input.outFile, "-frames:v", "1", "-q:v", "3", input.thumbFile]);
  progress(1, "Done");
  return { duration: total };
}
