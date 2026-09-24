import type Database from "better-sqlite3";

// Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
// EXISTS", so each one is checked against PRAGMA table_info first.
const ADDED_COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ["ugc_videos", "videoType", "TEXT NOT NULL DEFAULT 'ugc'"],
  ["ugc_videos", "presenter", "TEXT NOT NULL DEFAULT 'none'"],
  ["ugc_videos", "aspectRatio", "TEXT NOT NULL DEFAULT '9:16'"],
  ["ugc_videos", "prompt", "TEXT"],
  ["ugc_videos", "assets", "TEXT"],
  ["ugc_videos", "renderOptions", "TEXT"],
  ["ugc_videos", "renderStatus", "TEXT NOT NULL DEFAULT 'none'"],
  ["ugc_videos", "renderStage", "TEXT"],
  ["ugc_videos", "renderProgress", "INTEGER NOT NULL DEFAULT 0"],
  ["ugc_videos", "renderError", "TEXT"],
  ["ugc_videos", "renderLog", "TEXT"],
  ["ugc_videos", "videoUrl", "TEXT"],
  ["ugc_videos", "thumbnailUrl", "TEXT"],
  ["ugc_videos", "scriptSource", "TEXT"],
];

export function applyMigrations(sqlite: Database.Database) {
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
  `);

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

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS clip_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId INTEGER NOT NULL,
      title TEXT NOT NULL,
      sourceUrl TEXT,
      sourceFile TEXT,
      context TEXT,
      options TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      log TEXT,
      sourceDuration REAL,
      transcript TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      workspaceId INTEGER NOT NULL,
      title TEXT NOT NULL,
      hook TEXT,
      reason TEXT,
      score REAL,
      startSec REAL NOT NULL,
      endSec REAL NOT NULL,
      postCaption TEXT,
      hashtags TEXT,
      videoUrl TEXT,
      thumbnailUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
}
