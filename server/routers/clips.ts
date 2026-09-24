import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import fs from "fs";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { queueClipProject } from "../services/clipper.js";
import { queuePosition } from "../services/job-queue.js";
import { mediaPathFromUrl } from "../services/media.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

function parseJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function withClips(project: typeof schema.clipProjects.$inferSelect) {
  const { transcript, ...rest } = project;
  const clips = db
    .select()
    .from(schema.clips)
    .where(eq(schema.clips.projectId, project.id))
    .orderBy(desc(schema.clips.score))
    .all()
    .map((c) => ({ ...c, hashtags: parseJson<string[]>(c.hashtags, []) }));
  return {
    ...rest,
    hasTranscript: Boolean(transcript),
    options: parseJson<Record<string, unknown>>(project.options, {}),
    log: parseJson<string[]>(project.log, []),
    queuePosition: queuePosition(`clips:${project.id}`),
    clips,
  };
}

export const clipsRouter = router({
  create: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.number(),
          title: z.string().min(1),
          sourceUrl: z.string().url().optional(),
          /** An uploaded recording, as returned by video.uploadAsset. */
          sourceFile: z.string().startsWith("/media/").optional(),
          context: z.string().max(2000).optional(),
          clipCount: z.number().min(1).max(15).default(5),
          minSeconds: z.number().min(5).max(120).default(15),
          maxSeconds: z.number().min(8).max(180).default(45),
          aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
          layout: z.enum(["fit", "crop"]).default("fit"),
          captions: z.boolean().default(true),
          hookBanner: z.boolean().default(true),
          disclosure: z.string().max(80).optional(),
        })
        .refine((v) => v.sourceUrl || v.sourceFile, "Add a video link or upload a recording")
        .refine((v) => v.maxSeconds >= v.minSeconds, "Max length must be at least the min length")
    )
    .mutation(({ input }) => {
      const { workspaceId, title, sourceUrl, sourceFile, context, ...options } = input;
      const result = db
        .insert(schema.clipProjects)
        .values({ workspaceId, title, sourceUrl, sourceFile, context, options: JSON.stringify(options) })
        .run();
      const id = Number(result.lastInsertRowid);
      queueClipProject(id);
      return { id };
    }),

  rerun: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const project = db.query.clipProjects.findFirst({ where: eq(schema.clipProjects.id, input.id) }).sync();
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Clip project not found" });
    if (project.status === "queued" || project.status === "processing") return { id: project.id };
    queueClipProject(project.id);
    return { id: project.id };
  }),

  get: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    const project = db.query.clipProjects.findFirst({ where: eq(schema.clipProjects.id, input.id) }).sync();
    return project ? withClips(project) : null;
  }),

  list: publicProcedure.input(z.object({ workspaceId: z.number() })).query(({ input }) => {
    return db
      .select()
      .from(schema.clipProjects)
      .where(eq(schema.clipProjects.workspaceId, input.workspaceId))
      .orderBy(desc(schema.clipProjects.id))
      .all()
      .map(withClips);
  }),

  deleteClip: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const clip = db.query.clips.findFirst({ where: eq(schema.clips.id, input.id) }).sync();
    if (!clip) return { success: true };
    for (const url of [clip.videoUrl, clip.thumbnailUrl]) {
      const file = url ? mediaPathFromUrl(url) : null;
      if (file) fs.rmSync(file, { force: true });
    }
    db.delete(schema.clips).where(eq(schema.clips.id, input.id)).run();
    return { success: true };
  }),
});
