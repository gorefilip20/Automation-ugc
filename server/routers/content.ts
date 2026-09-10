import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const contentRouter = router({
  list: publicProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      if (!input.workspaceId) return [];
      return db.query.contentItems.findMany({
        where: eq(schema.contentItems.workspaceId, input.workspaceId),
        orderBy: (items, { desc }) => [desc(items.createdAt)],
      });
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.query.contentItems.findFirst({
        where: eq(schema.contentItems.id, input.id),
      });
    }),

  createExport: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        title: z.string(),
        channel: z.string(),
        format: z.string(),
        caption: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = db
        .insert(schema.contentItems)
        .values({
          workspaceId: input.workspaceId,
          title: input.title,
          kind: "export",
          channel: input.channel,
          format: input.format,
          body: input.caption,
          status: "exported",
        })
        .run();

      return { id: Number(result.lastInsertRowid) };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      db.delete(schema.contentItems)
        .where(eq(schema.contentItems.id, input.id))
        .run();
      return { success: true };
    }),
});
