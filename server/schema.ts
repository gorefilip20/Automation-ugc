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

export const adDeployments = sqliteTable("ad_deployments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull().default(1),
  provider: text("provider", { enum: ["meta", "google"] }).notNull(),
  accountId: text("accountId").notNull(),
  campaignName: text("campaignName").notNull(),
  externalCampaignId: text("externalCampaignId").notNull(),
  externalResource: text("externalResource"),
  audienceId: text("audienceId"),
  destinationUrl: text("destinationUrl").notNull(),
  trackedUrl: text("trackedUrl").notNull(),
  status: text("status", { enum: ["paused", "active", "completed", "failed"] }).notNull().default("paused"),
  lastSyncedAt: text("lastSyncedAt"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const campaignMetrics = sqliteTable("campaign_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deploymentId: integer("deploymentId").notNull(),
  provider: text("provider", { enum: ["meta", "google"] }).notNull(),
  metricDate: text("metricDate").notNull(),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  spend: text("spend").notNull().default("0"),
  conversions: text("conversions").notNull().default("0"),
  ctr: text("ctr").notNull().default("0"),
  cpc: text("cpc").notNull().default("0"),
  rawJson: text("rawJson"),
  syncedAt: text("syncedAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const creatorProfiles = sqliteTable("creator_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull().default(1),
  name: text("name").notNull(),
  handle: text("handle").notNull(),
  platform: text("platform", { enum: ["instagram", "tiktok", "youtube", "pinterest", "blog"] }).notNull(),
  niche: text("niche").notNull(),
  location: text("location"),
  bio: text("bio"),
  profileUrl: text("profileUrl").notNull(),
  avatarUrl: text("avatarUrl"),
  followerCount: integer("followerCount").notNull().default(0),
  engagementRate: text("engagementRate").notNull().default("0"),
  avgViews: integer("avgViews").notNull().default(0),
  email: text("email"),
  contactStatus: text("contactStatus", { enum: ["unknown", "discoverable", "verified", "opted_out"] }).notNull().default("unknown"),
  fitScore: integer("fitScore").notNull().default(0),
  scoreReasons: text("scoreReasons").notNull().default("[]"),
  status: text("status", { enum: ["discovered", "shortlisted", "contacted", "partnered", "archived"] }).notNull().default("discovered"),
  source: text("source").notNull().default("demo-public-signal"),
  lastSeenAt: text("lastSeenAt"),
  notes: text("notes"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const creatorDiscoveryJobs = sqliteTable("creator_discovery_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull().default(1),
  niche: text("niche").notNull(),
  platforms: text("platforms").notNull().default("instagram,tiktok,youtube"),
  location: text("location"),
  minFollowers: integer("minFollowers").default(1000),
  maxFollowers: integer("maxFollowers"),
  status: text("status", { enum: ["queued", "running", "completed", "failed"] }).notNull().default("queued"),
  resultCount: integer("resultCount").notNull().default(0),
  source: text("source").notNull().default("demo-public-signal"),
  errorMessage: text("errorMessage"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text("completedAt"),
});

export const creatorActivities = sqliteTable("creator_activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creatorId: integer("creatorId").notNull(),
  type: text("type", { enum: ["discovered", "shortlisted", "note", "contacted", "replied", "partnered"] }).notNull(),
  body: text("body"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const outreachSequences = sqliteTable("outreach_sequences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull().default(1),
  name: text("name").notNull(),
  brandName: text("brandName").notNull(),
  productName: text("productName").notNull(),
  productCategory: text("productCategory").notNull(),
  valueProp: text("valueProp").notNull(),
  offer: text("offer"),
  senderName: text("senderName").notNull(),
  senderEmail: text("senderEmail").notNull(),
  status: text("status", { enum: ["draft", "active", "paused", "archived"] }).notNull().default("draft"),
  dailyLimit: integer("dailyLimit").notNull().default(25),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const outreachSteps = sqliteTable("outreach_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sequenceId: integer("sequenceId").notNull(),
  stepOrder: integer("stepOrder").notNull(),
  delayHours: integer("delayHours").notNull().default(0),
  subjectTemplate: text("subjectTemplate").notNull(),
  bodyTemplate: text("bodyTemplate").notNull(),
});

export const creatorOutreach = sqliteTable("creator_outreach", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creatorId: integer("creatorId").notNull(),
  sequenceId: integer("sequenceId").notNull(),
  stepId: integer("stepId").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["draft", "queued", "sent", "replied", "bounced", "opted_out", "failed"] }).notNull().default("draft"),
  approvedAt: text("approvedAt"),
  scheduledAt: text("scheduledAt"),
  sentAt: text("sentAt"),
  repliedAt: text("repliedAt"),
  threadId: text("threadId"),
  providerMessageId: text("providerMessageId"),
  lastError: text("lastError"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const outreachEvents = sqliteTable("outreach_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  outreachId: integer("outreachId").notNull(),
  type: text("type", { enum: ["queued", "sent", "delivered", "opened", "clicked", "reply", "bounce", "unsubscribe"] }).notNull(),
  providerEventId: text("providerEventId"),
  payload: text("payload"),
  occurredAt: text("occurredAt").notNull().$defaultFn(() => new Date().toISOString()),
});

export const outreachSuppressions = sqliteTable("outreach_suppressions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  reason: text("reason").notNull().default("unsubscribe"),
  source: text("source").notNull().default("manual"),
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
});
