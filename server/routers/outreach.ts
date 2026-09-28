import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { approveOutreach, createDrafts, createSequence, handleReply, listOutreach, listSequences, sendOutreach, suppressEmail } from "../services/outreach.js";

export const outreachRouter = router({
  sequences: protectedProcedure.input(z.object({ workspaceId: z.number().default(1) })).query(({ input }) => listSequences(input.workspaceId)),
  createSequence: protectedProcedure.input(z.object({ workspaceId: z.number().default(1), name: z.string().min(1), brandName: z.string().min(1), productName: z.string().min(1), productCategory: z.string().min(1), valueProp: z.string().min(1), offer: z.string().optional(), senderName: z.string().min(1), senderEmail: z.string().email(), dailyLimit: z.number().int().min(1).max(500).default(25) })).mutation(({ input }) => createSequence(input)),
  listOutreach: protectedProcedure.input(z.object({ sequenceId: z.number().int().positive() })).query(({ input }) => listOutreach(input.sequenceId)),
  createDrafts: protectedProcedure.input(z.object({ sequenceId: z.number().int().positive(), creatorIds: z.array(z.number().int().positive()).min(1).max(500) })).mutation(({ input }) => createDrafts(input)),
  approve: protectedProcedure.input(z.object({ outreachIds: z.array(z.number().int().positive()).min(1), scheduledAt: z.string().datetime().optional() })).mutation(({ input }) => approveOutreach(input)),
  send: protectedProcedure.input(z.object({ outreachId: z.number().int().positive() })).mutation(({ input }) => sendOutreach(input)),
  suppress: protectedProcedure.input(z.object({ email: z.string().email(), reason: z.string().optional(), source: z.string().optional() })).mutation(({ input }) => suppressEmail(input)),
  handleReply: protectedProcedure.input(z.object({ threadId: z.string().min(1), providerEventId: z.string().optional(), body: z.string().optional() })).mutation(({ input }) => handleReply(input)),
});
