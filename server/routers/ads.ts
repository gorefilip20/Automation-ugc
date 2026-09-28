import { deploymentInputSchema, deployCampaign, getAdDeploymentStatus } from "../services/ad-deployment.js";
import { protectedProcedure, router } from "../trpc.js";

export const adsRouter = router({
  status: protectedProcedure.query(() => getAdDeploymentStatus()),
  deployPausedCampaign: protectedProcedure
    .input(deploymentInputSchema)
    .mutation(async ({ input }) => deployCampaign(input)),
});
