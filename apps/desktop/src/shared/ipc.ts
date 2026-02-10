import type {
  BootstrapStartInput,
  BootstrapStatus,
  CreateProjectInput,
  ImportResult,
  LlmPrepInput,
  LlmPrepResult,
  Project,
  RenderJob,
  RenderOptions,
  RenderStatus,
  VoicePreviewInput,
  VoicePreviewResult,
  SystemHealth,
  TagValidationResult,
  UpdateSpeakersInput,
  UpdateSegmentsInput,
  VoiceDefinition,
  UpdateState,
  DiagnosticsSnapshot,
  RuntimeResourceSettings,
  UpdateRuntimeResourceSettingsInput
} from "./types.js";

export const IPC_CHANNELS = {
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

export interface ReadAudioFileResult {
  mimeType: string;
  audioBase64: string;
}

export interface DesktopApi {
  getBootstrapStatus(): Promise<BootstrapStatus>;
  startBootstrap(input: BootstrapStartInput): Promise<BootstrapStatus>;
  importBook(filePath: string): Promise<ImportResult>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateSpeakers(input: UpdateSpeakersInput): Promise<Project>;
  updateSegments(input: UpdateSegmentsInput): Promise<Project>;
  renderProject(projectId: string, options: RenderOptions): Promise<RenderJob>;
  cancelRender(jobId: string): Promise<void>;
  getRenderStatus(jobId: string): Promise<RenderStatus>;
  listVoices(): Promise<VoiceDefinition[]>;
  previewVoice(input: VoicePreviewInput): Promise<VoicePreviewResult>;
  validateExpressionTags(text: string): Promise<TagValidationResult>;
  runOptionalLlmPrep(input: LlmPrepInput): Promise<LlmPrepResult>;
  getSystemHealth(): Promise<SystemHealth>;
  getDefaultRenderOutputDir(): Promise<string>;
  revealInFileManager(path: string): Promise<void>;
  showOpenFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  showOpenDirectoryDialog(defaultPath?: string): Promise<string | null>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  installDownloadedUpdate(): Promise<void>;
  getDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot>;
  readAudioFile(path: string): Promise<ReadAudioFileResult>;
  getRuntimeResourceSettings(): Promise<RuntimeResourceSettings>;
  updateRuntimeResourceSettings(input: UpdateRuntimeResourceSettingsInput): Promise<RuntimeResourceSettings>;
}
