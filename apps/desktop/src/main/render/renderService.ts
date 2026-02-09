import { constants } from "node:fs";
import { access, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Project, RenderJob, RenderMetrics, RenderOptions, RenderProgress } from "../../shared/types.js";
import { sanitizeFileName } from "../../shared/fileName.js";
import { getProject, upsertRenderJob } from "../db/projectRepository.js";
import { createId } from "../utils/id.js";
import { nowIso } from "../utils/time.js";
import type { AudioRuntimeClient, BatchTtsProgress, TtsSegmentRequest } from "../sidecars/audioClient.js";
import { LlmPrepService } from "../sidecars/llmPrepService.js";
import { getFfmpegPath } from "../utils/paths.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/logging.js";

interface RenderServiceOptions {
  audioClient: AudioRuntimeClient;
  llmPrepService: LlmPrepService;
}

const RENDER_WORK_DIR_PREFIX = ".render-";
const RENDER_WORK_DIR_STALE_TTL_MS = 24 * 60 * 60 * 1000;

export class RenderService {
  private readonly audioClient: AudioRuntimeClient;
  private readonly llmPrepService: LlmPrepService;

  constructor(options: RenderServiceOptions) {
    this.audioClient = options.audioClient;
    this.llmPrepService = options.llmPrepService;
  }

