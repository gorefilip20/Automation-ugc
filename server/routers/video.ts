import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import fs from "fs";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { claudeConfigured } from "../services/ai-writer.js";
import { queuePosition } from "../services/job-queue.js";
import { ffmpegPath, mediaPathFromUrl, saveUpload } from "../services/media.js";
import {
  avatarNeedsPhoto,
  avatarProvider,
  imageGenConfigured,
  ttsProvider,
} from "../services/providers.js";
import { transcriptionConfigured, ytDlpAvailable } from "../services/clipper.js";
import { queueRender } from "../services/video-jobs.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

const UGC_STYLES = [
  "testimonial", "unboxing", "tutorial", "review", "lifestyle",
  "before_after", "day_in_life", "get_ready", "haul", "storytelling",
] as const;

const ALLOWED_UPLOADS = /^(image\/(jpeg|png|webp)|audio\/(mpeg|mp3|wav|x-wav|mp4|aac)|video\/(mp4|quicktime|webm))$/i;

const mediaRef = z
  .string()
  .refine((v) => v.startsWith("/media/") || /^https?:\/\//.test(v), "Must be an uploaded /media URL or an http(s) URL");

function parseVideo(row: typeof schema.ugcVideos.$inferSelect) {
  const safe = (raw: string | null) => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  return {
    ...row,
    script: safe(row.script),
    scenes: safe(row.scenes) ?? [],
    assets: safe(row.assets) ?? {},
    renderOptions: safe(row.renderOptions) ?? {},
    renderLog: (safe(row.renderLog) as string[] | null) ?? [],
    queuePosition: queuePosition(`video:${row.id}`),
  };
}

export const videoRouter = router({
  /** What this install can actually do, based on the configured API keys. */
  capabilities: publicProcedure.query(() => {
    const ffmpeg = ffmpegPath();
    return {
      rendering: ffmpeg === "ffmpeg" || fs.existsSync(ffmpeg),
      scriptWriter: claudeConfigured() ? "claude" : "templates",
      voiceover: ttsProvider(),
      talkingAvatar: avatarProvider(),
      talkingAvatarNeedsPhoto: avatarNeedsPhoto(),
      imageGeneration: imageGenConfigured() ? "openai" : null,
      transcription: transcriptionConfigured() ? "openai" : null,
      urlDownloads: ytDlpAvailable() ? "yt-dlp + direct links" : "direct links only",
    };
  }),

  uploadAsset: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        mimeType: z.string().regex(ALLOWED_UPLOADS, "Unsupported file type"),
        b64: z.string().min(1),
      })
    )
    .mutation(({ input }) => {
      const saved = saveUpload(input.b64, input.mimeType, input.fileName);
      return { url: saved.url };
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        videoType: z.enum(["ugc", "launch", "custom"]),
        title: z.string().min(1),
        productName: z.string().min(1),
        productDescription: z.string().default(""),
        prompt: z.string().optional(),
        style: z.enum(UGC_STYLES).default("testimonial"),
        platform: z.enum(["instagram", "tiktok", "youtube_shorts", "facebook"]).default("tiktok"),
        duration: z.number().min(8).max(180).default(30),
        aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
        presenter: z.enum(["none", "voiceover", "talking_avatar"]).default("voiceover"),
        avatarProfileId: z.number().optional(),
        customHook: z.string().optional(),
        callToAction: z.string().optional(),
        images: z.array(mediaRef).max(12).default([]),
        presenterImage: mediaRef.optional(),
        /** Required when a real person's photo is uploaded as the presenter. */
        presenterConsent: z.boolean().default(false),
        music: mediaRef.optional(),
        voice: z.string().optional(),
        captions: z.boolean().default(true),
        disclosure: z.boolean().default(true),
        generateImages: z.boolean().default(true),
        brandColors: z.tuple([z.string(), z.string()]).optional(),
        brandVoice: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      if (input.presenterImage && !input.presenterConsent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirm you have the right to use the presenter's likeness before animating their photo.",
        });
      }
      if (input.videoType === "custom" && !input.prompt?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Describe the video you want in the prompt." });
      }
      const result = db
        .insert(schema.ugcVideos)
        .values({
          workspaceId: input.workspaceId,
          avatarProfileId: input.avatarProfileId,
          title: input.title,
          script: "",
          style: input.videoType === "ugc" ? input.style : input.videoType === "launch" ? "product_launch" : "custom",
          platform: input.platform,
          duration: input.duration,
          productName: input.productName,
          productDescription: input.productDescription || input.prompt || input.productName,
          callToAction: input.callToAction,
          hook: input.customHook,
          status: "generating",
          videoType: input.videoType,
          presenter: input.presenter,
          aspectRatio: input.aspectRatio,
          prompt: input.prompt,
          assets: JSON.stringify({ images: input.images, presenterImage: input.presenterImage, music: input.music }),
          renderOptions: JSON.stringify({
            voice: input.voice,
            captions: input.captions,
            disclosure: input.disclosure,
            generateImages: input.generateImages,
            brandColors: input.brandColors,
            brandVoice: input.brandVoice,
          }),
        })
        .run();
      const id = Number(result.lastInsertRowid);
      queueRender(id);
      return { id };
    }),

  /** Render (or re-render) an existing video, e.g. a script-only one from the builder. */
  render: protectedProcedure
    .input(z.object({ id: z.number(), rewriteScript: z.boolean().default(false) }))
    .mutation(({ input }) => {
      const row = db.query.ugcVideos.findFirst({ where: eq(schema.ugcVideos.id, input.id) }).sync();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      if (row.renderStatus === "queued" || row.renderStatus === "rendering") return { id: row.id };
      if (input.rewriteScript) {
        db.update(schema.ugcVideos).set({ script: "" }).where(eq(schema.ugcVideos.id, row.id)).run();
      }
      queueRender(row.id);
      return { id: row.id };
    }),

  get: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    const row = db.query.ugcVideos.findFirst({ where: eq(schema.ugcVideos.id, input.id) }).sync();
    return row ? parseVideo(row) : null;
  }),

  list: publicProcedure.input(z.object({ workspaceId: z.number() })).query(({ input }) => {
    return db
      .select()
      .from(schema.ugcVideos)
      .where(eq(schema.ugcVideos.workspaceId, input.workspaceId))
      .orderBy(desc(schema.ugcVideos.createdAt), desc(schema.ugcVideos.id))
      .all()
      .map(parseVideo);
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const row = db.query.ugcVideos.findFirst({ where: eq(schema.ugcVideos.id, input.id) }).sync();
    if (!row) return { success: true };
    if (row.renderStatus === "queued" || row.renderStatus === "rendering") {
      throw new TRPCError({ code: "CONFLICT", message: "Wait for the render to finish before deleting it." });
    }
    for (const url of [row.videoUrl, row.thumbnailUrl]) {
      const file = url ? mediaPathFromUrl(url) : null;
      if (file) fs.rmSync(file, { force: true });
    }
    db.delete(schema.ugcVideos).where(eq(schema.ugcVideos.id, input.id)).run();
    return { success: true };
  }),
});
