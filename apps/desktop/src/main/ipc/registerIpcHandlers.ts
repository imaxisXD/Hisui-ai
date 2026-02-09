import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import type {
  BootstrapStartInput,
  CreateProjectInput,
  RenderJob,
  RenderOptions,
  RenderProgress,
  VoicePreviewInput
} from "../../shared/types.js";
import { importBook } from "../ingestion/importBook.js";
import { buildProject } from "../ingestion/projectBuilder.js";
import {
  createProject,
  getProject,
  getRenderJob,
  updateSpeakers,
  updateSegments,
  upsertRenderJob
} from "../db/projectRepository.js";
import { AudioSidecarManager } from "../sidecars/audioSidecarManager.js";
import { LlmPrepService } from "../sidecars/llmPrepService.js";
import { validateExpressionTags } from "../render/expressionTags.js";
import { getDiskHealth } from "../utils/system.js";
import { createId } from "../utils/id.js";
import { RenderService } from "../render/renderService.js";
import { BootstrapManager } from "../bootstrap/bootstrapManager.js";
import { nowIso } from "../utils/time.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/logging.js";

interface IpcDependencies {
  audioSidecar: AudioSidecarManager;
  llmPrep: LlmPrepService;
  bootstrap: BootstrapManager;
}

interface ActiveRenderRecord {
  controller: AbortController;
  progress?: RenderProgress;
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  logInfo("ipc", "register handlers");
  const renderService = new RenderService({
    audioClient: deps.audioSidecar.client,
    llmPrepService: deps.llmPrep
  });

  const activeRenders = new Map<string, ActiveRenderRecord>();

