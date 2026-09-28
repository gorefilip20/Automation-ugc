import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { protectedProcedure, router } from "../trpc.js";

function normalizeUrl(value: string) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export const crawlRouter = router({
  start: protectedProcedure
    .input(z.object({ workspaceId: z.number(), url: z.string().url() }))
    .mutation(async ({ input }) => {
      const rootUrl = normalizeUrl(input.url);
      const domain = new URL(rootUrl).hostname.toLowerCase();
      const result = db.insert(schema.crawlJobs).values({ workspaceId: input.workspaceId, domain, rootUrl, depthLimit: 4, pageLimit: 100, status: "queued" }).run();
      return { jobId: Number(result.lastInsertRowid), domain, status: "queued" as const };
    }),

  get: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const job = db.query.crawlJobs.findFirst({ where: eq(schema.crawlJobs.id, input.jobId) }).sync();
      if (!job) return null;
      const candidates = db.select().from(schema.emailCandidates).where(eq(schema.emailCandidates.jobId, input.jobId)).all();
      const emails = candidates.map((candidate) => ({ ...candidate, verification: db.query.emailVerifications.findFirst({ where: eq(schema.emailVerifications.candidateId, candidate.id) }).sync() ?? null }));
      const pages = db.select().from(schema.crawlPages).where(eq(schema.crawlPages.jobId, input.jobId)).orderBy(desc(schema.crawlPages.id)).limit(12).all();
      const verificationCounts = emails.reduce<Record<string, number>>((acc, item) => { const status = item.verification?.finalStatus ?? "pending"; acc[status] = (acc[status] ?? 0) + 1; return acc; }, {});
      return { job, emails, pages, verificationCounts };
    }),

  recent: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => db.select().from(schema.crawlJobs).where(eq(schema.crawlJobs.workspaceId, input.workspaceId)).orderBy(desc(schema.crawlJobs.id)).limit(10).all()),
});
