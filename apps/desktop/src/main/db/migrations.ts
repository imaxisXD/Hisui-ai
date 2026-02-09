import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_format TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      chapter_order INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS speakers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      tts_model TEXT NOT NULL,
      voice_id TEXT NOT NULL,
      prompt_audio_path TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      segment_order INTEGER NOT NULL,
      speaker_id TEXT NOT NULL,
      text TEXT NOT NULL,
      expression_tags_json TEXT NOT NULL,
      est_duration_sec REAL NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      state TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      output_mp3_path TEXT,
      metrics_json TEXT,
      error_text TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, chapter_order);
    CREATE INDEX IF NOT EXISTS idx_speakers_project ON speakers(project_id);
    CREATE INDEX IF NOT EXISTS idx_segments_chapter ON segments(chapter_id, segment_order);
    CREATE INDEX IF NOT EXISTS idx_jobs_project ON render_jobs(project_id);
  `);
}
