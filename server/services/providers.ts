import fs from "fs";
import path from "path";
import { downloadTo } from "./media.js";

/**
 * Third-party generation providers. Each one is optional: the render pipeline
 * checks what is configured and falls back (e.g. no TTS key means a silent
 * video with captions and music) instead of failing.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function expectOk(res: Response, what: string) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new Error(`${what} failed (${res.status}): ${body.slice(0, 400)}`);
}

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------

export type TtsProvider = "elevenlabs" | "openai";

export function ttsProvider(): TtsProvider | null {
  const forced = process.env.TTS_PROVIDER as TtsProvider | undefined;
  if (forced === "elevenlabs" && process.env.ELEVENLABS_API_KEY) return forced;
  if (forced === "openai" && process.env.OPENAI_API_KEY) return forced;
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/** Synthesize `text` to an mp3 at `dest`. `voice` is provider specific. */
export async function synthesizeSpeech(
  text: string,
  dest: string,
  voice?: string
): Promise<string> {
  const provider = ttsProvider();
  if (!provider) throw new Error("No text-to-speech provider configured");

  if (provider === "elevenlabs") {
    const voiceId =
      voice || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        }),
      }
    );
    await expectOk(res, "ElevenLabs text-to-speech");
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: voice || process.env.OPENAI_TTS_VOICE || "nova",
      input: text,
      instructions:
        "Speak like a genuine content creator filming a casual phone video: warm, upbeat, conversational.",
      response_format: "mp3",
    }),
  });
  await expectOk(res, "OpenAI text-to-speech");
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// ---------------------------------------------------------------------------
// Image generation (scene stills and AI creator portraits)
// ---------------------------------------------------------------------------

export function imageGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateImage(
  prompt: string,
  dest: string,
  orientation: "portrait" | "square" | "landscape" = "portrait"
): Promise<string> {
  if (!imageGenConfigured()) throw new Error("No image provider configured");
  const size = {
    portrait: "1024x1536",
    square: "1024x1024",
    landscape: "1536x1024",
  }[orientation];
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size,
      n: 1,
    }),
  });
  await expectOk(res, "OpenAI image generation");
  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = json.data?.[0];
  if (item?.b64_json) {
    fs.writeFileSync(dest, Buffer.from(item.b64_json, "base64"));
    return dest;
  }
  if (item?.url) return downloadTo(item.url, dest);
  throw new Error("Image provider returned no image");
}

// ---------------------------------------------------------------------------
// Talking avatars (a photo of a presenter + a script -> lip-synced video)
// ---------------------------------------------------------------------------

export type AvatarProvider = "heygen" | "did";

export function avatarProvider(): AvatarProvider | null {
  const forced = process.env.AVATAR_PROVIDER as AvatarProvider | undefined;
  const heygenReady = Boolean(
    process.env.HEYGEN_API_KEY && process.env.HEYGEN_VOICE_ID
  );
  const didReady = Boolean(process.env.DID_API_KEY);
  if (forced === "heygen" && heygenReady) return "heygen";
  if (forced === "did" && didReady) return "did";
  if (heygenReady) return "heygen";
  if (didReady) return "did";
  return null;
}

/** HeyGen can use one of its stock avatars, so a photo is optional there. */
export function avatarNeedsPhoto(): boolean {
  return !(avatarProvider() === "heygen" && process.env.HEYGEN_AVATAR_ID);
}

export interface TalkingAvatarRequest {
  script: string;
  /** Local image of the presenter's face. */
  photo?: string;
  width: number;
  height: number;
  dest: string;
  onProgress?: (message: string) => void;
}

const POLL_MS = 5000;
const POLL_LIMIT_MS = 20 * 60 * 1000;

