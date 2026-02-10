import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, shell } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join } from "node:path";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import type {
  BootstrapStartInput,
  CreateProjectInput,
  LlmPrepInput,
  ProjectHistoryQuery,
  RenderJob,
  RenderOptions,
  RenderProgress,
  UpdateSegmentsInput,
  UpdateSpeakersInput,
  UpdateUiPreferencesInput,
  UpdateRuntimeResourceSettingsInput,
  VoicePreviewInput
} from "../../shared/types.js";
import { importBook } from "../ingestion/importBook.js";
import { buildProject } from "../ingestion/projectBuilder.js";
import {
  createProject,
  getProject,
  getProjectHistoryDetails,
  listProjects,
  listRenderJobsForProject,
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
import { UpdaterService } from "../system/updaterService.js";
import { DiagnosticsService } from "../system/diagnostics.js";
import { RuntimeResourceSettingsService } from "../system/runtimeResourceSettingsService.js";
import { UiPreferencesService } from "../system/uiPreferencesService.js";

interface IpcDependencies {
  audioSidecar: AudioSidecarManager;
  llmPrep: LlmPrepService;
  bootstrap: BootstrapManager;
  updater: UpdaterService;
  diagnostics: DiagnosticsService;
  runtimeResourceSettings: RuntimeResourceSettingsService;
  uiPreferences: UiPreferencesService;
  assertTrustedIpcSender: (event: IpcMainInvokeEvent) => void;
}

interface ActiveRenderRecord {
  controller: AbortController;
  progress?: RenderProgress;
}

type SecureHandler<TArgs extends unknown[], TResult> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<TResult> | TResult;

export function registerIpcHandlers(deps: IpcDependencies): void {
  logInfo("ipc", "register handlers");
  const renderService = new RenderService({
    audioClient: deps.audioSidecar.client,
    llmPrepService: deps.llmPrep
  });

  const activeRenders = new Map<string, ActiveRenderRecord>();
  let renderPowerBlockerId: number | null = null;

  const ensureRenderPowerBlocker = () => {
    if (renderPowerBlockerId !== null && powerSaveBlocker.isStarted(renderPowerBlockerId)) {
      return;
    }
    renderPowerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    logDebug("ipc/render", "power save blocker started", { renderPowerBlockerId, activeJobs: activeRenders.size });
  };

  const releaseRenderPowerBlockerIfIdle = () => {
    if (activeRenders.size > 0) {
      return;
    }
    if (renderPowerBlockerId === null) {
      return;
    }
    if (powerSaveBlocker.isStarted(renderPowerBlockerId)) {
      powerSaveBlocker.stop(renderPowerBlockerId);
    }
    logDebug("ipc/render", "power save blocker released", { renderPowerBlockerId });
    renderPowerBlockerId = null;
  };

  const registerSecureHandle = <TArgs extends unknown[], TResult>(
    channel: string,
    handler: SecureHandler<TArgs, TResult>
  ) => {
    ipcMain.handle(channel, async (event, ...args) => {
      deps.assertTrustedIpcSender(event);
      return handler(event, ...(args as TArgs));
    });
  };

  registerSecureHandle(IPC_CHANNELS.getBootstrapStatus, async () => {
    return deps.bootstrap.getStatus();
  });

  registerSecureHandle(IPC_CHANNELS.startBootstrap, async (_event, input: BootstrapStartInput) => {
    logInfo("ipc/bootstrap", "start request", {
      installPath: input.installPath,
      kokoroBackend: input.kokoroBackend,
      selectedPackIds: input.selectedPackIds
    });
    return deps.bootstrap.start(input);
  });

  registerSecureHandle(IPC_CHANNELS.setBootstrapAutoStartEnabled, async (_event, enabled: boolean) => {
    return deps.bootstrap.setAutoStartEnabled(enabled);
  });

  registerSecureHandle(IPC_CHANNELS.importBook, async (_event, filePath: string) => {
    return importBook(filePath);
  });

  registerSecureHandle(IPC_CHANNELS.createProject, async (_event, input: CreateProjectInput) => {
    const project = buildProject(input);
    return createProject(project);
  });

  registerSecureHandle(IPC_CHANNELS.updateSpeakers, async (_event, input: UpdateSpeakersInput) => {
    return updateSpeakers(input);
  });

  registerSecureHandle(IPC_CHANNELS.updateSegments, async (_event, input: UpdateSegmentsInput) => {
    return updateSegments(input);
  });

  registerSecureHandle(IPC_CHANNELS.renderProject, async (_event, projectId: string, options: RenderOptions) => {
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
    ensureRenderPowerBlocker();

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
        releaseRenderPowerBlockerIfIdle();
        logDebug("ipc/render", "render controller released", { jobId });
      });

    return queuedJob;
  });

  registerSecureHandle(IPC_CHANNELS.cancelRender, async (_event, jobId: string) => {
    const active = activeRenders.get(jobId);
    if (!active) {
      logWarn("ipc/render", "cancel requested for unknown job", { jobId });
      return;
    }
    logInfo("ipc/render", "cancel requested", { jobId });
    active.controller.abort();
  });

  registerSecureHandle(IPC_CHANNELS.getRenderStatus, async (_event, jobId: string) => {
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

  registerSecureHandle(IPC_CHANNELS.listVoices, async () => {
    return deps.audioSidecar.client.listVoices();
  });

  registerSecureHandle(IPC_CHANNELS.previewVoice, async (_event, input: VoicePreviewInput) => {
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

  registerSecureHandle(IPC_CHANNELS.validateExpressionTags, async (_event, text: string) => {
    const local = validateExpressionTags(text);
    if (!local.isValid) {
      return local;
    }
    return deps.audioSidecar.client.validateTags(text);
  });

  registerSecureHandle(IPC_CHANNELS.runOptionalLlmPrep, async (_event, input: LlmPrepInput) => {
    return deps.llmPrep.prepareText(input.text);
  });

  registerSecureHandle(IPC_CHANNELS.getSystemHealth, async () => {
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

  registerSecureHandle(IPC_CHANNELS.getUpdateState, async () => {
    return deps.updater.getState();
  });

  registerSecureHandle(IPC_CHANNELS.checkForUpdates, async () => {
    return deps.updater.checkForUpdates();
  });

  registerSecureHandle(IPC_CHANNELS.installDownloadedUpdate, async () => {
    await deps.updater.installDownloadedUpdate();
  });

  registerSecureHandle(IPC_CHANNELS.getDiagnosticsSnapshot, async () => {
    return deps.diagnostics.getSnapshot();
  });

  registerSecureHandle(IPC_CHANNELS.getDefaultRenderOutputDir, async () => {
    return getDefaultRenderOutputDir();
  });

  registerSecureHandle(IPC_CHANNELS.readAudioFile, async (_event, path: string) => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      throw new Error("Cannot read audio file: path is empty.");
    }
    if (!isAbsolute(trimmedPath)) {
      throw new Error(`Cannot read audio file: expected absolute path, got "${path}".`);
    }

    const details = await stat(trimmedPath).catch(() => null);
    if (!details?.isFile()) {
      throw new Error("Cannot read audio file: file does not exist.");
    }

    await access(trimmedPath, fsConstants.R_OK).catch(() => {
      throw new Error("Cannot read audio file: file is not readable.");
    });

    const audioBuffer = await readFile(trimmedPath);
    return {
      mimeType: resolveAudioMimeType(trimmedPath),
      audioBase64: audioBuffer.toString("base64")
    };
  });

  registerSecureHandle(IPC_CHANNELS.getRuntimeResourceSettings, async () => {
    return deps.runtimeResourceSettings.getSettings();
  });

  registerSecureHandle(
    IPC_CHANNELS.updateRuntimeResourceSettings,
    async (_event, input: UpdateRuntimeResourceSettingsInput) => {
      const settings = await deps.runtimeResourceSettings.updateSettings(input);
      deps.audioSidecar.setRuntimeResourcePolicy(deps.runtimeResourceSettings.getPolicy());
      return settings;
    }
  );

  registerSecureHandle(IPC_CHANNELS.revealInFileManager, async (_event, path: string) => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      throw new Error("Cannot reveal file: path is empty.");
    }
    if (!isAbsolute(trimmedPath)) {
      throw new Error(`Cannot reveal file: expected absolute path, got "${path}".`);
    }
    logInfo("ipc/dialog", "reveal in file manager", { path: trimmedPath });

    const details = await stat(trimmedPath).catch(() => null);
    if (details?.isDirectory()) {
      const openError = await shell.openPath(trimmedPath);
      if (openError) {
        throw new Error(openError);
      }
      return;
    }

    shell.showItemInFolder(trimmedPath);
  });

  registerSecureHandle(IPC_CHANNELS.getProject, (_event, projectId: string) => {
    return getProject(projectId);
  });

  registerSecureHandle(IPC_CHANNELS.listProjects, (_event, query?: ProjectHistoryQuery) => {
    return listProjects(query ?? {});
  });

  registerSecureHandle(IPC_CHANNELS.listProjectRenderJobs, (_event, projectId: string, limit?: number) => {
    return listRenderJobsForProject(projectId, limit);
  });

  registerSecureHandle(IPC_CHANNELS.getProjectHistoryDetails, (_event, projectId: string, limit?: number) => {
    return getProjectHistoryDetails(projectId, limit);
  });

  registerSecureHandle(IPC_CHANNELS.getUiPreferences, () => {
    return deps.uiPreferences.getPreferences();
  });

  registerSecureHandle(IPC_CHANNELS.updateUiPreferences, (_event, input: UpdateUiPreferencesInput) => {
    return deps.uiPreferences.updatePreferences(input);
  });

  registerSecureHandle(IPC_CHANNELS.showOpenFileDialog, async (event, filters?: { name: string; extensions: string[] }[]) => {
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

  registerSecureHandle(IPC_CHANNELS.showOpenDirectoryDialog, async (event, defaultPath?: string) => {
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

function resolveAudioMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".mp3":
    default:
      return "audio/mpeg";
  }
}
