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

    CREATE TABLE IF NOT EXISTS project_stats (
      project_id TEXT PRIMARY KEY,
      chapter_count INTEGER NOT NULL DEFAULT 0,
      segment_count INTEGER NOT NULL DEFAULT 0,
      last_render_at TEXT,
      last_render_state TEXT,
      last_output_mp3_path TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, chapter_order);
    CREATE INDEX IF NOT EXISTS idx_speakers_project ON speakers(project_id);
    CREATE INDEX IF NOT EXISTS idx_segments_chapter ON segments(chapter_id, segment_order);
    CREATE INDEX IF NOT EXISTS idx_jobs_project ON render_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_project_activity ON render_jobs(project_id, COALESCE(finished_at, started_at) DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_updated_created ON projects(updated_at DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);

    INSERT OR IGNORE INTO project_stats (
      project_id,
      chapter_count,
      segment_count,
      last_render_at,
      last_render_state,
      last_output_mp3_path,
      updated_at
    )
    SELECT
      projects.id AS project_id,
      (
        SELECT COUNT(*)
        FROM chapters
        WHERE chapters.project_id = projects.id
      ) AS chapter_count,
      (
        SELECT COUNT(*)
        FROM segments
        INNER JOIN chapters ON chapters.id = segments.chapter_id
        WHERE chapters.project_id = projects.id
      ) AS segment_count,
      (
        SELECT MAX(COALESCE(render_jobs.finished_at, render_jobs.started_at))
        FROM render_jobs
        WHERE render_jobs.project_id = projects.id
      ) AS last_render_at,
      (
        SELECT render_jobs.state
        FROM render_jobs
        WHERE render_jobs.project_id = projects.id
        ORDER BY COALESCE(render_jobs.finished_at, render_jobs.started_at) DESC, render_jobs.rowid DESC
        LIMIT 1
      ) AS last_render_state,
      (
        SELECT render_jobs.output_mp3_path
        FROM render_jobs
        WHERE render_jobs.project_id = projects.id AND render_jobs.output_mp3_path IS NOT NULL
        ORDER BY COALESCE(render_jobs.finished_at, render_jobs.started_at) DESC, render_jobs.rowid DESC
        LIMIT 1
      ) AS last_output_mp3_path,
      CURRENT_TIMESTAMP AS updated_at
    FROM projects;
  `);
}
