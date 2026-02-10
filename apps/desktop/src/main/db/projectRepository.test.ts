import { beforeEach, describe, expect, it, vi } from "vitest";

const projectHistoryPrepared = vi.hoisted(() => ({
  all: vi.fn(() => []),
  get: vi.fn(() => undefined),
  run: vi.fn(() => undefined)
}));

const projectRenderJobsPrepared = vi.hoisted(() => ({
  all: vi.fn(() => []),
  get: vi.fn(() => undefined),
  run: vi.fn(() => undefined)
}));

const defaultPrepared = vi.hoisted(() => ({
  all: vi.fn(() => []),
  get: vi.fn(() => undefined),
  run: vi.fn(() => undefined)
}));

vi.mock("./client.js", () => ({
  getDb: () => ({
    prepare: (sql: string) => {
      if (sql.includes("FROM projects") && sql.includes("last_render_state")) {
        return projectHistoryPrepared;
      }
      if (sql.includes("FROM render_jobs") && sql.includes("WHERE project_id = ?")) {
        return projectRenderJobsPrepared;
      }
      return defaultPrepared;
    }
  })
}));

describe("projectRepository history queries", () => {
  beforeEach(() => {
    projectHistoryPrepared.all.mockReset();
    projectRenderJobsPrepared.all.mockReset();
  });

  it("maps listProjects rows to project history payload", async () => {
    const repository = await import("./projectRepository.js");
    projectHistoryPrepared.all.mockReturnValueOnce([
      {
        id: "project-1",
        title: "Project One",
        source_path: "/tmp/project-one.txt",
        source_format: "txt",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        chapter_count: 2,
        segment_count: 8,
        last_render_at: "2026-01-02T01:00:00.000Z",
        last_render_state: "completed",
        last_output_mp3_path: "/tmp/output.mp3"
      }
    ] as never);

    const result = repository.listProjects({ limit: 5 });
    expect(result).toEqual([
      {
        id: "project-1",
        title: "Project One",
        sourcePath: "/tmp/project-one.txt",
        sourceFormat: "txt",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        chapterCount: 2,
        segmentCount: 8,
        lastRenderAt: "2026-01-02T01:00:00.000Z",
        lastRenderState: "completed",
        lastOutputMp3Path: "/tmp/output.mp3"
      }
    ]);
  });

  it("maps listRenderJobsForProject rows with limit", async () => {
    const repository = await import("./projectRepository.js");
    projectRenderJobsPrepared.all.mockReturnValueOnce([
      {
        id: "job-1",
        project_id: "project-1",
        state: "failed",
        started_at: "2026-01-02T01:00:00.000Z",
        finished_at: "2026-01-02T01:01:00.000Z",
        output_mp3_path: null,
        metrics_json: null,
        error_text: "boom"
      }
    ] as never);

    const result = repository.listRenderJobsForProject("project-1", 2);
    expect(result).toEqual([
      {
        id: "job-1",
        projectId: "project-1",
        state: "failed",
        startedAt: "2026-01-02T01:00:00.000Z",
        finishedAt: "2026-01-02T01:01:00.000Z",
        metrics: undefined,
        outputMp3Path: undefined,
        errorText: "boom"
      }
    ]);
  });
});
