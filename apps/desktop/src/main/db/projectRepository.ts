import type Database from "better-sqlite3";
import type {
  Chapter,
  Project,
  ProjectHistoryDetails,
  ProjectHistoryItem,
  ProjectHistoryQuery,
  RenderJob,
  RenderState,
  Segment,
  SpeakerProfile,
  UpdateSpeakersInput,
  UpdateSegmentsInput
} from "../../shared/types.js";
import { getDb } from "./client.js";

interface ProjectRow {
  id: string;
  title: string;
  source_path: string;
  source_format: Project["sourceFormat"];
  settings_json: string;
  created_at: string;
  updated_at: string;
}

interface ChapterRow {
  id: string;
  project_id: string;
  title: string;
  chapter_order: number;
}

interface SpeakerRow {
  id: string;
  project_id: string;
  name: string;
  tts_model: SpeakerProfile["ttsModel"];
  voice_id: string;
  prompt_audio_path: string | null;
}

interface SegmentRow {
  id: string;
  chapter_id: string;
  segment_order: number;
  speaker_id: string;
  text: string;
  expression_tags_json: string;
  est_duration_sec: number;
}

interface RenderJobRow {
  id: string;
  project_id: string;
  state: RenderJob["state"];
  started_at: string | null;
  finished_at: string | null;
  output_mp3_path: string | null;
  metrics_json: string | null;
  error_text: string | null;
}

interface ProjectHistoryRow {
  id: string;
  title: string;
  source_path: string;
  source_format: Project["sourceFormat"];
  created_at: string;
  updated_at: string;
  chapter_count: number;
  segment_count: number;
  last_render_at: string | null;
  last_render_state: RenderState | null;
  last_output_mp3_path: string | null;
}

function db(): Database.Database {
  return getDb();
}

function mapProject(row: ProjectRow, chapters: Chapter[], speakers: SpeakerProfile[]): Project {
  return {
    id: row.id,
    title: row.title,
    sourcePath: row.source_path,
    sourceFormat: row.source_format,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chapters,
    speakers,
    settings: JSON.parse(row.settings_json)
  };
}

function mapRenderJobRow(row: RenderJobRow): RenderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    state: row.state,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    outputMp3Path: row.output_mp3_path ?? undefined,
    metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
    errorText: row.error_text ?? undefined
  };
}

function listSpeakersForProject(database: Database.Database, projectId: string): SpeakerProfile[] {
  const rows = database
    .prepare("SELECT * FROM speakers WHERE project_id = ? ORDER BY rowid")
    .all(projectId) as SpeakerRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ttsModel: row.tts_model,
    voiceId: row.voice_id,
    promptAudioPath: row.prompt_audio_path ?? undefined
  }));
}

function listChaptersForProject(database: Database.Database, projectId: string): Chapter[] {
  const chapterRows = database
    .prepare("SELECT * FROM chapters WHERE project_id = ? ORDER BY chapter_order")
    .all(projectId) as ChapterRow[];

  if (chapterRows.length === 0) {
    return [];
  }

  const segmentRows = database
    .prepare(`
      SELECT segments.*
      FROM segments
      INNER JOIN chapters ON chapters.id = segments.chapter_id
      WHERE chapters.project_id = ?
      ORDER BY chapters.chapter_order, segments.segment_order
    `)
    .all(projectId) as SegmentRow[];

  const segmentsByChapter = new Map<string, Segment[]>();
  for (const segmentRow of segmentRows) {
    const mapped: Segment = {
      id: segmentRow.id,
      chapterId: segmentRow.chapter_id,
      order: segmentRow.segment_order,
      speakerId: segmentRow.speaker_id,
      text: segmentRow.text,
      expressionTags: JSON.parse(segmentRow.expression_tags_json),
      estDurationSec: segmentRow.est_duration_sec
    };
    const existing = segmentsByChapter.get(segmentRow.chapter_id);
    if (existing) {
      existing.push(mapped);
    } else {
      segmentsByChapter.set(segmentRow.chapter_id, [mapped]);
    }
  }

  return chapterRows.map((chapterRow) => ({
    id: chapterRow.id,
    title: chapterRow.title,
    order: chapterRow.chapter_order,
    segments: segmentsByChapter.get(chapterRow.id) ?? []
  }));
}

