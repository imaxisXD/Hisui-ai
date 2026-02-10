import type { UtilityProcess } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TagValidationResult, VoiceDefinition, VoicePreviewInput } from "../../shared/types.js";
import { SUPPORTED_TAGS, validateExpressionTags } from "../render/expressionTags.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/logging.js";
import { getKokoroNodeScriptPath, getNodeModulesRoot } from "../utils/paths.js";
import type {
  AudioRuntimeClient,
  AudioRuntimeCapabilities,
  BatchTtsRuntimeOptions,
  BatchTtsProgress,
  BatchTtsResponse,
  RuntimeVoicePreviewResult,
  TtsSegmentRequest
} from "./audioClient.js";
import { KOKORO_VOICES, resolveKokoroVoiceIdForRuntime } from "./nodeKokoroCore.js";
import type {
  NodeKokoroAction,
  NodeKokoroRequestPayloadByAction,
  NodeKokoroResponsePayloadByAction
} from "./nodeKokoroProtocol.js";
import { isNodeKokoroMessage } from "./nodeKokoroProtocol.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REQUEST_TIMEOUT_MS: Record<NodeKokoroAction, number> = {
  health: 30_000,
  previewVoice: 10 * 60_000,
  batchTts: 25 * 60_000,
  dispose: 5_000
};

interface PendingRequest {
  action: NodeKokoroAction;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  timeoutMs: number;
  onProgress?: (progress: BatchTtsProgress) => void;
}

export class NodeKokoroClient implements AudioRuntimeClient {
  private readonly modelsDir: string;
  private utilityProcess: UtilityProcess | null = null;
  private utilityStartupPromise: Promise<UtilityProcess> | null = null;
  private requestCounter = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private disposeInFlight = false;

  private readonly onUtilityMessage = (message: unknown): void => {
    this.handleUtilityMessage(message);
  };

  private readonly onUtilityExit = (code: number): void => {
    this.handleUtilityExit(code);
  };

