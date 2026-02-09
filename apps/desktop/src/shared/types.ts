export type InputFormat = "epub" | "txt" | "pdf";

export type TtsModel = "kokoro" | "chatterbox";
export type KokoroBackendMode = "auto" | "node" | "node-first" | "node-fallback";
export type AudioRuntimeMode = "node-core" | "python-expressive";
export type ModelPackSource = "remote" | "bundled";
export type ModelPackState = "not-installed" | "queued" | "downloading" | "extracting" | "installed" | "error";

export interface ProjectSettings {
  speed: number;
  outputSampleRate: number;
  llmPrepEnabledByDefault: boolean;
}

export interface Segment {
  id: string;
  chapterId: string;
  order: number;
  speakerId: string;
  text: string;
  expressionTags: string[];
  estDurationSec: number;
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  segments: Segment[];
}

export interface SpeakerProfile {
  id: string;
  name: string;
  ttsModel: TtsModel;
  voiceId: string;
  promptAudioPath?: string;
}

export interface Project {
  id: string;
  title: string;
  sourcePath: string;
  sourceFormat: InputFormat;
  createdAt: string;
  updatedAt: string;
  chapters: Chapter[];
  speakers: SpeakerProfile[];
  settings: ProjectSettings;
}

export interface RenderMetrics {
  segmentCount: number;
  audioSeconds: number;
  renderSeconds: number;
  realtimeFactor: number;
}

export type RenderState = "queued" | "running" | "failed" | "completed" | "canceled";

export interface RenderJob {
  id: string;
  projectId: string;
  state: RenderState;
  startedAt?: string;
  finishedAt?: string;
  outputMp3Path?: string;
  metrics?: RenderMetrics;
  errorText?: string;
}

export interface ChapterImport {
  title: string;
  text: string;
}

export interface ImportResult {
  title: string;
  sourcePath: string;
  sourceFormat: InputFormat;
  chapters: ChapterImport[];
  warnings: string[];
}

export interface CreateProjectInput {
  title: string;
  sourcePath: string;
  sourceFormat: InputFormat;
  chapters: ChapterImport[];
  speakers: SpeakerProfile[];
  settings?: Partial<ProjectSettings>;
}

export interface SegmentUpdate {
  id: string;
  text: string;
  speakerId: string;
  expressionTags: string[];
}

export interface UpdateSegmentsInput {
  projectId: string;
  updates: SegmentUpdate[];
}

export interface UpdateSpeakersInput {
  projectId: string;
  speakers: SpeakerProfile[];
}

export interface RenderOptions {
  outputDir: string;
  outputFileName: string;
  speed: number;
  enableLlmPrep: boolean;
}

export interface RenderStatus {
  job: RenderJob;
}

export interface VoiceDefinition {
  id: string;
  model: TtsModel;
  label: string;
  description: string;
}

export interface TagValidationResult {
  isValid: boolean;
  invalidTags: string[];
  supportedTags: string[];
}

export interface LlmPrepInput {
  text: string;
}

export interface LlmPrepResult {
  originalText: string;
  preparedText: string;
  changed: boolean;
}

export interface SystemHealth {
  audioService: {
    running: boolean;
    modelStatus: string;
    error?: string;
  };
  llmService: {
    available: boolean;
    error?: string;
  };
  disk: {
    ok: boolean;
    freeBytes?: number;
    error?: string;
  };
}

export type BootstrapPhase = "awaiting-input" | "running" | "ready" | "error";

export interface ModelPackStatus {
  id: string;
  title: string;
  description: string;
  sizeBytes: number;
  required: boolean;
  recommended: boolean;
  source: ModelPackSource;
  downloadUrl?: string;
  state: ModelPackState;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

export interface BootstrapStartInput {
  installPath: string;
  kokoroBackend: KokoroBackendMode;
  selectedPackIds: string[];
}

export interface BootstrapStatus {
  phase: BootstrapPhase;
  firstRun: boolean;
  defaultInstallPath: string;
  installPath: string;
  kokoroBackend: KokoroBackendMode;
  step: string;
  message: string;
  percent: number;
  bytesCopied: number;
  bytesTotal: number;
  modelPacks: ModelPackStatus[];
  error?: string;
}