  async renderProject(
    projectId: string,
    options: RenderOptions,
    signal?: AbortSignal,
    existingJobId?: string,
    onProgress?: (progress: RenderProgress) => void
  ): Promise<RenderJob> {
    const job: RenderJob = {
      id: existingJobId ?? createId(),
      projectId,
      state: "queued"
    };
    logInfo("render", "job queued", {
      jobId: job.id,
      projectId,
      outputDir: options.outputDir,
      outputFileName: options.outputFileName,
      speed: options.speed,
      enableLlmPrep: options.enableLlmPrep
    });
    upsertRenderJob(job);

    const startedAt = nowIso();
    job.state = "running";
    job.startedAt = startedAt;
    upsertRenderJob(job);

    const renderStart = Date.now();
    let workingDir = "";
    let latestPercent = 0;
    let latestPhase: RenderProgress["phase"] = "preparing";
    let synthStartMs = 0;
    let synthExactMode = false;
    const emitProgress = (next: {
      phase: RenderProgress["phase"];
      percent: number;
      message: string;
      approximate: boolean;
      etaSeconds?: number;
      completedSegments?: number;
      totalSegments?: number;
    }) => {
      latestPhase = next.phase;
      latestPercent = Math.max(latestPercent, Math.min(100, Math.round(next.percent)));
      const progress: RenderProgress = {
        phase: next.phase,
        percent: latestPercent,
        message: next.message,
        approximate: next.approximate,
        updatedAt: nowIso(),
        etaSeconds: next.etaSeconds,
        completedSegments: next.completedSegments,
        totalSegments: next.totalSegments
      };
      job.progress = progress;
      onProgress?.(progress);
    };

    try {
      const outputDir = options.outputDir.trim();
      if (!outputDir) {
        throw new Error("Output directory is required before rendering.");
      }
      await mkdir(outputDir, { recursive: true });
      await cleanupStaleRenderDirs(outputDir, RENDER_WORK_DIR_STALE_TTL_MS);
      emitProgress({
        phase: "preparing",
        percent: 2,
        message: "Preparing render workspace...",
        approximate: false
      });
      logDebug("render", "job started", { jobId: job.id, outputDir });

      const project = getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      workingDir = join(outputDir, `${RENDER_WORK_DIR_PREFIX}${job.id}`);
      await mkdir(workingDir, { recursive: true });

      const baseSegments = project.chapters
        .sort((a, b) => a.order - b.order)
        .flatMap((chapter) => chapter.segments.sort((a, b) => a.order - b.order));

      if (options.enableLlmPrep) {
        emitProgress({
          phase: "llm-prep",
          percent: 5,
          message: "Preparing text for narration...",
          approximate: false
        });
      }

      const llmPrepStartedAt = Date.now();
      const segments = await this.prepareSegments(project, options, signal, (completed, total) => {
        const ratio = total > 0 ? completed / total : 1;
        const percent = lerp(5, 20, ratio);
        emitProgress({
          phase: "llm-prep",
          percent,
          message: `Preparing text (${completed}/${total})...`,
          approximate: false,
          etaSeconds: completed >= 3
            ? estimateEtaSeconds(completed, total, (Date.now() - llmPrepStartedAt) / 1000)
            : undefined,
          completedSegments: completed,
          totalSegments: total
        });
      });

      emitProgress({
        phase: "synth",
        percent: 20,
        message: "Synthesizing audio...",
        approximate: true
      });
      logDebug("render", "segments prepared", { jobId: job.id, count: segments.length });
      const ttsPayload: TtsSegmentRequest[] = segments.map((segment) => {
        const speaker = project.speakers.find((item) => item.id === segment.speakerId);
        if (!speaker) {
          throw new Error(`Speaker missing for segment ${segment.id}`);
        }
        return {
          id: segment.id,
          text: segment.text,
          voiceId: speaker.voiceId,
          model: speaker.ttsModel,
          speed: options.speed,
          expressionTags: segment.expressionTags
        };
      });

      const totalSynthSegments = ttsPayload.length;
      const estimatedSynthSeconds = estimateApproxSynthSeconds(baseSegments, options.speed);
      synthStartMs = Date.now();
      const synthApproxInterval = setInterval(() => {
        if (synthExactMode) {
          return;
        }
        const elapsedSeconds = (Date.now() - synthStartMs) / 1000;
        const ratio = Math.min(elapsedSeconds / estimatedSynthSeconds, 0.98);
        const completedSegments = totalSynthSegments > 0
          ? Math.min(totalSynthSegments, Math.floor(ratio * totalSynthSegments))
          : 0;
        emitProgress({
          phase: "synth",
          percent: lerp(20, 92, ratio),
          message: "Synthesizing audio...",
          approximate: true,
          etaSeconds: elapsedSeconds >= 8 ? Math.max(1, Math.round(estimatedSynthSeconds - elapsedSeconds)) : undefined,
          completedSegments,
          totalSegments: totalSynthSegments || undefined
        });
      }, 700);

      const onSynthesisProgress = (progress: BatchTtsProgress) => {
        const safeTotal = progress.totalSegments > 0 ? progress.totalSegments : totalSynthSegments;
        const safeCompleted = Math.min(Math.max(progress.completedSegments, 0), safeTotal);
        synthExactMode = true;
        const elapsedSeconds = Math.max(1, (Date.now() - synthStartMs) / 1000);
        emitProgress({
          phase: "synth",
          percent: lerp(20, 92, safeTotal > 0 ? safeCompleted / safeTotal : 1),
          message: `Synthesizing audio (${safeCompleted}/${safeTotal})...`,
          approximate: false,
          etaSeconds: safeCompleted >= 3
            ? estimateEtaSeconds(safeCompleted, safeTotal, elapsedSeconds)
            : undefined,
          completedSegments: safeCompleted,
          totalSegments: safeTotal
        });
      };

      let ttsResult: Awaited<ReturnType<AudioRuntimeClient["batchTts"]>>;
      try {
        ttsResult = await this.audioClient.batchTts(ttsPayload, workingDir, onSynthesisProgress);
      } finally {
        clearInterval(synthApproxInterval);
      }
      emitProgress({
        phase: "synth",
        percent: 92,
        message: "Audio synthesis complete.",
        approximate: !synthExactMode,
        completedSegments: totalSynthSegments,
        totalSegments: totalSynthSegments
      });
      logDebug("render", "tts batch complete", { jobId: job.id, wavCount: ttsResult.wavPaths.length, workingDir });

      if (signal?.aborted) {
        throw new Error("Render canceled");
      }

      const outputName = sanitizeFileName(options.outputFileName || project.title) || "podcast";
      const outputMp3Path = join(outputDir, `${outputName}.mp3`);
      emitProgress({
        phase: "merge",
        percent: 92,
        message: "Merging audio files...",
        approximate: true
      });

      const mergeStartedAt = Date.now();
      const estimatedMergeSeconds = estimateMergeSeconds(ttsResult.wavPaths.length);
      const mergeApproxInterval = setInterval(() => {
        const elapsedSeconds = (Date.now() - mergeStartedAt) / 1000;
        const ratio = Math.min(elapsedSeconds / estimatedMergeSeconds, 0.98);
        emitProgress({
          phase: "merge",
          percent: lerp(92, 98, ratio),
          message: "Merging audio files...",
          approximate: true,
          etaSeconds: elapsedSeconds >= 3 ? Math.max(1, Math.round(estimatedMergeSeconds - elapsedSeconds)) : undefined
        });
      }, 700);

      logDebug("render", "merging wav to mp3", {
        jobId: job.id,
        wavCount: ttsResult.wavPaths.length,
        outputMp3Path
      });
      try {
        await mergeToMp3(ttsResult.wavPaths, outputMp3Path);
      } finally {
        clearInterval(mergeApproxInterval);
      }

      emitProgress({
        phase: "finalizing",
        percent: 99,
        message: "Finalizing render...",
        approximate: false
      });

      const metrics = computeMetrics(project, renderStart);

      job.state = "completed";
      job.finishedAt = nowIso();
      job.outputMp3Path = outputMp3Path;
      job.metrics = metrics;
      emitProgress({
        phase: "finalizing",
        percent: 100,
        message: "Render complete.",
        approximate: false
      });
      upsertRenderJob(job);
      logInfo("render", "job completed", { jobId: job.id, outputMp3Path, metrics });
      return job;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canceled = signal?.aborted || message.toLowerCase().includes("canceled");
      job.state = canceled ? "canceled" : "failed";
      job.finishedAt = nowIso();
      job.errorText = message;
      emitProgress({
        phase: latestPhase,
        percent: latestPercent,
        message: canceled ? "Render canceled." : "Render failed.",
        approximate: false
      });
      upsertRenderJob(job);
      if (canceled) {
        logWarn("render", "job canceled", { jobId: job.id, message });
      } else {
        logError("render", "job failed", { jobId: job.id, message, error });
      }
      return job;
    } finally {
      if (workingDir) {
        try {
          await rm(workingDir, { recursive: true, force: true });
          logDebug("render", "removed working directory", { jobId: job.id, workingDir });
        } catch (error) {
          logWarn("render", "failed to remove working directory", { jobId: job.id, workingDir, error });
        }
      }
    }
  }

