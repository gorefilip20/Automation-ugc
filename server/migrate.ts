import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.resolve(dataDir, "ugc.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS creator_workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    creatorName TEXT NOT NULL,
    creatorBio TEXT NOT NULL,
    persona TEXT NOT NULL,
    voice TEXT NOT NULL,
    visualAnchor TEXT NOT NULL,
    disclosureEnabled INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS avatar_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    seed INTEGER NOT NULL,
    pose TEXT NOT NULL,
    wardrobe TEXT NOT NULL,
    setting TEXT DEFAULT '',
    composition TEXT DEFAULT '',
    identityLock INTEGER NOT NULL DEFAULT 1,
    ageConfirmed INTEGER NOT NULL DEFAULT 1,
    imageUrl TEXT,
    referenceImageUrl TEXT,
    variationGroup TEXT,
    variationIndex INTEGER DEFAULT 0,
    isSelected INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL,
    avatarProfileId INTEGER,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    channel TEXT,
    format TEXT,
    body TEXT,
    assetUrl TEXT,
    disclosureStamp TEXT NOT NULL DEFAULT 'AI-generated virtual creator',
    status TEXT NOT NULL DEFAULT 'draft',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ugc_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL,
    avatarProfileId INTEGER,
    title TEXT NOT NULL,
    script TEXT NOT NULL,
    style TEXT NOT NULL,
    platform TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    productName TEXT,
    productDescription TEXT,
    callToAction TEXT,
    hook TEXT,
    scenes TEXT,
    voiceoverText TEXT,
    musicStyle TEXT,
    captionStyle TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ugc_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL,
    name TEXT NOT NULL,
    productName TEXT NOT NULL,
    productCategory TEXT NOT NULL,
    targetAudience TEXT NOT NULL,
    brandVoice TEXT,
    objectives TEXT,
    platforms TEXT NOT NULL,
    contentTypes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS crawl_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL,
    domain TEXT NOT NULL,
    rootUrl TEXT NOT NULL,
    depthLimit INTEGER NOT NULL DEFAULT 4,
    pageLimit INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'queued',
    pagesDiscovered INTEGER NOT NULL DEFAULT 0,
    pagesCrawled INTEGER NOT NULL DEFAULT 0,
    candidatesFound INTEGER NOT NULL DEFAULT 0,
    verifiedCount INTEGER NOT NULL DEFAULT 0,
    riskyCount INTEGER NOT NULL DEFAULT 0,
    unknownCount INTEGER NOT NULL DEFAULT 0,
    errorMessage TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS crawl_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId INTEGER NOT NULL,
    url TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    httpStatus INTEGER,
    title TEXT,
    discoveredEmails INTEGER NOT NULL DEFAULT 0,
    crawledAt TEXT
  );

  CREATE TABLE IF NOT EXISTS email_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId INTEGER NOT NULL,
    email TEXT NOT NULL,
    personName TEXT,
    role TEXT,
    sourceUrl TEXT NOT NULL,
    sourceType TEXT NOT NULL DEFAULT 'public_page',
    confidence INTEGER NOT NULL DEFAULT 50,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidateId INTEGER NOT NULL,
    syntaxStatus TEXT NOT NULL,
    dnsStatus TEXT NOT NULL,
    smtpStatus TEXT NOT NULL,
    finalStatus TEXT NOT NULL,
    mxHost TEXT,
    responseCode TEXT,
    reason TEXT,
    checkedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId INTEGER,
    provider TEXT NOT NULL DEFAULT 'slack',
    eventType TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    attemptCount INTEGER NOT NULL DEFAULT 0,
    responseCode INTEGER,
    errorMessage TEXT,
    deliveredAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ad_deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER NOT NULL DEFAULT 1,
    provider TEXT NOT NULL,
    accountId TEXT NOT NULL,
    campaignName TEXT NOT NULL,
    externalCampaignId TEXT NOT NULL,
    externalResource TEXT,
    audienceId TEXT,
    destinationUrl TEXT NOT NULL,
    trackedUrl TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paused',
    lastSyncedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaign_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deploymentId INTEGER NOT NULL,
    provider TEXT NOT NULL,
    metricDate TEXT NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    reach INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    spend TEXT NOT NULL DEFAULT '0',
    conversions TEXT NOT NULL DEFAULT '0',
    ctr TEXT NOT NULL DEFAULT '0',
    cpc TEXT NOT NULL DEFAULT '0',
    rawJson TEXT,
    syncedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const candidateColumns = sqlite.prepare("PRAGMA table_info(email_candidates)").all() as Array<{ name: string }>;
if (!candidateColumns.some((column) => column.name === "audienceEligible")) sqlite.exec("ALTER TABLE email_candidates ADD COLUMN audienceEligible INTEGER NOT NULL DEFAULT 0");
if (!candidateColumns.some((column) => column.name === "eligibilityReason")) sqlite.exec("ALTER TABLE email_candidates ADD COLUMN eligibilityReason TEXT");
if (!candidateColumns.some((column) => column.name === "eligibleAt")) sqlite.exec("ALTER TABLE email_candidates ADD COLUMN eligibleAt TEXT");

const existingUser = sqlite
  .prepare("SELECT id FROM users WHERE id = 1")
  .get();
if (!existingUser) {
  sqlite
    .prepare("INSERT INTO users (name, email, role) VALUES (?, ?, ?)")
    .run("Demo Creator", "creator@ugc-studio.com", "user");
}

const existingWorkspace = sqlite
  .prepare("SELECT id FROM creator_workspaces WHERE id = 1")
  .get();
if (!existingWorkspace) {
  sqlite
    .prepare(
      "INSERT INTO creator_workspaces (userId, name, creatorName, creatorBio, persona, voice, visualAnchor) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      1,
      "Aria Vale / Studio",
      "Aria Vale",
      "A thoughtful fictional virtual creator for everyday rituals.",
      "Curious, warm, specific, and observant.",
      "Warm, considered, never salesy.",
      "Warm olive skin, shoulder-length dark wavy hair, hazel eyes, softly angular face."
    );
}

console.log("Database migrated and seeded successfully.");
sqlite.close();
