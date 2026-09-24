import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import fs from "fs";
import path from "path";
import { z } from "zod/v4";
import { generateUGCScript, type UGCVideoScript } from "./ugc-generator.js";

export type VideoType = "ugc" | "launch" | "custom";
export type SceneKind = "presenter" | "product" | "title" | "broll" | "cta";

export interface PlanScene {
  sceneNumber: number;
  kind: SceneKind;
  durationSeconds: number;
  duration: string;
  visual: string;
  imagePrompt: string;
  dialogue: string;
  textOverlay: string;
  headline: string;
  transition: string;
}

/** Superset of the original UGCVideoScript so existing UI keeps working. */
export interface VideoPlan extends Omit<UGCVideoScript, "scenes"> {
  title: string;
  scenes: PlanScene[];
  hashtags: string[];
  postCaption: string;
}

export interface WriterInput {
  videoType: VideoType;
  productName: string;
  productDescription: string;
  prompt?: string;
  style?: string;
  platform: string;
  duration: number;
  customHook?: string;
  callToAction?: string;
  brandVoice?: string;
  creatorPersona?: string;
  /** Local image files of the product, shown to Claude so the script matches. */
  productImages?: string[];
}

const SceneSchema = z.object({
  kind: z
    .enum(["presenter", "product", "title", "broll", "cta"])
    .describe(
      "presenter = creator talking to camera; product = product hero shot; title = bold text card; broll = lifestyle/context shot; cta = closing call-to-action card"
    ),
  durationSeconds: z.number().describe("Length of this scene in seconds"),
  visual: z.string().describe("Direction for what is on screen"),
  imagePrompt: z
    .string()
    .describe(
      "A standalone prompt for an image generator that would produce this scene's still, vertical framing, photorealistic unless it is a title/cta card"
    ),
  dialogue: z
    .string()
    .describe(
      "Exactly what is spoken aloud in this scene. Natural spoken English, no stage directions, no emojis, no hashtags. Empty string for silent scenes."
    ),
  onScreenText: z
    .string()
    .describe("Short text overlay, max 6 words"),
  headline: z
    .string()
    .describe(
      "For title and cta scenes: the big headline, max 5 words. Empty string for other kinds."
    ),
});

const PlanSchema = z.object({
  title: z.string(),
  hook: z.string().describe("The first spoken line; must stop the scroll"),
  scenes: z.array(SceneSchema),
  callToAction: z.string(),
  musicSuggestion: z.string(),
  hashtags: z.array(z.string()),
  postCaption: z
    .string()
    .describe("Caption to post alongside the video on the platform"),
});

const SYSTEM_PROMPT = `You are a short-form video creative director who writes scripts that get rendered straight into finished videos by an automated pipeline.

The pipeline reads your scenes literally:
- "dialogue" is fed to a text-to-speech voice or a talking AI avatar, so write only the words to be spoken. Speak at about 2.5 words per second, so a 6 second scene holds roughly 15 words.
- "onScreenText" and "headline" are burned into the video as captions and title cards.
- "imagePrompt" may be sent to an image generator when the user did not upload enough product photos, so make each one self-contained and describe the product consistently across scenes.

Write like a real person on TikTok or Reels, not like an ad agency. Specific beats generic. Never invent medical, financial or performance claims the user did not give you; keep claims to what the product description supports. The scene durations must add up to the requested total length.`;

function describeRequest(input: WriterInput): string {
  const lines = [
    `Video type: ${
      {
        ugc: "UGC creator ad (one relatable creator talking about the product)",
        launch:
          "Product launch video (announce something new: teaser, reveal, key features, availability, CTA)",
        custom: "Custom video, follow the brief below",
      }[input.videoType]
    }`,
    `Product: ${input.productName}`,
    `What it is: ${input.productDescription}`,
    `Platform: ${input.platform}`,
    `Total length: ${input.duration} seconds`,
  ];
  if (input.style) lines.push(`Style: ${input.style.replace(/_/g, " ")}`);
  if (input.prompt) lines.push(`Brief from the user: ${input.prompt}`);
  if (input.customHook) lines.push(`Open with this hook: ${input.customHook}`);
  if (input.callToAction)
    lines.push(`Close with this call to action: ${input.callToAction}`);
  if (input.brandVoice) lines.push(`Brand voice: ${input.brandVoice}`);
  if (input.creatorPersona)
    lines.push(`The on-camera creator's persona: ${input.creatorPersona}`);
  if (input.videoType === "launch")
    lines.push(
      "Start with a title scene, include at least one product scene per key feature, and end with a cta scene."
    );
  if (input.videoType === "ugc")
    lines.push(
      "Most scenes should be presenter scenes, with product close-ups cut in, and a short cta scene at the end."
    );
  if (input.productImages?.length)
    lines.push(
      "The attached photos are the real product. Describe it accurately."
    );
  return lines.join("\n");
}

