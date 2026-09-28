import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { getAnalyticsOverview, syncAll, syncDeployment } from "../services/analytics.js";
import { protectedProcedure, router } from "../trpc.js";

export const analyticsRouter = router({
  overview: protectedProcedure
    .input(z.object({ workspaceId: z.number().default(1) }))
    .query(async ({ input }) => getAnalyticsOverview(input.workspaceId)),
  sync: protectedProcedure
    .input(z.object({ deploymentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const deployment = db.query.adDeployments.findFirst({ where: eq(schema.adDeployments.id, input.deploymentId) }).sync();
      if (!deployment) throw new Error("Deployment not found");
      return syncDeployment(deployment);
    }),
  syncAll: protectedProcedure.mutation(async () => {
    await syncAll();
    return getAnalyticsOverview(1);
  }),
});