  private async prepareSegments(
    project: Project,
    options: RenderOptions,
    signal?: AbortSignal,
    onLlmPrepProgress?: (completed: number, total: number) => void
  ) {
    const segments = project.chapters
      .sort((a, b) => a.order - b.order)
      .flatMap((chapter) => chapter.segments.sort((a, b) => a.order - b.order));

    if (!options.enableLlmPrep) {
      return segments;
    }

    const updated = [];
    const total = segments.length;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }
      if (signal?.aborted) {
        throw new Error("Render canceled");
      }
      const llm = await this.llmPrepService.prepareText(segment.text);
      updated.push({ ...segment, text: llm.preparedText });
      onLlmPrepProgress?.(index + 1, total);
    }
    return updated;
  }
}

async function cleanupStaleRenderDirs(outputDir: string, olderThanMs: number): Promise<void> {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    const cutoff = Date.now() - olderThanMs;
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(RENDER_WORK_DIR_PREFIX)) {
        continue;
      }
      const entryPath = join(outputDir, entry.name);
      try {
        const details = await stat(entryPath);
        if (details.mtimeMs < cutoff) {
          await rm(entryPath, { recursive: true, force: true });
          logDebug("render", "removed stale render directory", { entryPath, mtimeMs: details.mtimeMs });
        }
      } catch (error) {
        logWarn("render", "skipping stale cleanup entry after error", { entryPath, error });
      }
    }
  } catch (error) {
    logWarn("render", "failed to inspect render directory for stale cleanup", { outputDir, error });
  }
}

function computeMetrics(project: Project, renderStartMs: number): RenderMetrics {
  const segmentCount = project.chapters.reduce((acc, chapter) => acc + chapter.segments.length, 0);
  const audioSeconds = project.chapters
    .flatMap((chapter) => chapter.segments)
    .reduce((acc, segment) => acc + segment.estDurationSec, 0);
  const renderSeconds = (Date.now() - renderStartMs) / 1000;

  return {
    segmentCount,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    renderSeconds: Number(renderSeconds.toFixed(2)),
    realtimeFactor: Number((renderSeconds / Math.max(audioSeconds, 1)).toFixed(2))
  };
}

async function mergeToMp3(wavPaths: string[], outputMp3Path: string): Promise<void> {
  if (wavPaths.length === 0) {
    throw new Error("No WAV files generated by TTS service");
  }

  const listPath = `${outputMp3Path}.concat.txt`;
  const content = wavPaths.map((wavPath) => `file '${wavPath.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, content, "utf-8");
  logDebug("render/ffmpeg", "concat list written", { listPath, entries: wavPaths.length });

  await runFfmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-af", "aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    outputMp3Path
  ]);
}

async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegPath = await resolveFfmpegPath();
  logDebug("render/ffmpeg", "spawn", { ffmpegPath, args });

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: "pipe" });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        logError("render/ffmpeg", "failed", { ffmpegPath, code, stderr });
        reject(new Error(`ffmpeg failed (${code}): ${stderr}`));
        return;
      }
      logDebug("render/ffmpeg", "completed", { ffmpegPath });
      resolve();
    });
  });
}

async function resolveFfmpegPath(): Promise<string> {
  const bundledPath = getFfmpegPath();
  try {
    await access(bundledPath, constants.X_OK);
    return bundledPath;
  } catch {
    return "ffmpeg";
  }
}

function lerp(start: number, end: number, ratio: number): number {
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  return start + ((end - start) * boundedRatio);
}

function estimateEtaSeconds(completed: number, total: number, elapsedSeconds: number): number | undefined {
  if (completed <= 0 || total <= completed || elapsedSeconds <= 0) {
    return undefined;
  }
  const ratePerSecond = completed / elapsedSeconds;
  if (ratePerSecond <= 0) {
    return undefined;
  }
  const remaining = total - completed;
  return Math.max(1, Math.round(remaining / ratePerSecond));
}

function estimateApproxSynthSeconds(segments: Project["chapters"][number]["segments"], speed: number): number {
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const audioSeconds = segments.reduce((sum, segment) => sum + Math.max(segment.estDurationSec, 0), 0);
  // Conservative multiplier for python expressive path and unknown machine load.
  const estimated = (audioSeconds / safeSpeed) * 1.6;
  return Math.max(20, Math.min(estimated, 60 * 60));
}

function estimateMergeSeconds(wavCount: number): number {
  const boundedCount = Math.max(1, wavCount);
  return Math.max(4, Math.min(90, (boundedCount * 0.18) + 2));
}