const IMAGE_MIME: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function imageBlocks(files: string[] = []): Anthropic.Beta.BetaImageBlockParam[] {
  return files
    .filter((f) => IMAGE_MIME[path.extname(f).toLowerCase()])
    .slice(0, 4)
    .map((f) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: IMAGE_MIME[path.extname(f).toLowerCase()],
        data: fs.readFileSync(f).toString("base64"),
      },
    }));
}

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const TRANSITIONS = ["Smooth cut", "Jump cut", "Swipe transition", "Cross dissolve"];

/** Stretch or squeeze scene lengths so they add up to the requested total. */
function normalizeDurations(scenes: PlanScene[], total: number): PlanScene[] {
  const sum = scenes.reduce((a, s) => a + Math.max(1, s.durationSeconds), 0);
  const factor = sum > 0 ? total / sum : 1;
  return scenes.map((s, i) => {
    const d = Math.max(1.5, Math.round(Math.max(1, s.durationSeconds) * factor * 10) / 10);
    return {
      ...s,
      sceneNumber: i + 1,
      durationSeconds: d,
      duration: `${d}s`,
      transition: i === scenes.length - 1 ? "Fade to black" : TRANSITIONS[i % 4],
    };
  });
}

async function writeWithClaude(input: WriterInput): Promise<VideoPlan> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    max_tokens: 16000,
    // Short creative writing does not need deep reasoning; medium keeps
    // generation fast. Override with ANTHROPIC_EFFORT if quality lags.
    output_config: {
      effort: (process.env.ANTHROPIC_EFFORT as "low" | "medium" | "high") || "medium",
      format: betaZodOutputFormat(PlanSchema),
    },
    // If a request is declined by a safety classifier, retry it server-side
    // on Anthropic's recommended fallback model instead of failing the render.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks(input.productImages),
          { type: "text", text: describeRequest(input) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to write this script. Try rewording the brief.");
  }
  const parsed = response.parsed_output;
  if (!parsed || parsed.scenes.length === 0) {
    throw new Error(`Claude returned no usable script (stop_reason: ${response.stop_reason})`);
  }

  const scenes = normalizeDurations(
    parsed.scenes.map((s, i) => ({
      sceneNumber: i + 1,
      kind: s.kind,
      durationSeconds: s.durationSeconds,
      duration: "",
      visual: s.visual,
      imagePrompt: s.imagePrompt,
      dialogue: s.dialogue,
      textOverlay: s.onScreenText,
      headline: s.headline,
      transition: "",
    })),
    input.duration
  );

  return {
    title: parsed.title,
    hook: input.customHook || parsed.hook,
    scenes,
    voiceover: scenes.map((s) => s.dialogue).filter(Boolean).join(" "),
    callToAction: input.callToAction || parsed.callToAction,
    musicSuggestion: parsed.musicSuggestion,
    captionStyle: captionStyleFor(input.platform),
    totalDuration: `${input.duration}s`,
    hashtags: parsed.hashtags,
    postCaption: parsed.postCaption,
  };
}

function captionStyleFor(platform: string): string {
  return (
    {
      instagram: "9:16 Reels format, dynamic captions with brand colors",
      tiktok: "9:16 vertical, TikTok-native text overlays, trending sounds",
      youtube_shorts: "9:16 vertical, clean captions, subscribe prompt end screen",
      facebook: "1:1 or 4:5, bold captions, share-friendly format",
    }[platform] || "9:16 vertical, bold captions"
  );
}

