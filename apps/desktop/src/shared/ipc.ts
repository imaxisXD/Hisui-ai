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
  SystemHealth,
  TagValidationResult,
  UpdateSpeakersInput,
  UpdateSegmentsInput,
  VoiceDefinition
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
  validateExpressionTags: "app:validate-expression-tags",
  runOptionalLlmPrep: "app:run-optional-llm-prep",
  getSystemHealth: "app:get-system-health",
  showOpenFileDialog: "app:show-open-file-dialog",
  showOpenDirectoryDialog: "app:show-open-directory-dialog"
} as const;

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
  validateExpressionTags(text: string): Promise<TagValidationResult>;
  runOptionalLlmPrep(input: LlmPrepInput): Promise<LlmPrepResult>;
  getSystemHealth(): Promise<SystemHealth>;
  showOpenFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  showOpenDirectoryDialog(defaultPath?: string): Promise<string | null>;
}
