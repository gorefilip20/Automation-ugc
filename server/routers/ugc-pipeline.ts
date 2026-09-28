import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { approveProductionBrief, createProductionBrief, getProductionBrief, listProductionBriefs, queueGeneration } from "../services/ugc-pipeline.js";

export const ugcPipelineRouter = router({
  list: protectedProcedure.input(z.object({ workspaceId: z.number().default(1) })).query(({ input }) => listProductionBriefs(input.workspaceId)),
  get: protectedProcedure.input(z.object({ briefId: z.number().int().positive() })).query(({ input }) => getProductionBrief(input.briefId)),
  createBrief: protectedProcedure.input(z.object({ workspaceId: z.number().default(1), title: z.string().min(1), productName: z.string().min(1), productDescription: z.string().min(10), productReferenceUrl: z.string().url().optional(), productAssetUrl: z.string().url().optional(), targetAudience: z.string().min(3), brandVoice: z.string().min(3), objective: z.string().min(3), platform: z.enum(["instagram", "tiktok", "youtube_shorts", "facebook"]), aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"), durationSeconds: z.number().int().min(4).max(30).default(20), style: z.string().min(2), avatarProfileId: z.number().int().positive().optional() })).mutation(({ input }) => createProductionBrief(input)),
  queueGeneration: protectedProcedure.input(z.object({ briefId: z.number().int().positive() })).mutation(({ input }) => queueGeneration(input.briefId)),
  approve: protectedProcedure.input(z.object({ briefId: z.number().int().positive() })).mutation(({ input }) => approveProductionBrief(input.briefId)),
});
