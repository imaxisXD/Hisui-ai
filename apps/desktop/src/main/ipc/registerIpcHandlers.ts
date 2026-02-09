import { BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import type { BootstrapStartInput, CreateProjectInput, RenderJob, RenderOptions } from "../../shared/types.js";
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

interface IpcDependencies {
  audioSidecar: AudioSidecarManager;
  llmPrep: LlmPrepService;
  bootstrap: BootstrapManager;
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  const renderService = new RenderService({
    audioClient: deps.audioSidecar.client,
    llmPrepService: deps.llmPrep
  });

  const activeRenders = new Map<string, AbortController>();

  ipcMain.handle(IPC_CHANNELS.getBootstrapStatus, async () => {
    return deps.bootstrap.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.startBootstrap, async (_event, input: BootstrapStartInput) => {
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
    const queuedJob: RenderJob = {
      id: jobId,
      projectId,
      state: "queued"
    };
    upsertRenderJob(queuedJob);

    const controller = new AbortController();
    activeRenders.set(jobId, controller);

    void renderService
      .renderProject(projectId, options, controller.signal, jobId)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        upsertRenderJob({
          id: jobId,
          projectId,
          state: controller.signal.aborted ? "canceled" : "failed",
          finishedAt: nowIso(),
          errorText: message
        });
      })
      .finally(() => {
        activeRenders.delete(jobId);
      });

    return queuedJob;
  });

  ipcMain.handle(IPC_CHANNELS.cancelRender, async (_event, jobId: string) => {
    const controller = activeRenders.get(jobId);
    if (!controller) {
      return;
    }
    controller.abort();
  });

  ipcMain.handle(IPC_CHANNELS.getRenderStatus, async (_event, jobId: string) => {
    const job = getRenderJob(jobId);
    if (!job) {
      throw new Error(`Render job not found: ${jobId}`);
    }
    return { job };
  });

  ipcMain.handle(IPC_CHANNELS.listVoices, async () => {
    return deps.audioSidecar.client.listVoices();
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
      return null;
    }
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
      return null;
    }
    return result.filePaths[0];
  });
}
