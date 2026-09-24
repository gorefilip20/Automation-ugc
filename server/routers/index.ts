import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { avatarRouter } from "./avatar.js";
import { clipsRouter } from "./clips.js";
import { contentRouter } from "./content.js";
import { imageRouter } from "./image.js";
import { ugcRouter } from "./ugc.js";
import { videoRouter } from "./video.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
  avatar: avatarRouter,
  content: contentRouter,
  ugc: ugcRouter,
  video: videoRouter,
  clips: clipsRouter,
  image: imageRouter,
});

export type AppRouter = typeof appRouter;