function upsertProjectStats(database: Database.Database, projectId: string, updatedAt: string): void {
  database.prepare(`
    INSERT INTO project_stats (
      project_id,
      chapter_count,
      segment_count,
      last_render_at,
      last_render_state,
      last_output_mp3_path,
      updated_at
    )
    VALUES (
      @projectId,
      (
        SELECT COUNT(*)
        FROM chapters
        WHERE chapters.project_id = @projectId
      ),
      (
        SELECT COUNT(*)
        FROM segments
        INNER JOIN chapters ON chapters.id = segments.chapter_id
        WHERE chapters.project_id = @projectId
      ),
      (
        SELECT MAX(COALESCE(render_jobs.finished_at, render_jobs.started_at))
        FROM render_jobs
        WHERE render_jobs.project_id = @projectId
      ),
      (
        SELECT render_jobs.state
        FROM render_jobs
        WHERE render_jobs.project_id = @projectId
        ORDER BY COALESCE(render_jobs.finished_at, render_jobs.started_at) DESC, render_jobs.rowid DESC
        LIMIT 1
      ),
      (
        SELECT render_jobs.output_mp3_path
        FROM render_jobs
        WHERE render_jobs.project_id = @projectId AND render_jobs.output_mp3_path IS NOT NULL
        ORDER BY COALESCE(render_jobs.finished_at, render_jobs.started_at) DESC, render_jobs.rowid DESC
        LIMIT 1
      ),
      @updatedAt
    )
    ON CONFLICT(project_id) DO UPDATE SET
      chapter_count = excluded.chapter_count,
      segment_count = excluded.segment_count,
      last_render_at = excluded.last_render_at,
      last_render_state = excluded.last_render_state,
      last_output_mp3_path = excluded.last_output_mp3_path,
      updated_at = excluded.updated_at
  `).run({
    projectId,
    updatedAt
  });
}

function getProjectFromDatabase(database: Database.Database, projectId: string): Project | null {
  const row = database.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!row) {
    return null;
  }
  const chapters = listChaptersForProject(database, projectId);
  const speakers = listSpeakersForProject(database, projectId);
  return mapProject(row, chapters, speakers);
}

function normalizeProjectHistoryLimit(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 50;
  }
  return Math.max(1, Math.min(200, Math.round(input)));
}

function normalizeRenderHistoryLimit(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 20;
  }
  return Math.max(1, Math.min(100, Math.round(input)));
}

function listRenderJobsForProjectFromDatabase(
  database: Database.Database,
  projectId: string,
  limitInput?: number
): RenderJob[] {
  const limit = normalizeRenderHistoryLimit(limitInput);
  const rows = database.prepare(`
    SELECT *
    FROM render_jobs
    WHERE project_id = ?
    ORDER BY COALESCE(finished_at, started_at) DESC, rowid DESC
    LIMIT ?
  `).all(projectId, limit) as RenderJobRow[];

  return rows.map(mapRenderJobRow);
}

