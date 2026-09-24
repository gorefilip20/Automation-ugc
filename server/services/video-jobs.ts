import { eq, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { writeVideoPlan, type VideoPlan, type VideoType } from "./ai-writer.js";
import { enqueue } from "./job-queue.js";
import { localize, mediaUrlFor, rendersDir, workDir } from "./media.js";
import {
  avatarNeedsPhoto,
  avatarProvider,
  generateImage,
  imageGenConfigured,
  renderTalkingAvatar,
  synthesizeSpeech,
  ttsProvider,
} from "./providers.js";
import { renderVideo, type AspectRatio } from "./video-renderer.js";

export interface VideoAssets {
  images?: string[];
  presenterImage?: string;
  music?: string;
}

export interface RenderOptions {
  voice?: string;
  captions?: boolean;
  brandColors?: [string, string];
  disclosure?: boolean;
  /** Generate stills with AI for scenes that have no uploaded image. */
  generateImages?: boolean;
  brandVoice?: string;
}

/** Stock photos of real people must never be animated into a talking ad. */
function isPlaceholderPortrait(url: string | null | undefined) {
  return !url || url.includes("images.unsplash.com");
}

const MAX_GENERATED_IMAGES = 6;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function update(id: number, values: Partial<typeof schema.ugcVideos.$inferInsert>) {
  db.update(schema.ugcVideos).set(values).where(eq(schema.ugcVideos.id, id)).run();
}

async function runRender(videoId: number) {
  const row = db.query.ugcVideos.findFirst({ where: eq(schema.ugcVideos.id, videoId) }).sync();
  if (!row) return;

  const log: string[] = [];
  const note = (msg: string) => {
    log.push(msg);
    update(videoId, { renderLog: JSON.stringify(log) });
  };
  const stage = (renderStage: string, renderProgress: number) =>
    update(videoId, { renderStage, renderProgress: Math.round(renderProgress) });

  const scratch = path.join(workDir, `video_${videoId}_${Date.now()}`);
  fs.mkdirSync(scratch, { recursive: true });

  try {
    update(videoId, { renderStatus: "rendering", renderError: null, renderLog: "[]", status: "generating" });
    const assets = parseJson<VideoAssets>(row.assets, {});
    const options = parseJson<RenderOptions>(row.renderOptions, {});
    const aspect = (row.aspectRatio || "9:16") as AspectRatio;
    const workspace = db.query.creatorWorkspaces
      .findFirst({ where: eq(schema.creatorWorkspaces.id, row.workspaceId) })
      .sync();

    stage("Preparing assets", 3);
    const productImages: string[] = [];
    for (const ref of assets.images ?? []) {
      try {
        productImages.push(await localize(ref, scratch));
      } catch (e) {
        note(`Skipped an image that could not be loaded: ${(e as Error).message}`);
      }
    }

    // 1. Script -----------------------------------------------------------
    let plan = parseJson<VideoPlan | null>(row.script, null);
    if (!plan?.scenes?.length || !("kind" in (plan.scenes[0] ?? {}))) {
      stage("Writing the script", 8);
      const written = await writeVideoPlan({
        videoType: row.videoType as VideoType,
        productName: row.productName || row.title,
        productDescription: row.productDescription || row.prompt || row.title,
        prompt: row.prompt || undefined,
        style: row.style,
        platform: row.platform,
        duration: row.duration || 30,
        customHook: row.hook || undefined,
        callToAction: row.callToAction || undefined,
        brandVoice: options.brandVoice || workspace?.voice,
        creatorPersona: workspace?.persona,
        productImages,
      });
      plan = written.plan;
      if (written.note) note(written.note);
      update(videoId, {
        script: JSON.stringify(plan),
        scriptSource: written.source,
        hook: plan.hook,
        scenes: JSON.stringify(plan.scenes),
        voiceoverText: plan.voiceover,
        callToAction: plan.callToAction,
        musicStyle: plan.musicSuggestion,
        captionStyle: plan.captionStyle,
      });
    }

    // 2. Presenter photo (only needed for talking avatars) -----------------
    let presenter = row.presenter;
    let presenterPhoto: string | undefined;
    if (presenter === "talking_avatar") {
      if (!avatarProvider()) {
        note("No talking-avatar provider configured (HEYGEN_API_KEY + HEYGEN_VOICE_ID, or DID_API_KEY); using a voiceover instead");
        presenter = "voiceover";
      } else {
        const profile = row.avatarProfileId
          ? db.query.avatarProfiles.findFirst({ where: eq(schema.avatarProfiles.id, row.avatarProfileId) }).sync()
          : undefined;
        if (assets.presenterImage) {
          presenterPhoto = await localize(assets.presenterImage, scratch);
        } else if (profile && !isPlaceholderPortrait(profile.imageUrl)) {
          presenterPhoto = await localize(profile.imageUrl!, scratch);
        } else if (avatarNeedsPhoto() && imageGenConfigured()) {
          stage("Creating an AI presenter", 14);
          presenterPhoto = await generateImage(
            `Photorealistic vertical selfie-style portrait of a fictional content creator looking straight into the phone camera, head and shoulders, mouth closed, soft natural light, plain home background. ${workspace?.visualAnchor ?? ""}`,
            path.join(scratch, "presenter.png"),
            "portrait"
          );
          note("Generated a fictional AI presenter portrait");
        }
        if (avatarNeedsPhoto() && !presenterPhoto) {
          note("Talking avatar needs a presenter photo (upload one, or set OPENAI_API_KEY to generate one); using a voiceover instead");
          presenter = "voiceover";
        }
      }
    }

    // 3. Scene visuals ------------------------------------------------------
    const orientation = aspect === "9:16" ? "portrait" : aspect === "1:1" ? "square" : "landscape";
    const canGenerate = options.generateImages !== false && imageGenConfigured();
    let generated = 0;
    let rotate = 0;
    const sceneImages: Array<string | null> = [];
    for (let i = 0; i < plan.scenes.length; i++) {
      const s = plan.scenes[i];
      stage(`Preparing visuals (${i + 1}/${plan.scenes.length})`, 18 + (i / plan.scenes.length) * 17);
      if (s.kind === "title" || s.kind === "cta") {
        sceneImages.push(productImages[0] ?? null);
        continue;
      }
      if (s.kind === "presenter" && presenter !== "talking_avatar" && presenterPhoto) {
        sceneImages.push(presenterPhoto);
        continue;
      }
      const wantsGenerated = canGenerate && generated < MAX_GENERATED_IMAGES &&
        (productImages.length === 0 || s.kind === "broll" || s.kind === "presenter");
      if (wantsGenerated && s.imagePrompt) {
        try {
          sceneImages.push(await generateImage(s.imagePrompt, path.join(scratch, `gen_${i}.png`), orientation));
          generated++;
          continue;
        } catch (e) {
          note(`Image generation failed for scene ${i + 1}: ${(e as Error).message}`);
        }
      }
      sceneImages.push(productImages.length ? productImages[rotate++ % productImages.length] : null);
    }
    if (generated) note(`Generated ${generated} scene image(s) with AI`);
    if (!productImages.length && !generated) note("No product photos or image generator available; scenes use branded text cards");

    // 4. Voice --------------------------------------------------------------
    let avatarVideo: string | undefined;
    let sceneAudio: Array<string | null> | undefined;

    if (presenter === "talking_avatar") {
      stage(`Rendering talking avatar with ${avatarProvider()}`, 38);
      const size = aspect === "16:9" ? { width: 1280, height: 720 } : aspect === "1:1" ? { width: 720, height: 720 } : { width: 720, height: 1280 };
      try {
        avatarVideo = await renderTalkingAvatar({
          script: plan.scenes.map((s) => s.dialogue).filter(Boolean).join(" "),
          photo: presenterPhoto,
          ...size,
          dest: path.join(scratch, "avatar.mp4"),
          onProgress: (msg) => update(videoId, { renderStage: msg }),
        });
        note(`Talking avatar rendered by ${avatarProvider()}`);
      } catch (e) {
        note(`Talking avatar failed (${(e as Error).message}); using a voiceover instead`);
        presenter = "voiceover";
      }
    }

    if (presenter === "voiceover" && !avatarVideo) {
      if (!ttsProvider()) {
        note("No text-to-speech key (ELEVENLABS_API_KEY or OPENAI_API_KEY); rendered without a voice, captions still show the script");
      } else {
        sceneAudio = [];
        for (let i = 0; i < plan.scenes.length; i++) {
          const text = plan.scenes[i].dialogue.trim();
          stage(`Recording voiceover (${i + 1}/${plan.scenes.length})`, 38 + (i / plan.scenes.length) * 17);
          if (!text) {
            sceneAudio.push(null);
            continue;
          }
          try {
            sceneAudio.push(await synthesizeSpeech(text, path.join(scratch, `vo_${i}.mp3`), options.voice));
          } catch (e) {
            note(`Voiceover failed for scene ${i + 1}: ${(e as Error).message}`);
            sceneAudio.push(null);
          }
        }
        if (sceneAudio.some(Boolean)) note(`Voiceover recorded with ${ttsProvider()}`);
      }
    }

    const music = assets.music ? await localize(assets.music, scratch).catch(() => undefined) : undefined;

    // 5. Compose --------------------------------------------------------------
    const stamp = Date.now();
    const outFile = path.join(rendersDir, `video_${videoId}_${stamp}.mp4`);
    const thumbFile = path.join(rendersDir, `video_${videoId}_${stamp}.jpg`);
    const disclosureOn = options.disclosure ?? (workspace?.disclosureEnabled ?? 1) === 1;
    const { duration } = await renderVideo({
      plan,
      aspectRatio: aspect,
      sceneImages,
      sceneAudio,
      avatarVideo,
      music,
      captions: options.captions !== false,
      brandColors: options.brandColors ?? ["#3155d8", "#1b2333"],
      disclosure: disclosureOn ? (presenter === "talking_avatar" ? "AI-generated creator · #ad" : "#ad") : undefined,
      scratchDir: scratch,
      outFile,
      thumbFile,
      onProgress: (f, s) => stage(s, 56 + f * 43),
    });

    const videoUrl = mediaUrlFor(outFile);
    const thumbnailUrl = mediaUrlFor(thumbFile);
    update(videoId, {
      renderStatus: "ready",
      renderStage: "Done",
      renderProgress: 100,
      status: "ready",
      videoUrl,
      thumbnailUrl,
      presenter: presenter as "none" | "voiceover" | "talking_avatar",
      duration: Math.round(duration),
    });
    db.insert(schema.contentItems)
      .values({
        workspaceId: row.workspaceId,
        avatarProfileId: row.avatarProfileId,
        title: row.title,
        kind: "video",
        channel: row.platform,
        format: `${row.videoType} ${aspect} (${Math.round(duration)}s)`,
        body: plan.postCaption || plan.voiceover,
        assetUrl: videoUrl,
        status: "ready",
      })
      .run();
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[render] video ${videoId} failed:`, message);
    update(videoId, { renderStatus: "failed", renderError: message.slice(0, 2000), status: "failed" });
  }
}

export function queueRender(videoId: number) {
  update(videoId, { renderStatus: "queued", renderStage: "Waiting in queue", renderProgress: 0, renderError: null });
  enqueue(`video:${videoId}`, () => runRender(videoId));
}

/** Re-queue renders that were interrupted by a server restart. */
export function resumeInterruptedRenders() {
  const stuck = db
    .select({ id: schema.ugcVideos.id })
    .from(schema.ugcVideos)
    .where(inArray(schema.ugcVideos.renderStatus, ["queued", "rendering"]))
    .all();
  for (const { id } of stuck) queueRender(id);
}