async function heygenTalkingAvatar(req: TalkingAvatarRequest): Promise<string> {
  const key = process.env.HEYGEN_API_KEY!;
  let character: Record<string, string>;

  if (req.photo) {
    const ext = path.extname(req.photo).toLowerCase();
    const upload = await fetch("https://upload.heygen.com/v1/talking_photo", {
      method: "POST",
      headers: {
        "X-Api-Key": key,
        "Content-Type": ext === ".png" ? "image/png" : "image/jpeg",
      },
      body: fs.readFileSync(req.photo),
    });
    await expectOk(upload, "HeyGen photo upload");
    const uploaded = (await upload.json()) as {
      data?: { talking_photo_id?: string };
    };
    const id = uploaded.data?.talking_photo_id;
    if (!id) throw new Error("HeyGen did not return a talking_photo_id");
    character = { type: "talking_photo", talking_photo_id: id };
  } else if (process.env.HEYGEN_AVATAR_ID) {
    character = {
      type: "avatar",
      avatar_id: process.env.HEYGEN_AVATAR_ID,
      avatar_style: "normal",
    };
  } else {
    throw new Error("HeyGen needs a presenter photo or HEYGEN_AVATAR_ID");
  }

  const create = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [
        {
          character,
          voice: {
            type: "text",
            input_text: req.script,
            voice_id: process.env.HEYGEN_VOICE_ID,
          },
        },
      ],
      dimension: { width: req.width, height: req.height },
    }),
  });
  await expectOk(create, "HeyGen video generation");
  const created = (await create.json()) as { data?: { video_id?: string } };
  const videoId = created.data?.video_id;
  if (!videoId) throw new Error("HeyGen did not return a video_id");

  const started = Date.now();
  while (Date.now() - started < POLL_LIMIT_MS) {
    await sleep(POLL_MS);
    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: { "X-Api-Key": key } }
    );
    await expectOk(res, "HeyGen status check");
    const status = (await res.json()) as {
      data?: { status?: string; video_url?: string; error?: unknown };
    };
    const s = status.data?.status;
    req.onProgress?.(`HeyGen: ${s ?? "waiting"}`);
    if (s === "completed" && status.data?.video_url)
      return downloadTo(status.data.video_url, req.dest);
    if (s === "failed")
      throw new Error(`HeyGen render failed: ${JSON.stringify(status.data?.error)}`);
  }
  throw new Error("HeyGen render timed out");
}

async function didTalkingAvatar(req: TalkingAvatarRequest): Promise<string> {
  if (!req.photo) throw new Error("D-ID needs a presenter photo");
  const auth = { Authorization: `Basic ${process.env.DID_API_KEY}` };

  const form = new FormData();
  const ext = path.extname(req.photo).toLowerCase();
  form.append(
    "image",
    new Blob([fs.readFileSync(req.photo)], {
      type: ext === ".png" ? "image/png" : "image/jpeg",
    }),
    path.basename(req.photo)
  );
  const upload = await fetch("https://api.d-id.com/images", {
    method: "POST",
    headers: auth,
    body: form,
  });
  await expectOk(upload, "D-ID photo upload");
  const { url: sourceUrl } = (await upload.json()) as { url?: string };
  if (!sourceUrl) throw new Error("D-ID did not return an image url");

  const create = await fetch("https://api.d-id.com/talks", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      source_url: sourceUrl,
      script: {
        type: "text",
        input: req.script,
        provider: {
          type: "microsoft",
          voice_id: process.env.DID_VOICE_ID || "en-US-JennyNeural",
        },
      },
      config: { stitch: true },
    }),
  });
  await expectOk(create, "D-ID talk creation");
  const { id } = (await create.json()) as { id?: string };
  if (!id) throw new Error("D-ID did not return a talk id");

  const started = Date.now();
  while (Date.now() - started < POLL_LIMIT_MS) {
    await sleep(POLL_MS);
    const res = await fetch(`https://api.d-id.com/talks/${id}`, { headers: auth });
    await expectOk(res, "D-ID status check");
    const talk = (await res.json()) as {
      status?: string;
      result_url?: string;
      error?: unknown;
    };
    req.onProgress?.(`D-ID: ${talk.status ?? "waiting"}`);
    if (talk.status === "done" && talk.result_url)
      return downloadTo(talk.result_url, req.dest);
    if (talk.status === "error" || talk.status === "rejected")
      throw new Error(`D-ID render failed: ${JSON.stringify(talk.error)}`);
  }
  throw new Error("D-ID render timed out");
}

export async function renderTalkingAvatar(
  req: TalkingAvatarRequest
): Promise<string> {
  const provider = avatarProvider();
  if (provider === "heygen") return heygenTalkingAvatar(req);
  if (provider === "did") return didTalkingAvatar(req);
  throw new Error("No talking-avatar provider configured");
}