export function createProject(project: Project): Project {
  const database = db();
  const tx = database.transaction(() => {
    database.prepare(`
      INSERT INTO projects (id, title, source_path, source_format, settings_json, created_at, updated_at)
      VALUES (@id, @title, @sourcePath, @sourceFormat, @settingsJson, @createdAt, @updatedAt)
    `).run({
      id: project.id,
      title: project.title,
      sourcePath: project.sourcePath,
      sourceFormat: project.sourceFormat,
      settingsJson: JSON.stringify(project.settings),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    });

    const insertChapter = database.prepare(`
      INSERT INTO chapters (id, project_id, title, chapter_order)
      VALUES (@id, @projectId, @title, @order)
    `);
    const insertSpeaker = database.prepare(`
      INSERT INTO speakers (id, project_id, name, tts_model, voice_id, prompt_audio_path)
      VALUES (@id, @projectId, @name, @ttsModel, @voiceId, @promptAudioPath)
    `);
    const insertSegment = database.prepare(`
      INSERT INTO segments (id, chapter_id, segment_order, speaker_id, text, expression_tags_json, est_duration_sec)
      VALUES (@id, @chapterId, @order, @speakerId, @text, @expressionTagsJson, @estDurationSec)
    `);

    for (const chapter of project.chapters) {
      insertChapter.run({ id: chapter.id, projectId: project.id, title: chapter.title, order: chapter.order });
      for (const segment of chapter.segments) {
        insertSegment.run({
          id: segment.id,
          chapterId: chapter.id,
          order: segment.order,
          speakerId: segment.speakerId,
          text: segment.text,
          expressionTagsJson: JSON.stringify(segment.expressionTags),
          estDurationSec: segment.estDurationSec
        });
      }
    }

    for (const speaker of project.speakers) {
      insertSpeaker.run({
        id: speaker.id,
        projectId: project.id,
        name: speaker.name,
        ttsModel: speaker.ttsModel,
        voiceId: speaker.voiceId,
        promptAudioPath: speaker.promptAudioPath ?? null
      });
    }

    upsertProjectStats(database, project.id, project.updatedAt);
  });

  tx();
  return project;
}

export function getProject(projectId: string): Project | null {
  return getProjectFromDatabase(db(), projectId);
}

export function updateSegments(input: UpdateSegmentsInput): Project {
  const database = db();
  const updateStatement = database.prepare(`
    UPDATE segments
    SET text = @text,
        speaker_id = @speakerId,
        expression_tags_json = @expressionTagsJson
    WHERE id = @id
  `);

  const tx = database.transaction(() => {
    for (const update of input.updates) {
      updateStatement.run({
        id: update.id,
        text: update.text,
        speakerId: update.speakerId,
        expressionTagsJson: JSON.stringify(update.expressionTags)
      });
    }
    const updatedAt = new Date().toISOString();
    database.prepare("UPDATE projects SET updated_at = @updatedAt WHERE id = @id").run({
      id: input.projectId,
      updatedAt
    });
    database.prepare("UPDATE project_stats SET updated_at = @updatedAt WHERE project_id = @id").run({
      id: input.projectId,
      updatedAt
    });
  });

  tx();

  const project = getProject(input.projectId);
  if (!project) {
    throw new Error("Project disappeared after update");
  }
  return project;
}

export function updateSpeakers(input: UpdateSpeakersInput): Project {
  const database = db();
  const tx = database.transaction(() => {
    database.prepare("DELETE FROM speakers WHERE project_id = ?").run(input.projectId);
    const insertSpeaker = database.prepare(`
      INSERT INTO speakers (id, project_id, name, tts_model, voice_id, prompt_audio_path)
      VALUES (@id, @projectId, @name, @ttsModel, @voiceId, @promptAudioPath)
    `);

    for (const speaker of input.speakers) {
      insertSpeaker.run({
        id: speaker.id,
        projectId: input.projectId,
        name: speaker.name,
        ttsModel: speaker.ttsModel,
        voiceId: speaker.voiceId,
        promptAudioPath: speaker.promptAudioPath ?? null
      });
    }

    const firstSpeaker = input.speakers[0];
    if (firstSpeaker) {
      const validSpeakerIds = new Set(input.speakers.map((speaker) => speaker.id));
      const rows = database.prepare(`
        SELECT segments.id AS id, segments.speaker_id AS speaker_id
        FROM segments
        INNER JOIN chapters ON chapters.id = segments.chapter_id
        WHERE chapters.project_id = ?
      `).all(input.projectId) as Array<{ id: string; speaker_id: string }>;

      const updateSegmentSpeaker = database.prepare(`
        UPDATE segments
        SET speaker_id = ?
        WHERE id = ?
      `);

      for (const row of rows) {
        if (!validSpeakerIds.has(row.speaker_id)) {
          updateSegmentSpeaker.run(firstSpeaker.id, row.id);
        }
      }
    }

    const updatedAt = new Date().toISOString();
    database.prepare("UPDATE projects SET updated_at = @updatedAt WHERE id = @id").run({
      id: input.projectId,
      updatedAt
    });
    database.prepare("UPDATE project_stats SET updated_at = @updatedAt WHERE project_id = @id").run({
      id: input.projectId,
      updatedAt
    });
  });

  tx();

  const project = getProject(input.projectId);
  if (!project) {
    throw new Error("Project disappeared after speaker update");
  }
  return project;
}

