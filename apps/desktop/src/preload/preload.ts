import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/ipc.js";
const IPC_CHANNELS = {
  getBootstrapStatus: "app:get-bootstrap-status",
  startBootstrap: "app:start-bootstrap",
  importBook: "app:import-book",
  createProject: "app:create-project",
  updateSpeakers: "app:update-speakers",
  updateSegments: "app:update-segments",
  renderProject: "app:render-project",
  cancelRender: "app:cancel-render",
  getRenderStatus: "app:get-render-status",
  listVoices: "app:list-voices",
  previewVoice: "app:preview-voice",
  validateExpressionTags: "app:validate-expression-tags",
  runOptionalLlmPrep: "app:run-optional-llm-prep",
  getSystemHealth: "app:get-system-health",
  getDefaultRenderOutputDir: "app:get-default-render-output-dir",
  revealInFileManager: "app:reveal-in-file-manager",
  showOpenFileDialog: "app:show-open-file-dialog",
  showOpenDirectoryDialog: "app:show-open-directory-dialog",
  getUpdateState: "app:get-update-state",
  checkForUpdates: "app:check-for-updates",
  installDownloadedUpdate: "app:install-downloaded-update",
  getDiagnosticsSnapshot: "app:get-diagnostics-snapshot",
  readAudioFile: "app:read-audio-file",
  getRuntimeResourceSettings: "app:get-runtime-resource-settings",
  updateRuntimeResourceSettings: "app:update-runtime-resource-settings"
} as const;

const api: DesktopApi = {
  getBootstrapStatus() {
    return ipcRenderer.invoke(IPC_CHANNELS.getBootstrapStatus);
  },
  startBootstrap(input: Parameters<DesktopApi["startBootstrap"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.startBootstrap, input);
  },
  importBook(filePath: Parameters<DesktopApi["importBook"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.importBook, filePath);
  },
  createProject(input: Parameters<DesktopApi["createProject"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.createProject, input);
  },
  updateSpeakers(input: Parameters<DesktopApi["updateSpeakers"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.updateSpeakers, input);
  },
  updateSegments(input: Parameters<DesktopApi["updateSegments"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.updateSegments, input);
  },
  renderProject(
    projectId: Parameters<DesktopApi["renderProject"]>[0],
    options: Parameters<DesktopApi["renderProject"]>[1]
  ) {
    return ipcRenderer.invoke(IPC_CHANNELS.renderProject, projectId, options);
  },
  cancelRender(jobId: Parameters<DesktopApi["cancelRender"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.cancelRender, jobId);
  },
  getRenderStatus(jobId: Parameters<DesktopApi["getRenderStatus"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.getRenderStatus, jobId);
  },
  listVoices() {
    return ipcRenderer.invoke(IPC_CHANNELS.listVoices);
  },
  previewVoice(input: Parameters<DesktopApi["previewVoice"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.previewVoice, input);
  },
  validateExpressionTags(text: Parameters<DesktopApi["validateExpressionTags"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.validateExpressionTags, text);
  },
  runOptionalLlmPrep(input: Parameters<DesktopApi["runOptionalLlmPrep"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.runOptionalLlmPrep, input);
  },
  getSystemHealth() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSystemHealth);
  },
  getDefaultRenderOutputDir() {
    return ipcRenderer.invoke(IPC_CHANNELS.getDefaultRenderOutputDir);
  },
  revealInFileManager(path: Parameters<DesktopApi["revealInFileManager"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.revealInFileManager, path);
  },
  showOpenFileDialog(filters?: Parameters<DesktopApi["showOpenFileDialog"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.showOpenFileDialog, filters);
  },
  showOpenDirectoryDialog(defaultPath?: Parameters<DesktopApi["showOpenDirectoryDialog"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.showOpenDirectoryDialog, defaultPath);
  },
  getUpdateState() {
    return ipcRenderer.invoke(IPC_CHANNELS.getUpdateState);
  },
  checkForUpdates() {
    return ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates);
  },
  installDownloadedUpdate() {
    return ipcRenderer.invoke(IPC_CHANNELS.installDownloadedUpdate);
  },
  getDiagnosticsSnapshot() {
    return ipcRenderer.invoke(IPC_CHANNELS.getDiagnosticsSnapshot);
  },
  readAudioFile(path: Parameters<DesktopApi["readAudioFile"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.readAudioFile, path);
  },
  getRuntimeResourceSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.getRuntimeResourceSettings);
  },
  updateRuntimeResourceSettings(input: Parameters<DesktopApi["updateRuntimeResourceSettings"]>[0]) {
    return ipcRenderer.invoke(IPC_CHANNELS.updateRuntimeResourceSettings, input);
  }
};

contextBridge.exposeInMainWorld("app", api);
