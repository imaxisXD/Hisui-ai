import type { VoicePreviewInput } from "../../shared/types.js";
import type {
  BatchTtsProgress,
  BatchTtsRuntimeOptions,
  BatchTtsResponse,
  RuntimeVoicePreviewResult,
  TtsSegmentRequest
} from "./audioClient.js";

export type NodeKokoroAction = "health" | "previewVoice" | "batchTts" | "dispose";

export interface NodeKokoroRequestPayloadByAction {
  health: Record<string, never>;
  previewVoice: {
    input: VoicePreviewInput;
    outputDir: string;
  };
  batchTts: {
    segments: TtsSegmentRequest[];
    outputDir: string;
    runtimeOptions?: BatchTtsRuntimeOptions;
  };
  dispose: Record<string, never>;
}

export interface NodeKokoroResponsePayloadByAction {
  health: { running: boolean; modelStatus: string };
  previewVoice: RuntimeVoicePreviewResult;
  batchTts: BatchTtsResponse;
  dispose: { ok: true };
}

export type NodeKokoroRequestMessage<TAction extends NodeKokoroAction = NodeKokoroAction> = {
  kind: "request";
  id: string;
  action: TAction;
  payload: NodeKokoroRequestPayloadByAction[TAction];
};

export type NodeKokoroSuccessResponseMessage<TAction extends NodeKokoroAction = NodeKokoroAction> = {
  kind: "response";
  id: string;
  action: TAction;
  ok: true;
  result: NodeKokoroResponsePayloadByAction[TAction];
};

export interface NodeKokoroErrorResponseMessage {
  kind: "response";
  id: string;
  action: NodeKokoroAction;
  ok: false;
  error: string;
}

export interface NodeKokoroProgressMessage {
  kind: "progress";
  id: string;
  action: "batchTts";
  progress: BatchTtsProgress;
}

export type NodeKokoroResponseMessage =
  | NodeKokoroSuccessResponseMessage
  | NodeKokoroErrorResponseMessage;

export type NodeKokoroMessage =
  | NodeKokoroRequestMessage
  | NodeKokoroResponseMessage
  | NodeKokoroProgressMessage;

export function isNodeKokoroMessage(value: unknown): value is NodeKokoroMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "request" && candidate.kind !== "response" && candidate.kind !== "progress") {
    return false;
  }
  if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
    return false;
  }
  if (typeof candidate.action !== "string") {
    return false;
  }

  return true;
}
