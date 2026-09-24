import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import fs from "fs";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { composeImage, generateStyledImage, IMAGE_STYLES } from "../services/image-creator.js";
import { localize, mediaPathFromUrl, mediaUrlFor, workDir } from "../services/media.js";
import { imageGenConfigured } from "../services/providers.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const imageRouter = router({
  generate: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.number(),
          /** ai = generate with an image model; photo = design on an uploaded photo; text = brand card. */
          source: z.enum(["ai", "photo", "text"]),
          prompt: z.string().max(2000).default(""),
          style: z.enum(IMAGE_STYLES as [string, ...string[]]).default("product_ad"),
          productName: z.string().max(200).optional(),
          format: z.enum(["9:16", "4:5", "1:1", "16:9"]).default("1:1"),
          count: z.number().min(1).max(4).default(1),
          photo: z.string().startsWith("/media/").optional(),
          layout: z.enum(["full", "card"]).default("full"),
          headline: z.string().max(80).optional(),
          subline: z.string().max(160).optional(),
          label: z.string().max(60).optional(),
          brandColors: z.tuple([z.string(), z.string()]).default(["#3155d8", "#1b2333"]),
        })
        .refine((v) => v.source !== "ai" || v.prompt.trim() || v.productName, "Describe the image you want")
        .refine((v) => v.source !== "photo" || v.photo, "Upload a photo to design on")
        .refine((v) => v.source !== "text" || v.headline, "Add a headline for a text card")
    )
    .mutation(async ({ input }) => {
      if (input.source === "ai" && !imageGenConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI image generation needs OPENAI_API_KEY in the server's .env. You can still design on your own photo or make a text card.",
        });
      }

      const bases: Array<string | null> = [];
      const temp: string[] = [];
      if (input.source === "ai") {
        const results = await Promise.allSettled(
          Array.from({ length: input.count }, () =>
            generateStyledImage(input.prompt, input.style, input.productName, input.format)
          )
        );
        for (const r of results) if (r.status === "fulfilled") { bases.push(r.value); temp.push(r.value); }
        if (!bases.length) {
          const reason = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Image generation failed: ${reason instanceof Error ? reason.message : String(reason)}` });
        }
      } else if (input.source === "photo") {
        const local = await localize(input.photo!, workDir).catch(() => null);
        if (!local) throw new TRPCError({ code: "BAD_REQUEST", message: "That upload could not be found; upload it again." });
        bases.push(local);
      } else {
        bases.push(null);
      }

      try {
        const images: Array<{ id: number; url: string }> = [];
        for (const base of bases) {
          const file = await composeImage({
            format: input.format,
            base,
            layout: input.source === "photo" ? input.layout : "full",
            headline: input.headline || undefined,
            subline: input.subline || undefined,
            label: input.label || undefined,
            brandColors: input.brandColors,
          });
          const url = mediaUrlFor(file);
          const result = db.insert(schema.contentItems).values({
            workspaceId: input.workspaceId,
            title: input.headline || input.productName || input.prompt.slice(0, 60) || "Image",
            kind: "image",
            format: `${input.source} ${input.format}`,
            body: input.prompt || null,
            assetUrl: url,
            disclosureStamp: input.source === "ai" ? "AI-generated image" : "Designed in studio",
            status: "ready",
          }).run();
          images.push({ id: Number(result.lastInsertRowid), url });
        }
        return { images, requested: input.source === "ai" ? input.count : 1 };
      } finally {
        for (const f of temp) fs.rmSync(f, { force: true });
      }
    }),

  list: publicProcedure.input(z.object({ workspaceId: z.number() })).query(({ input }) => {
    return db
      .select()
      .from(schema.contentItems)
      .where(and(eq(schema.contentItems.workspaceId, input.workspaceId), eq(schema.contentItems.kind, "image")))
      .orderBy(desc(schema.contentItems.id))
      .all()
      .filter((i) => i.assetUrl?.startsWith("/media/"));
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const item = db.query.contentItems.findFirst({ where: eq(schema.contentItems.id, input.id) }).sync();
    if (!item || item.kind !== "image") return { success: true };
    const file = item.assetUrl?.startsWith("/media/renders/") ? mediaPathFromUrl(item.assetUrl) : null;
    if (file) fs.rmSync(file, { force: true });
    db.delete(schema.contentItems).where(eq(schema.contentItems.id, input.id)).run();
    return { success: true };
  }),
});