/** Offline fallback so rendering still works with no API key configured. */
function writeFromTemplate(input: WriterInput): VideoPlan {
  const name = input.productName;
  const tag = `#${name.replace(/[^a-z0-9]/gi, "")}`;
  let scenes: PlanScene[];
  let hook: string;
  let cta: string;

  if (input.videoType === "ugc") {
    const script = generateUGCScript({
      productName: name,
      productDescription: input.productDescription,
      style: input.style || "testimonial",
      platform: input.platform,
      duration: input.duration,
      customHook: input.customHook,
      callToAction: input.callToAction,
    });
    hook = script.hook;
    cta = script.callToAction;
    const kinds: SceneKind[] = ["presenter", "product", "presenter", "presenter"];
    scenes = [
      ...script.scenes.map((s, i) => ({
        ...s,
        kind: kinds[i] ?? "presenter",
        durationSeconds: parseFloat(s.duration) || 5,
        imagePrompt: `${s.visual}, featuring ${name}, ${input.productDescription}, vertical smartphone photo`,
        dialogue: i === 0 ? `${hook} ${s.dialogue}` : s.dialogue,
        headline: "",
      })),
      {
        sceneNumber: script.scenes.length + 1,
        kind: "cta" as const,
        durationSeconds: 3,
        duration: "3s",
        visual: "End card",
        imagePrompt: "",
        dialogue: "",
        textOverlay: "Link in bio",
        headline: name,
        transition: "",
      },
    ];
  } else {
    const brief = input.prompt || input.productDescription;
    hook = input.customHook || `Meet ${name}.`;
    cta = input.callToAction || `Get ${name} today.`;
    scenes = [
      {
        sceneNumber: 1, kind: "title", durationSeconds: 3, duration: "", visual: "Bold title card",
        imagePrompt: "", dialogue: hook, textOverlay: "", headline: input.videoType === "launch" ? "Introducing" : name, transition: "",
      },
      {
        sceneNumber: 2, kind: "product", durationSeconds: 5, duration: "", visual: `${name} hero shot`,
        imagePrompt: `Studio hero shot of ${name}, ${input.productDescription}, soft light`,
        dialogue: `This is ${name}. ${input.productDescription}.`, textOverlay: name, headline: "", transition: "",
      },
      {
        sceneNumber: 3, kind: "broll", durationSeconds: 5, duration: "", visual: `${name} in everyday use`,
        imagePrompt: `Lifestyle photo of someone using ${name}, natural light`,
        dialogue: `Built for ${brief.toLowerCase().replace(/\.$/, "")}.`, textOverlay: "Made for everyday", headline: "", transition: "",
      },
      {
        sceneNumber: 4, kind: "product", durationSeconds: 5, duration: "", visual: `Close-up detail of ${name}`,
        imagePrompt: `Macro detail shot of ${name}`,
        dialogue: `Every detail is designed to just work.`, textOverlay: "Every detail matters", headline: "", transition: "",
      },
      {
        sceneNumber: 5, kind: "cta", durationSeconds: 4, duration: "", visual: "End card",
        imagePrompt: "", dialogue: cta, textOverlay: "", headline: input.videoType === "launch" ? "Available now" : name, transition: "",
      },
    ];
  }

  scenes = normalizeDurations(scenes, input.duration);
  return {
    title: `${name} ${input.videoType === "launch" ? "launch" : "video"}`,
    hook,
    scenes,
    voiceover: scenes.map((s) => s.dialogue).filter(Boolean).join(" "),
    callToAction: cta,
    musicSuggestion: "Upbeat modern pop instrumental",
    captionStyle: captionStyleFor(input.platform),
    totalDuration: `${input.duration}s`,
    hashtags: [tag, "#ad", "#new"],
    postCaption: `${hook} ${cta}`,
  };
}

export async function writeVideoPlan(
  input: WriterInput
): Promise<{ plan: VideoPlan; source: "claude" | "template"; note?: string }> {
  if (!claudeConfigured()) {
    return {
      plan: writeFromTemplate(input),
      source: "template",
      note: "ANTHROPIC_API_KEY not set, used the built-in script templates",
    };
  }
  try {
    return { plan: await writeWithClaude(input), source: "claude" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ai-writer] Claude failed, falling back to templates:", message);
    return {
      plan: writeFromTemplate(input),
      source: "template",
      note: `Claude script generation failed (${message}), used templates instead`,
    };
  }
}
