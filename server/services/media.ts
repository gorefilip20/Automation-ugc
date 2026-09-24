import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { dataDir } from "../db.js";

const require = createRequire(import.meta.url);

// Everything under mediaDir is served publicly at /media, so keep the SQLite
// database and anything private out of it.
export const mediaDir = path.join(dataDir, "media");
export const uploadsDir = path.join(mediaDir, "uploads");
export const rendersDir = path.join(mediaDir, "renders");
export const workDir = path.join(dataDir, "work");
for (const dir of [mediaDir, uploadsDir, rendersDir, workDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const MEDIA_URL_PREFIX = "/media/";

export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const bundled = require("ffmpeg-static") as string | null;
  return bundled || "ffmpeg";
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export function extensionFor(mimeType: string, fallbackName = ""): string {
  return (
    EXT_BY_MIME[mimeType.toLowerCase()] ||
    path.extname(fallbackName).toLowerCase() ||
    ".bin"
  );
}

export function mediaUrlFor(absPath: string): string {
  const rel = path.relative(mediaDir, absPath).split(path.sep).join("/");
  return MEDIA_URL_PREFIX + rel;
}

/** Resolve a /media/... URL back to a file on disk, refusing path escapes. */
export function mediaPathFromUrl(url: string): string | null {
  if (!url.startsWith(MEDIA_URL_PREFIX)) return null;
  const abs = path.resolve(mediaDir, url.slice(MEDIA_URL_PREFIX.length));
  if (!abs.startsWith(mediaDir + path.sep)) return null;
  return fs.existsSync(abs) ? abs : null;
}

export function saveUpload(b64: string, mimeType: string, fileName: string) {
  const data = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const file = path.join(
    uploadsDir,
    `${uuidv4()}${extensionFor(mimeType, fileName)}`
  );
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  return { path: file, url: mediaUrlFor(file) };
}

export async function downloadTo(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/**
 * Turn anything the pipeline is handed (a /media URL, an http(s) URL or a
 * local path) into a local file path.
 */
export async function localize(ref: string, scratch: string): Promise<string> {
  const media = mediaPathFromUrl(ref);
  if (media) return media;
  if (/^https?:\/\//i.test(ref)) {
    const ext = path.extname(new URL(ref).pathname) || ".jpg";
    return downloadTo(ref, path.join(scratch, `${uuidv4()}${ext}`));
  }
  if (fs.existsSync(ref)) return ref;
  throw new Error(`Asset not found: ${ref}`);
}

export function runFfmpeg(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-y", ...args], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else
        reject(
          new Error(`ffmpeg exited with ${code}: ${stderr.slice(-1500).trim()}`)
        );
    });
  });
}

/** Media duration in seconds, read from ffmpeg's input banner. */
export async function probeDuration(file: string): Promise<number> {
  const stderr: string = await new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-i", file], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let out = "";
    proc.stderr.on("data", (c) => (out += c.toString()));
    proc.on("close", () => resolve(out));
    proc.on("error", () => resolve(out));
  });
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Could not read duration of ${path.basename(file)}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function hasAudioStream(file: string): Promise<boolean> {
  const stderr: string = await new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-i", file], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let out = "";
    proc.stderr.on("data", (c) => (out += c.toString()));
    proc.on("close", () => resolve(out));
    proc.on("error", () => resolve(out));
  });
  return /Stream #\d+:\d+.*Audio:/.test(stderr);
}
