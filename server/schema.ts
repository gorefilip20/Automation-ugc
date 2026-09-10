import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  style: text("style", {
    enum: [
      "testimonial",
      "unboxing",
      "tutorial",
      "review",
      "lifestyle",
      "before_after",
      "day_in_life",
      "get_ready",
      "haul",
      "storytelling",
    ],
  }).notNull(),
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