  ipcMain.handle(IPC_CHANNELS.getBootstrapStatus, async () => {
    return deps.bootstrap.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.startBootstrap, async (_event, input: BootstrapStartInput) => {
    logInfo("ipc/bootstrap", "start request", {
      installPath: input.installPath,
      kokoroBackend: input.kokoroBackend,
      selectedPackIds: input.selectedPackIds
    });
    return deps.bootstrap.start(input);
  });

  ipcMain.handle(IPC_CHANNELS.importBook, async (_event, filePath: string) => {
    return importBook(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.createProject, async (_event, input: CreateProjectInput) => {
    const project = buildProject(input);
    return createProject(project);
  });

  ipcMain.handle(IPC_CHANNELS.updateSpeakers, async (_event, input) => {
    return updateSpeakers(input);
  });

  ipcMain.handle(IPC_CHANNELS.updateSegments, async (_event, input) => {
    return updateSegments(input);
  });

  ipcMain.handle(IPC_CHANNELS.renderProject, async (_event, projectId: string, options: RenderOptions) => {
    const jobId = createId();
    const resolvedOutputDir = options.outputDir.trim() || getDefaultRenderOutputDir();
    const resolvedOptions: RenderOptions = {
      ...options,
      outputDir: resolvedOutputDir
    };
    logInfo("ipc/render", "queue render job", {
      jobId,
      projectId,
      outputDir: resolvedOptions.outputDir,
      outputFileName: resolvedOptions.outputFileName,
      speed: resolvedOptions.speed,
      enableLlmPrep: resolvedOptions.enableLlmPrep
    });
    if (!options.outputDir.trim()) {
      logInfo("ipc/render", "output directory defaulted", { jobId, outputDir: resolvedOutputDir });
    }
    const queuedJob: RenderJob = {
      id: jobId,
      projectId,
      state: "queued"
    };
    upsertRenderJob(queuedJob);

    const controller = new AbortController();
    activeRenders.set(jobId, { controller });

    void renderService
      .renderProject(projectId, resolvedOptions, controller.signal, jobId, (progress) => {
        const active = activeRenders.get(jobId);
        if (!active) {
          return;
        }
        active.progress = progress;
      })
      .then((job) => {
        const details = {
          jobId: job.id,
          state: job.state,
          outputMp3Path: job.outputMp3Path,
          errorText: job.errorText
        };
        if (job.state === "failed") {
          logError("ipc/render", "render finished with failure", details);
          return;
        }
        if (job.state === "canceled") {
          logWarn("ipc/render", "render canceled", details);
          return;
        }
        logInfo("ipc/render", "render finished", details);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logError("ipc/render", "render threw before job update", { jobId, projectId, message, error });
        upsertRenderJob({
          id: jobId,
          projectId,
          state: activeRenders.get(jobId)?.controller.signal.aborted ? "canceled" : "failed",
          finishedAt: nowIso(),
          errorText: message
        });
      })
      .finally(() => {
        activeRenders.delete(jobId);
        logDebug("ipc/render", "render controller released", { jobId });
      });

    return queuedJob;
  });

  ipcMain.handle(IPC_CHANNELS.cancelRender, async (_event, jobId: string) => {
    const active = activeRenders.get(jobId);
    if (!active) {
      logWarn("ipc/render", "cancel requested for unknown job", { jobId });
      return;
    }
    logInfo("ipc/render", "cancel requested", { jobId });
    active.controller.abort();
  });

  ipcMain.handle(IPC_CHANNELS.getRenderStatus, async (_event, jobId: string) => {
    const job = getRenderJob(jobId);
    if (!job) {
      throw new Error(`Render job not found: ${jobId}`);
    }
    const active = activeRenders.get(jobId);
    if (active?.progress && (job.state === "queued" || job.state === "running")) {
      job.progress = active.progress;
    }
    return { job };
  });

  ipcMain.handle(IPC_CHANNELS.listVoices, async () => {
    return deps.audioSidecar.client.listVoices();
  });

  ipcMain.handle(IPC_CHANNELS.previewVoice, async (_event, input: VoicePreviewInput) => {
    const previewText = input.text.trim();
    if (!previewText) {
      throw new Error("Voice preview text cannot be empty.");
    }
    const outputDir = await mkdtemp(join(tmpdir(), "hisui-voice-preview-"));
    try {
      const preview = await deps.audioSidecar.client.previewVoice({
        ...input,
        text: previewText,
        speed: Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 1,
        expressionTags: input.expressionTags ?? []
      }, outputDir);
      const audioBuffer = await readFile(preview.wavPath);
      return {
        mimeType: "audio/wav",
        audioBase64: audioBuffer.toString("base64"),
        engine: preview.engine
      };
    } finally {
      await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  ipcMain.handle(IPC_CHANNELS.validateExpressionTags, async (_event, text: string) => {
    const local = validateExpressionTags(text);
    if (!local.isValid) {
      return local;
    }
    return deps.audioSidecar.client.validateTags(text);
  });

  ipcMain.handle(IPC_CHANNELS.runOptionalLlmPrep, async (_event, input) => {
    return deps.llmPrep.prepareText(input.text);
  });

  ipcMain.handle(IPC_CHANNELS.getSystemHealth, async () => {
    const audioHealthy = await deps.audioSidecar.isHealthy();
    const llmAvailable = await deps.llmPrep.available();
    const disk = await getDiskHealth();

    return {
      audioService: {
        running: audioHealthy,
        modelStatus: audioHealthy ? "ready" : "unavailable",
        error: audioHealthy ? undefined : "Sidecar health check failed"
      },
      llmService: {
        available: llmAvailable,
        error: llmAvailable ? undefined : "llama.cpp binary or model missing"
      },
      disk
    };
  });

  ipcMain.handle(IPC_CHANNELS.getDefaultRenderOutputDir, async () => {
    return getDefaultRenderOutputDir();
  });

  ipcMain.handle(IPC_CHANNELS.revealInFileManager, async (_event, path: string) => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      throw new Error("Cannot reveal file: path is empty.");
    }
    if (!isAbsolute(trimmedPath)) {
      throw new Error(`Cannot reveal file: expected absolute path, got "${path}".`);
    }
    logInfo("ipc/dialog", "reveal in file manager", { path: trimmedPath });
    shell.showItemInFolder(trimmedPath);
  });

  ipcMain.handle("app:get-project", (_event, projectId: string) => {
    return getProject(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.showOpenFileDialog, async (event, filters?: { name: string; extensions: string[] }[]) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: filters ?? [
        { name: "Books", extensions: ["epub", "pdf", "txt"] },
        { name: "All Files", extensions: ["*"] }
      ]
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      logDebug("ipc/dialog", "file dialog canceled");
      return null;
    }
    logDebug("ipc/dialog", "file selected", { path: result.filePaths[0] });
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.showOpenDirectoryDialog, async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: "Choose directory",
      buttonLabel: "Select Folder",
      defaultPath: defaultPath?.trim() || undefined,
      properties: ["openDirectory", "createDirectory"]
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      logDebug("ipc/dialog", "directory dialog canceled", { defaultPath });
      return null;
    }
    logDebug("ipc/dialog", "directory selected", { path: result.filePaths[0], defaultPath });
    return result.filePaths[0];
  });
}

function getDefaultRenderOutputDir(): string {
  const desktopDir = app.getPath("desktop");
  const appFolder = resolveOutputFolderName(app.getName());
  return join(desktopDir, appFolder);
}

function resolveOutputFolderName(appName: string): string {
  const normalized = appName.trim();
  if (!normalized || normalized.toLowerCase() === "electron") {
    return "Hisui";
  }
  return normalized;
}
