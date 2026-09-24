import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name"),
  email: text("email"),
  role: text("role", { enum: ["user", "admin"] })
    .notNull()
    .default("user"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const creatorWorkspaces = sqliteTable("creator_workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  creatorName: text("creatorName").notNull(),
  creatorBio: text("creatorBio").notNull(),
  persona: text("persona").notNull(),
  voice: text("voice").notNull(),
  visualAnchor: text("visualAnchor").notNull(),
  disclosureEnabled: integer("disclosureEnabled").notNull().default(1),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const avatarProfiles = sqliteTable("avatar_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  prompt: text("prompt").notNull(),
  seed: integer("seed").notNull(),
  pose: text("pose").notNull(),
  wardrobe: text("wardrobe").notNull(),
  setting: text("setting").default(""),
  composition: text("composition").default(""),
  identityLock: integer("identityLock").notNull().default(1),
  ageConfirmed: integer("ageConfirmed").notNull().default(1),
  imageUrl: text("imageUrl"),
  referenceImageUrl: text("referenceImageUrl"),
  variationGroup: text("variationGroup"),
  variationIndex: integer("variationIndex").default(0),
  isSelected: integer("isSelected").default(0),
  status: text("status", {
    enum: ["draft", "generating", "ready", "failed"],
  })
    .notNull()
    .default("draft"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const contentItems = sqliteTable("content_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  avatarProfileId: integer("avatarProfileId"),
  title: text("title").notNull(),
  kind: text("kind", {
    enum: ["image", "caption", "campaign", "export", "video", "ugc_script"],
  }).notNull(),
  channel: text("channel"),
  format: text("format"),
  body: text("body"),
  assetUrl: text("assetUrl"),
  disclosureStamp: text("disclosureStamp")
    .notNull()
    .default("AI-generated virtual creator"),
  status: text("status", { enum: ["draft", "ready", "exported"] })
    .notNull()
    .default("draft"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ugcVideos = sqliteTable("ugc_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  avatarProfileId: integer("avatarProfileId"),
  title: text("title").notNull(),
  script: text("script").notNull(),
  style: text("style").notNull(),
  platform: text("platform", {
    enum: ["instagram", "tiktok", "youtube_shorts", "facebook"],
  }).notNull(),
  duration: integer("duration").default(30),
  productName: text("productName"),
  productDescription: text("productDescription"),
  callToAction: text("callToAction"),
  hook: text("hook"),
  scenes: text("scenes"),
  voiceoverText: text("voiceoverText"),
  musicStyle: text("musicStyle"),
  captionStyle: text("captionStyle"),
  status: text("status", {
    enum: ["draft", "generating", "ready", "failed"],
  })
    .notNull()
    .default("draft"),
  // What kind of video this is: a creator-style UGC ad, a product launch
  // film, or anything described in a free-form prompt.
  videoType: text("videoType", { enum: ["ugc", "launch", "custom"] })
    .notNull()
    .default("ugc"),
  presenter: text("presenter", {
    enum: ["none", "voiceover", "talking_avatar"],
  })
    .notNull()
    .default("none"),
  aspectRatio: text("aspectRatio", { enum: ["9:16", "1:1", "16:9"] })
    .notNull()
    .default("9:16"),
  prompt: text("prompt"),
  // JSON: { images: string[]; presenterImage?: string; music?: string }
  assets: text("assets"),
  // JSON: RenderOptions (voice, brand colors, captions on/off, ...)
  renderOptions: text("renderOptions"),
  renderStatus: text("renderStatus", {
    enum: ["none", "queued", "rendering", "ready", "failed"],
  })
    .notNull()
    .default("none"),
  renderStage: text("renderStage"),
  renderProgress: integer("renderProgress").notNull().default(0),
  renderError: text("renderError"),
  // JSON array of pipeline notes, e.g. which providers were used or skipped.
  renderLog: text("renderLog"),
  videoUrl: text("videoUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  scriptSource: text("scriptSource", { enum: ["claude", "template"] }),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const ugcCampaigns = sqliteTable("ugc_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  name: text("name").notNull(),
  productName: text("productName").notNull(),
  productCategory: text("productCategory").notNull(),
  targetAudience: text("targetAudience").notNull(),
  brandVoice: text("brandVoice"),
  objectives: text("objectives"),
  platforms: text("platforms").notNull(),
  contentTypes: text("contentTypes").notNull(),
  status: text("status", { enum: ["active", "paused", "completed"] })
    .notNull()
    .default("active"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const clipProjects = sqliteTable("clip_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  title: text("title").notNull(),
  // Where the long-form video came from: a pasted link or an uploaded file.
  sourceUrl: text("sourceUrl"),
  sourceFile: text("sourceFile"),
  // Free-form context for the highlight picker, e.g. "pump.fun stream for $DOGE".
  context: text("context"),
  // JSON: ClipOptions
  options: text("options"),
  status: text("status", {
    enum: ["queued", "processing", "ready", "failed"],
  })
    .notNull()
    .default("queued"),
  stage: text("stage"),
  progress: integer("progress").notNull().default(0),
  error: text("error"),
  log: text("log"),
  sourceDuration: real("sourceDuration"),
  // JSON: { segments, words } with absolute timestamps in seconds.
  transcript: text("transcript"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const clips = sqliteTable("clips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  workspaceId: integer("workspaceId").notNull(),
  title: text("title").notNull(),
  hook: text("hook"),
  reason: text("reason"),
  score: real("score"),
  startSec: real("startSec").notNull(),
  endSec: real("endSec").notNull(),
  postCaption: text("postCaption"),
  // JSON array of hashtags.
  hashtags: text("hashtags"),
  videoUrl: text("videoUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
