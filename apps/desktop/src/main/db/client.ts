import Database from "better-sqlite3";
import { app } from "electron";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { runMigrations } from "./migrations.js";

let db: Database.Database | null = null;

function resolveDbPath(): string {
  const override = process.env.LOCAL_PODCAST_DB_PATH;
  if (override) {
    return override;
  }
  return join(app.getPath("userData"), "local-podcast.db");
}

export function getDb(): Database.Database {
  if (db) {
    return db;
  }
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

export function resetDbForTests(): void {
  if (!db) {
    return;
  }
  db.close();
  db = null;
}
