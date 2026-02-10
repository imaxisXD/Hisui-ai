import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importBook } from "./ingestion/importBook.js";
import { buildProject } from "./ingestion/projectBuilder.js";
import type { SpeakerProfile } from "../shared/types.js";
import type { BatchTtsProgress, TtsSegmentRequest } from "./sidecars/audioClient.js";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir()
  }
}));

const repositoryMock = vi.hoisted(() => ({
  getProject: vi.fn(),
  upsertRenderJob: vi.fn()
}));

vi.mock("./db/projectRepository.js", () => repositoryMock);

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args)
}));

function createSuccessfulSpawn() {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  child.stderr = new EventEmitter();
  process.nextTick(() => {
    child.emit("close", 0);
  });
  return child;
}

describe("import -> cast -> render integration", () => {
  let outputDir = "";

  beforeEach(async () => {
    repositoryMock.getProject.mockReset();
    repositoryMock.upsertRenderJob.mockReset();
    spawnMock.mockReset();

    outputDir = await mkdtemp(join(tmpdir(), "local-podcast-render-"));
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const outputMp3Path = args[args.length - 1];
      if (typeof outputMp3Path === "string") {
        writeFileSync(outputMp3Path, Buffer.from("fake-mp3"));
      }
      return createSuccessfulSpawn();
    });
  });

  afterEach(async () => {
    if (outputDir) {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("imports fixture text, maps multiple speakers, and completes an MP3 render job", async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = resolve(thisDir, "../../../../");
    const fixturePath = join(workspaceRoot, "test-fixtures/txt/sample-book.txt");

    const imported = await importBook(fixturePath);
    expect(imported.sourceFormat).toBe("txt");
    expect(imported.chapters.length).toBeGreaterThan(0);

    const speakers: SpeakerProfile[] = [
      {
        id: "speaker-kokoro",
        name: "Narrator",
        ttsModel: "kokoro",
        voiceId: "kokoro_narrator"
      },
      {
        id: "speaker-chatter",
        name: "Dialogue",
        ttsModel: "chatterbox",
        voiceId: "chatterbox_expressive"
      }
    ];

    const project = buildProject({
      title: imported.title,
      sourcePath: imported.sourcePath,
      sourceFormat: imported.sourceFormat,
      chapters: imported.chapters,
      speakers,
      settings: {
        speed: 1,
        outputSampleRate: 24000,
        llmPrepEnabledByDefault: false
      }
    });

    const fallbackSpeaker = speakers[0];
    if (!fallbackSpeaker) {
      throw new Error("Expected at least one speaker for integration test");
    }

    // Simulate cast assignment pass by alternating speakers across all segments.
    let segmentIndex = 0;
    for (const chapter of project.chapters) {
      for (const segment of chapter.segments) {
        const assigned = speakers[segmentIndex % speakers.length];
        segment.speakerId = assigned?.id ?? fallbackSpeaker.id;
        if (segment.text.includes("[laughs]")) {
          segment.expressionTags = ["laughs"];
        }
        segmentIndex += 1;
      }
    }

    repositoryMock.getProject.mockReturnValue(project);
    const staleDir = join(outputDir, ".render-stale-old");
    const freshDir = join(outputDir, ".render-stale-new");
    await mkdir(staleDir, { recursive: true });
    await mkdir(freshDir, { recursive: true });
    const staleTimestamp = new Date(Date.now() - (26 * 60 * 60 * 1000));
    await utimes(staleDir, staleTimestamp, staleTimestamp);

    const batchTtsMock = vi.fn(async (
      segments: TtsSegmentRequest[],
      batchOutputDir: string,
      onProgress?: (progress: BatchTtsProgress) => void
    ) => {
      await mkdir(batchOutputDir, { recursive: true });
      const wavPaths: string[] = [];
      for (let i = 0; i < segments.length; i += 1) {
        const current = segments[i];
        if (!current) {
          continue;
        }
        const wavPath = join(batchOutputDir, `seg-${String(i).padStart(5, "0")}-${current.id}.wav`);
        await writeFile(wavPath, Buffer.from("RIFF"));
        wavPaths.push(wavPath);
        onProgress?.({ completedSegments: i + 1, totalSegments: segments.length });
      }
      return { wavPaths };
    });

    const llmPrepMock = vi.fn(async (text: string) => ({
      originalText: text,
      preparedText: text,
      changed: false
    }));

    const { RenderService } = await import("./render/renderService.js");
    const service = new RenderService({
      audioClient: { batchTts: batchTtsMock } as never,
      llmPrepService: { prepareText: llmPrepMock } as never
    });
    const progressEvents: Array<{
      phase: string;
      percent: number;
      etaSeconds?: number;
    }> = [];

    const job = await service.renderProject(project.id, {
      outputDir,
      outputFileName: "fixture-render",
      speed: 1,
      enableLlmPrep: false
    }, undefined, undefined, (progress) => {
      progressEvents.push({
        phase: progress.phase,
        percent: progress.percent,
        etaSeconds: progress.etaSeconds
      });
    });

    expect(job.state).toBe("completed");
    expect(job.outputMp3Path).toBe(join(outputDir, "fixture-render.mp3"));
    expect(existsSync(job.outputMp3Path ?? "")).toBe(true);
    expect(existsSync(`${job.outputMp3Path}.concat.txt`)).toBe(true);
    expect(readFileSync(`${job.outputMp3Path}.concat.txt`, "utf-8")).toContain("seg-00000");
    expect(batchTtsMock).toHaveBeenCalledTimes(1);

    const renderedSegments = batchTtsMock.mock.calls[0]?.[0];
    expect(renderedSegments).toBeDefined();
    if (!renderedSegments) {
      throw new Error("Expected rendered segments in first batchTts call");
    }
    expect(renderedSegments.length).toBeGreaterThan(0);
    expect(renderedSegments.some((segment) => segment.voiceId === "kokoro_narrator")).toBe(true);
    expect(renderedSegments.some((segment) => segment.voiceId === "chatterbox_expressive")).toBe(true);
    expect(renderedSegments.some((segment) => segment.model === "kokoro")).toBe(true);
    expect(renderedSegments.some((segment) => segment.model === "chatterbox")).toBe(true);

    const ffmpegArgs = spawnMock.mock.calls[0]?.[1] as string[] | undefined;
    expect(ffmpegArgs).toBeDefined();
    if (!ffmpegArgs) {
      throw new Error("Expected ffmpeg spawn arguments to be captured");
    }
    expect(ffmpegArgs).toContain("-af");
    expect(ffmpegArgs).toContain("aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono");
    expect(ffmpegArgs).toContain("libmp3lame");

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.some((event) => event.phase === "synth")).toBe(true);
    expect(progressEvents.some((event) => event.phase === "merge")).toBe(true);
    expect(progressEvents[progressEvents.length - 1]?.percent).toBe(100);
    for (let index = 1; index < progressEvents.length; index += 1) {
      const previous = progressEvents[index - 1];
      const current = progressEvents[index];
      expect(current?.percent ?? 0).toBeGreaterThanOrEqual(previous?.percent ?? 0);
    }

    expect(existsSync(join(outputDir, `.render-${job.id}`))).toBe(false);
    expect(existsSync(staleDir)).toBe(false);
    expect(existsSync(freshDir)).toBe(true);
  });

  it("cleans up current render temp directory after failed render", async () => {
    const project = buildProject({
      title: "Failed Render Fixture",
      sourcePath: "(fixture)",
      sourceFormat: "txt",
      chapters: [
        { title: "One", text: "Hello world.\n\nSecond paragraph." }
      ],
      speakers: [
        {
          id: "speaker-kokoro",
          name: "Narrator",
          ttsModel: "kokoro",
          voiceId: "kokoro_narrator"
        }
      ]
    });

    repositoryMock.getProject.mockReturnValue(project);

    const batchTtsMock = vi.fn(async (_segments: TtsSegmentRequest[], batchOutputDir: string) => {
      await mkdir(batchOutputDir, { recursive: true });
      await writeFile(join(batchOutputDir, "seg-00000-test.wav"), Buffer.from("RIFF"));
      throw new Error("simulated tts failure");
    });

    const { RenderService } = await import("./render/renderService.js");
    const service = new RenderService({
      audioClient: { batchTts: batchTtsMock } as never,
      llmPrepService: { prepareText: vi.fn(async (text: string) => ({ originalText: text, preparedText: text, changed: false })) } as never
    });

    const job = await service.renderProject(project.id, {
      outputDir,
      outputFileName: "fixture-failure",
      speed: 1,
      enableLlmPrep: false
    });

    expect(job.state).toBe("failed");
    expect(job.errorText).toContain("simulated tts failure");
    expect(existsSync(join(outputDir, `.render-${job.id}`))).toBe(false);
  });

  it("forces CPU device override for Kokoro-only renders", async () => {
    const project = buildProject({
      title: "CPU Acceleration Fixture",
      sourcePath: "(fixture)",
      sourceFormat: "txt",
      chapters: [
        { title: "One", text: "Only Kokoro narration for this render path test." }
      ],
      speakers: [
        {
          id: "speaker-kokoro",
          name: "Narrator",
          ttsModel: "kokoro",
          voiceId: "kokoro_narrator"
        }
      ]
    });
    repositoryMock.getProject.mockReturnValue(project);

    const batchTtsMock = vi.fn(async (
      _segments: TtsSegmentRequest[],
      batchOutputDir: string,
      _onProgress?: (progress: BatchTtsProgress) => void,
      _runtimeOptions?: { kokoroNodeDevice?: "cpu" }
    ) => {
      await mkdir(batchOutputDir, { recursive: true });
      const wavPath = join(batchOutputDir, "seg-00000-test.wav");
      await writeFile(wavPath, Buffer.from("RIFF"));
      return { wavPaths: [wavPath] };
    });

    const { RenderService } = await import("./render/renderService.js");
    const service = new RenderService({
      audioClient: {
        batchTts: batchTtsMock
      } as never,
      llmPrepService: {
        prepareText: vi.fn(async (text: string) => ({ originalText: text, preparedText: text, changed: false }))
      } as never
    });

    const job = await service.renderProject(project.id, {
      outputDir,
      outputFileName: "fixture-cpu-accel",
      speed: 1,
      enableLlmPrep: false
    });

    expect(job.state).toBe("completed");
    expect(batchTtsMock).toHaveBeenCalledTimes(1);
    const runtimeOptions = (batchTtsMock.mock.calls[0] as unknown[] | undefined)?.[3];
    expect(runtimeOptions).toEqual({
      kokoroNodeDevice: "cpu"
    });
  });
});
