import type {
  LlmPrepResult,
  TagValidationResult,
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

export interface AudioRuntimeClient {
  health(): Promise<{ running: boolean; modelStatus: string }>;
  listVoices(): Promise<VoiceDefinition[]>;
  validateTags(text: string): Promise<TagValidationResult>;
  batchTts(segments: TtsSegmentRequest[], outputDir: string): Promise<BatchTtsResponse>;
}

export class AudioClient implements AudioRuntimeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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

  async batchTts(segments: TtsSegmentRequest[], outputDir: string): Promise<BatchTtsResponse> {
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
