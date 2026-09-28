import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { adsRouter } from "./ads.js";
import { crawlRouter } from "./crawl.js";
import { analyticsRouter } from "./analytics.js";
import { avatarRouter } from "./avatar.js";
import { contentRouter } from "./content.js";
import { ugcRouter } from "./ugc.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  auth: authRouter,
  ads: adsRouter,
  crawl: crawlRouter,
  analytics: analyticsRouter,
  workspace: workspaceRouter,
  avatar: avatarRouter,
  content: contentRouter,
  ugc: ugcRouter,
});

export type AppRouter = typeof appRouter;
