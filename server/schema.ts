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

export const crawlJobs = sqliteTable("crawl_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  domain: text("domain").notNull(),
  rootUrl: text("rootUrl").notNull(),
  depthLimit: integer("depthLimit").notNull().default(4),
  pageLimit: integer("pageLimit").notNull().default(100),
  status: text("status", { enum: ["queued", "crawling", "extracting", "verifying", "ready", "failed"] }).notNull().default("queued"),
  pagesDiscovered: integer("pagesDiscovered").notNull().default(0),
  pagesCrawled: integer("pagesCrawled").notNull().default(0),
  candidatesFound: integer("candidatesFound").notNull().default(0),
  verifiedCount: integer("verifiedCount").notNull().default(0),
  riskyCount: integer("riskyCount").notNull().default(0),
  unknownCount: integer("unknownCount").notNull().default(0),
  errorMessage: text("errorMessage"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crawlPages = sqliteTable("crawl_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("jobId").notNull(),
  url: text("url").notNull(),
  depth: integer("depth").notNull().default(0),
  status: text("status", { enum: ["queued", "crawled", "skipped", "failed"] }).notNull().default("queued"),
  httpStatus: integer("httpStatus"),
  title: text("title"),
  discoveredEmails: integer("discoveredEmails").notNull().default(0),
  crawledAt: text("crawledAt"),
});

export const emailCandidates = sqliteTable("email_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("jobId").notNull(),
  email: text("email").notNull(),
  personName: text("personName"),
  role: text("role"),
  sourceUrl: text("sourceUrl").notNull(),
  sourceType: text("sourceType").notNull().default("public_page"),
  confidence: integer("confidence").notNull().default(50),
  audienceEligible: integer("audienceEligible").notNull().default(0),
  eligibilityReason: text("eligibilityReason"),
  eligibleAt: text("eligibleAt"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  candidateId: integer("candidateId").notNull(),
  syntaxStatus: text("syntaxStatus").notNull(),
  dnsStatus: text("dnsStatus").notNull(),
  smtpStatus: text("smtpStatus").notNull(),
  finalStatus: text("finalStatus", { enum: ["verified", "likely_valid", "risky", "catch_all", "unknown", "invalid"] }).notNull(),
  mxHost: text("mxHost"),
  responseCode: text("responseCode"),
  reason: text("reason"),
  checkedAt: text("checkedAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("jobId"),
  provider: text("provider").notNull().default("slack"),
  eventType: text("eventType").notNull(),
  status: text("status", { enum: ["queued", "delivered", "failed"] }).notNull().default("queued"),
  attemptCount: integer("attemptCount").notNull().default(0),
  responseCode: integer("responseCode"),
  errorMessage: text("errorMessage"),
  deliveredAt: text("deliveredAt"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
});
