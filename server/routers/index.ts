import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { adsRouter } from "./ads.js";
import { crawlRouter } from "./crawl.js";
import { analyticsRouter } from "./analytics.js";
import { creatorsRouter } from "./creators.js";
import { outreachRouter } from "./outreach.js";
import { avatarRouter } from "./avatar.js";
import { contentRouter } from "./content.js";
import { ugcRouter } from "./ugc.js";
import { ugcPipelineRouter } from "./ugc-pipeline.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  auth: authRouter,
  ads: adsRouter,
  crawl: crawlRouter,
  analytics: analyticsRouter,
  creators: creatorsRouter,
  outreach: outreachRouter,
  workspace: workspaceRouter,
  avatar: avatarRouter,
  content: contentRouter,
  ugc: ugcRouter,
  ugcPipeline: ugcPipelineRouter,
});

export type AppRouter = typeof appRouter;