export function upsertRenderJob(job: RenderJob): void {
  const database = db();
  const tx = database.transaction(() => {
    database.prepare(`
      INSERT INTO render_jobs (id, project_id, state, started_at, finished_at, output_mp3_path, metrics_json, error_text)
      VALUES (@id, @projectId, @state, @startedAt, @finishedAt, @outputMp3Path, @metricsJson, @errorText)
      ON CONFLICT(id) DO UPDATE SET
        state = excluded.state,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        output_mp3_path = excluded.output_mp3_path,
        metrics_json = excluded.metrics_json,
        error_text = excluded.error_text
    `).run({
      id: job.id,
      projectId: job.projectId,
      state: job.state,
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
      outputMp3Path: job.outputMp3Path ?? null,
      metricsJson: job.metrics ? JSON.stringify(job.metrics) : null,
      errorText: job.errorText ?? null
    });
    upsertProjectStats(database, job.projectId, new Date().toISOString());
  });

  tx();
}

export function getRenderJob(jobId: string): RenderJob | null {
  const row = db().prepare("SELECT * FROM render_jobs WHERE id = ?").get(jobId) as RenderJobRow | undefined;
  if (!row) {
    return null;
  }
  return mapRenderJobRow(row);
}

export function listProjects(query: ProjectHistoryQuery = {}): ProjectHistoryItem[] {
  const limit = normalizeProjectHistoryLimit(query.limit);
  const rows = db().prepare(`
    SELECT
      projects.id AS id,
      projects.title AS title,
      projects.source_path AS source_path,
      projects.source_format AS source_format,
      projects.created_at AS created_at,
      projects.updated_at AS updated_at,
      COALESCE(project_stats.chapter_count, 0) AS chapter_count,
      COALESCE(project_stats.segment_count, 0) AS segment_count,
      project_stats.last_render_at AS last_render_at,
      project_stats.last_render_state AS last_render_state,
      project_stats.last_output_mp3_path AS last_output_mp3_path
    FROM projects
    LEFT JOIN project_stats ON project_stats.project_id = projects.id
    ORDER BY projects.updated_at DESC, projects.created_at DESC
    LIMIT ?
  `).all(limit) as ProjectHistoryRow[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourcePath: row.source_path,
    sourceFormat: row.source_format,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chapterCount: row.chapter_count,
    segmentCount: row.segment_count,
    lastRenderAt: row.last_render_at ?? undefined,
    lastRenderState: row.last_render_state ?? undefined,
    lastOutputMp3Path: row.last_output_mp3_path ?? undefined
  }));
}

export function listRenderJobsForProject(projectId: string, limitInput?: number): RenderJob[] {
  return listRenderJobsForProjectFromDatabase(db(), projectId, limitInput);
}

export function getProjectHistoryDetails(projectId: string, limitInput?: number): ProjectHistoryDetails | null {
  const database = db();
  const loadDetails = database.transaction((id: string, limit: number) => {
    const project = getProjectFromDatabase(database, id);
    if (!project) {
      return null;
    }
    const recentRenderJobs = listRenderJobsForProjectFromDatabase(database, id, limit);
    return {
      project,
      recentRenderJobs
    } satisfies ProjectHistoryDetails;
  });

  return loadDetails(projectId, normalizeRenderHistoryLimit(limitInput));
}
