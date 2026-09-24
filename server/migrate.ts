import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { applyMigrations } from "./migrations.js";

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.resolve(dataDir, "ugc.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

applyMigrations(sqlite);

console.log("Database migrated and seeded successfully.");
sqlite.close();