  private readonly onUtilityError = (
    type: string,
    location: string,
    report: string
  ): void => {
    this.handleUtilityError(type, location, report);
  };

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir;
  }

  async getCapabilities(): Promise<AudioRuntimeCapabilities> {
    return {
      runtime: "node-core",
      supportsKokoroDeviceOverride: true,
      supportedKokoroDevices: ["cpu"]
    };
  }

  async health(): Promise<{ running: boolean; modelStatus: string }> {
    return await this.invoke("health", {});
  }

  async listVoices(): Promise<VoiceDefinition[]> {
    return [...KOKORO_VOICES];
  }

  async previewVoice(input: VoicePreviewInput, outputDir: string): Promise<RuntimeVoicePreviewResult> {
    if (input.model !== "kokoro") {
      throw new Error("Voice preview is currently supported only for Kokoro.");
    }
    return await this.invoke("previewVoice", {
      input,
      outputDir
    });
  }

  async validateTags(text: string): Promise<TagValidationResult> {
    const result = validateExpressionTags(text);
    if (result.isValid) {
      return result;
    }
    return {
      isValid: false,
      invalidTags: result.invalidTags,
      supportedTags: SUPPORTED_TAGS
    };
  }

  async batchTts(
    segments: TtsSegmentRequest[],
    outputDir: string,
    onProgress?: (progress: BatchTtsProgress) => void,
    runtimeOptions?: BatchTtsRuntimeOptions
  ): Promise<BatchTtsResponse> {
    return await this.invoke("batchTts", {
      segments,
      outputDir,
      runtimeOptions
    }, { onProgress });
  }

  async dispose(): Promise<void> {
    if (!this.utilityProcess) {
      return;
    }

    this.disposeInFlight = true;
    try {
      await this.invoke("dispose", {}, {
        allowSpawn: false,
        timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS.dispose
      });
    } catch (error) {
      logWarn("node-kokoro/client", "dispose RPC failed, forcing kill", {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.terminateUtilityProcess("disposed by host");
      this.disposeInFlight = false;
    }
  }

  private async invoke<TAction extends NodeKokoroAction>(
    action: TAction,
    payload: NodeKokoroRequestPayloadByAction[TAction],
    options: {
      allowSpawn?: boolean;
      timeoutMs?: number;
      onProgress?: (progress: BatchTtsProgress) => void;
    } = {}
  ): Promise<NodeKokoroResponsePayloadByAction[TAction]> {
    const utility = options.allowSpawn === false
      ? this.utilityProcess
      : await this.ensureUtilityProcess();
    if (!utility) {
      throw new Error("Kokoro utility process is not running.");
    }

    const id = this.nextRequestId(action);
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS[action];

    return await new Promise<NodeKokoroResponsePayloadByAction[TAction]>((resolvePromise, rejectPromise) => {
      const pending: PendingRequest = {
        action,
        timeoutHandle: setTimeout(() => {
          this.pendingRequests.delete(id);
          rejectPromise(new Error(`Kokoro request timed out due to inactivity: ${action}`));
        }, timeoutMs),
        timeoutMs,
        onProgress: options.onProgress,
        resolve: (result) => resolvePromise(result as NodeKokoroResponsePayloadByAction[TAction]),
        reject: rejectPromise
      };
      this.pendingRequests.set(id, pending);

      utility.postMessage({
        kind: "request",
        id,
        action,
        payload
      });
    });
  }

  private async ensureUtilityProcess(): Promise<UtilityProcess> {
    if (this.utilityProcess) {
      return this.utilityProcess;
    }
    if (this.utilityStartupPromise) {
      return await this.utilityStartupPromise;
    }

    this.utilityStartupPromise = this.spawnUtilityProcess();
    try {
      return await this.utilityStartupPromise;
    } finally {
      this.utilityStartupPromise = null;
    }
  }

  private async spawnUtilityProcess(): Promise<UtilityProcess> {
    const { utilityProcess } = await import("electron");
    const scriptPath = resolveUtilityScriptPath();
    const child = utilityProcess.fork(scriptPath, [], {
      serviceName: "Hisui Kokoro Runtime",
      stdio: "pipe",
      env: this.resolveUtilityEnv()
    });

    child.on("message", this.onUtilityMessage);
    child.on("exit", this.onUtilityExit);
    child.on("error", this.onUtilityError);
    child.stdout?.on("data", (chunk) => {
      logDebug("node-kokoro/utility", "stdout", { chunk: chunk.toString("utf-8") });
    });
    child.stderr?.on("data", (chunk) => {
      logWarn("node-kokoro/utility", "stderr", { chunk: chunk.toString("utf-8") });
    });
    this.utilityProcess = child;

    logInfo("node-kokoro/client", "utility process started", {
      pid: child.pid,
      scriptPath
    });

    return child;
  }

  private resolveUtilityEnv(): NodeJS.ProcessEnv {
    const hfHome = process.env.LOCAL_PODCAST_NODE_HF_CACHE?.trim() || join(this.modelsDir, "kokoro-node-cache");
    return {
      ...process.env,
      LOCAL_PODCAST_MODELS_DIR: this.modelsDir,
      LOCAL_PODCAST_KOKORO_NODE_SCRIPT: process.env.LOCAL_PODCAST_KOKORO_NODE_SCRIPT ?? getKokoroNodeScriptPath(),
      LOCAL_PODCAST_NODE_HF_CACHE: process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? hfHome,
      NODE_PATH: process.env.NODE_PATH ?? getNodeModulesRoot()
    };
  }

  private handleUtilityMessage(message: unknown): void {
    if (!isNodeKokoroMessage(message)) {
      logWarn("node-kokoro/client", "ignored malformed utility message", { message });
      return;
    }

    if (message.kind === "progress") {
      const pending = this.pendingRequests.get(message.id);
      if (!pending || pending.action !== "batchTts") {
        return;
      }
      this.refreshPendingTimeout(message.id, pending);
      pending.onProgress?.(message.progress);
      return;
    }

    if (message.kind === "response") {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        logWarn("node-kokoro/client", "received response for unknown request", {
          id: message.id,
          action: message.action
        });
        return;
      }
      clearTimeout(pending.timeoutHandle);
      this.pendingRequests.delete(message.id);
      if (!message.ok) {
        pending.reject(new Error(message.error));
        return;
      }
      pending.resolve(message.result);
    }
  }

  private refreshPendingTimeout(id: string, pending: PendingRequest): void {
    clearTimeout(pending.timeoutHandle);
    pending.timeoutHandle = setTimeout(() => {
      this.pendingRequests.delete(id);
      pending.reject(new Error(`Kokoro request timed out due to inactivity: ${pending.action}`));
    }, pending.timeoutMs);
  }

  private handleUtilityExit(code: number): void {
    const summary = {
      code,
      pendingRequests: this.pendingRequests.size
    };
    if (this.disposeInFlight) {
      logDebug("node-kokoro/client", "utility process exited after dispose", summary);
    } else {
      logError("node-kokoro/client", "utility process exited unexpectedly", summary);
    }
    this.detachUtilityListeners();
    this.utilityProcess = null;
    this.utilityStartupPromise = null;
    this.rejectPendingRequests(new Error("Node Kokoro utility process exited while handling a request."));
  }

  private handleUtilityError(type: string, location: string, report: string): void {
    logError("node-kokoro/client", "utility process fatal error", { type, location, report });
    this.terminateUtilityProcess("utility process fatal error");
  }

  private terminateUtilityProcess(reason: string): void {
    const utility = this.utilityProcess;
    if (!utility) {
      return;
    }
    this.detachUtilityListeners();
    this.utilityProcess = null;
    this.utilityStartupPromise = null;
    this.rejectPendingRequests(new Error(`Node Kokoro utility process terminated (${reason}).`));
    if (utility.pid !== undefined) {
      utility.kill();
    }
  }

  private detachUtilityListeners(): void {
    if (!this.utilityProcess) {
      return;
    }
    this.utilityProcess.off("message", this.onUtilityMessage);
    this.utilityProcess.off("exit", this.onUtilityExit);
    this.utilityProcess.off("error", this.onUtilityError);
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private nextRequestId(action: NodeKokoroAction): string {
    this.requestCounter += 1;
    return `${action}-${Date.now()}-${this.requestCounter}`;
  }
}

function resolveUtilityScriptPath(): string {
  return join(THIS_DIR, "nodeKokoroUtility.js");
}

export { resolveKokoroVoiceIdForRuntime };
