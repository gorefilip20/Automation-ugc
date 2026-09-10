import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const workspaceRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return [];
    return db.query.creatorWorkspaces.findMany({
      where: eq(schema.creatorWorkspaces.userId, ctx.userId),
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        creatorName: z.string().min(1),
        creatorBio: z.string().min(1),
        persona: z.string().min(1),
        voice: z.string().min(1),
        visualAnchor: z.string().min(1),
        disclosureEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = db
        .insert(schema.creatorWorkspaces)
        .values({
          userId: ctx.userId,
          name: input.name,
          creatorName: input.creatorName,
          creatorBio: input.creatorBio,
          persona: input.persona,
          voice: input.voice,
          visualAnchor: input.visualAnchor,
          disclosureEnabled: input.disclosureEnabled ? 1 : 0,
        })
        .run();
      return Number(result.lastInsertRowid);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        creatorName: z.string().optional(),
        creatorBio: z.string().optional(),
        persona: z.string().optional(),
        voice: z.string().optional(),
        visualAnchor: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const existing = db.query.creatorWorkspaces.findFirst({
        where: (w, { and, eq }) =>
          and(eq(w.id, id), eq(w.userId, ctx.userId)),
      });
      if (!existing) throw new Error("Workspace not found");
      db.update(schema.creatorWorkspaces)
        .set(updates)
        .where(eq(schema.creatorWorkspaces.id, id))
        .run();
      return { success: true };
    }),
});
