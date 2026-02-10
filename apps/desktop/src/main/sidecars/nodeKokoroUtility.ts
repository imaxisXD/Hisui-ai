import { join } from "node:path";
import { logError, logInfo, logWarn } from "../utils/logging.js";
import { NodeKokoroCore } from "./nodeKokoroCore.js";
import type { NodeKokoroRequestMessage } from "./nodeKokoroProtocol.js";
import { isNodeKokoroMessage } from "./nodeKokoroProtocol.js";

const parentPort = process.parentPort;

if (!parentPort) {
  throw new Error("Node Kokoro utility process requires parentPort.");
}

const runtime = new NodeKokoroCore(resolveModelsDir());
logInfo("node-kokoro/utility", "utility process started", {
  pid: process.pid,
  modelsDir: process.env.LOCAL_PODCAST_MODELS_DIR
});

parentPort.on("message", (event: { data: unknown }) => {
  const message = event.data;
  if (!isNodeKokoroMessage(message) || message.kind !== "request") {
    logWarn("node-kokoro/utility", "ignored invalid message", { message });
    return;
  }
  void handleRequest(message as NodeKokoroRequestMessage);
});

async function handleRequest(message: NodeKokoroRequestMessage): Promise<void> {
  try {
    switch (message.action) {
      case "health": {
        const result = await runtime.health();
        parentPort.postMessage({
          kind: "response",
          id: message.id,
          action: message.action,
          ok: true,
          result
        });
        return;
      }
      case "previewVoice": {
        const payload = message.payload as NodeKokoroRequestMessage<"previewVoice">["payload"];
        const result = await runtime.previewVoice(payload.input, payload.outputDir);
        parentPort.postMessage({
          kind: "response",
          id: message.id,
          action: message.action,
          ok: true,
          result
        });
        return;
      }
      case "batchTts": {
        const payload = message.payload as NodeKokoroRequestMessage<"batchTts">["payload"];
        const result = await runtime.batchTts(
          payload.segments,
          payload.outputDir,
          (progress) => {
            parentPort.postMessage({
              kind: "progress",
              id: message.id,
              action: "batchTts",
              progress
            });
          },
          payload.runtimeOptions
        );
        parentPort.postMessage({
          kind: "response",
          id: message.id,
          action: message.action,
          ok: true,
          result
        });
        return;
      }
      case "dispose": {
        await runtime.dispose();
        parentPort.postMessage({
          kind: "response",
          id: message.id,
          action: message.action,
          ok: true,
          result: { ok: true }
        });
        setTimeout(() => process.exit(0), 20);
        return;
      }
      default: {
        const unreachableAction: never = message.action;
        throw new Error(`Unsupported node-kokoro action: ${String(unreachableAction)}`);
      }
    }
  } catch (error) {
    logError("node-kokoro/utility", "request failed", {
      action: message.action,
      id: message.id,
      error
    });
    parentPort.postMessage({
      kind: "response",
      id: message.id,
      action: message.action,
      ok: false,
      error: errorToMessage(error)
    });
  }
}

function resolveModelsDir(): string {
  const override = process.env.LOCAL_PODCAST_MODELS_DIR?.trim();
  if (override) {
    return override;
  }
  if (process.resourcesPath) {
    return join(process.resourcesPath, "models");
  }
  return join(process.cwd(), "resources", "models");
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
