import type {
  KokoroNodeDevice,
  LlmPrepResult,
  TagValidationResult,
  VoicePreviewInput,
  TtsModel,
  VoiceDefinition
} from "../../shared/types.js";

export interface TtsSegmentRequest {
  id: string;
  text: string;
  voiceId: string;
  model: TtsModel;
  speed: number;
  expressionTags: string[];
}

export interface BatchTtsResponse {
  wavPaths: string[];
}

export interface BatchTtsProgress {
  completedSegments: number;
  totalSegments: number;
}

export interface BatchTtsRuntimeOptions {
  kokoroNodeDevice?: KokoroNodeDevice;
}

export interface AudioRuntimeCapabilities {
  runtime: "node-core" | "python-expressive" | "unknown";
  supportsKokoroDeviceOverride: boolean;
  supportedKokoroDevices: KokoroNodeDevice[];
}

export interface RuntimeVoicePreviewResult {
  wavPath: string;
  engine?: string;
}

export interface AudioRuntimeClient {
  getCapabilities(): Promise<AudioRuntimeCapabilities>;
  health(): Promise<{ running: boolean; modelStatus: string }>;
  listVoices(): Promise<VoiceDefinition[]>;
  previewVoice(input: VoicePreviewInput, outputDir: string): Promise<RuntimeVoicePreviewResult>;
  validateTags(text: string): Promise<TagValidationResult>;
  batchTts(
    segments: TtsSegmentRequest[],
    outputDir: string,
    onProgress?: (progress: BatchTtsProgress) => void,
    runtimeOptions?: BatchTtsRuntimeOptions
  ): Promise<BatchTtsResponse>;
}

export class AudioClient implements AudioRuntimeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getCapabilities(): Promise<AudioRuntimeCapabilities> {
    return {
      runtime: "python-expressive",
      supportsKokoroDeviceOverride: false,
      supportedKokoroDevices: []
    };
  }

  async health(): Promise<{ running: boolean; modelStatus: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      return { running: false, modelStatus: `http_${response.status}` };
    }
    const payload = await response.json() as { running: boolean; model_status: string };
    return { running: payload.running, modelStatus: payload.model_status };
  }

  async listVoices(): Promise<VoiceDefinition[]> {
    const response = await fetch(`${this.baseUrl}/voices`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Voices request failed: ${response.status}`);
    }
    const payload = await response.json() as { voices: VoiceDefinition[] };
    return payload.voices;
  }

  async previewVoice(input: VoicePreviewInput, outputDir: string): Promise<RuntimeVoicePreviewResult> {
    const response = await fetch(`${this.baseUrl}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        voice_id: input.voiceId,
        model: input.model,
        speed: input.speed,
        expression_tags: input.expressionTags ?? [],
        output_dir: outputDir
      })
    });
    if (!response.ok) {
      throw new Error(`Voice preview failed: ${response.status}`);
    }
    return await response.json() as RuntimeVoicePreviewResult;
  }

  async validateTags(text: string): Promise<TagValidationResult> {
    const response = await fetch(`${this.baseUrl}/validate-tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      throw new Error(`Tag validation failed: ${response.status}`);
    }
    return await response.json() as TagValidationResult;
  }

  async llmPrep(text: string): Promise<LlmPrepResult> {
    const response = await fetch(`${this.baseUrl}/llm-prep`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      throw new Error(`LLM prep failed: ${response.status}`);
    }
    return await response.json() as LlmPrepResult;
  }

  async batchTts(
    segments: TtsSegmentRequest[],
    outputDir: string,
    _onProgress?: (progress: BatchTtsProgress) => void,
    _runtimeOptions?: BatchTtsRuntimeOptions
  ): Promise<BatchTtsResponse> {
    const response = await fetch(`${this.baseUrl}/batch-tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ segments, output_dir: outputDir })
    });

    if (!response.ok) {
      throw new Error(`batch-tts failed: ${response.status}`);
    }

    return await response.json() as BatchTtsResponse;
  }
}
