import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { addCreatorNote, discoverCreators, listCreators, updateCreatorStatus } from "../services/creator-discovery.js";

const platform = z.enum(["instagram", "tiktok", "youtube", "pinterest", "blog"]);
const status = z.enum(["discovered", "shortlisted", "contacted", "partnered", "archived"]);

export const creatorsRouter = router({
  list: protectedProcedure.input(z.object({ workspaceId: z.number().default(1), search: z.string().optional(), niche: z.string().optional(), platform: platform.optional(), status: status.optional(), limit: z.number().int().min(1).max(200).default(100) })).query(({ input }) => listCreators(input)),
  discover: protectedProcedure.input(z.object({ workspaceId: z.number().default(1), niche: z.string().min(2), platforms: z.array(platform).min(1), location: z.string().optional(), minFollowers: z.number().int().min(0).default(1000), maxFollowers: z.number().int().positive().optional() })).mutation(({ input }) => discoverCreators(input)),
  updateStatus: protectedProcedure.input(z.object({ creatorId: z.number().int().positive(), status })).mutation(({ input }) => updateCreatorStatus(input)),
  addNote: protectedProcedure.input(z.object({ creatorId: z.number().int().positive(), body: z.string().min(1).max(2000) })).mutation(({ input }) => addCreatorNote(input)),
});
