import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { TagValidationResult, VoiceDefinition } from "../../shared/types.js";
import { SUPPORTED_TAGS, validateExpressionTags } from "../render/expressionTags.js";
import { getKokoroNodeScriptPath, getNodeModulesRoot } from "../utils/paths.js";
import type { AudioRuntimeClient, BatchTtsResponse, TtsSegmentRequest } from "./audioClient.js";

const KOKORO_VOICES: VoiceDefinition[] = [
  {
    id: "kokoro_narrator",
    model: "kokoro",
    label: "Kokoro Narrator",
    description: "Neutral long-form narration (engine: af_heart)."
  },
  {
    id: "kokoro_story",
    model: "kokoro",
    label: "Kokoro Story",
    description: "Warm storytelling voice (engine: af_bella)."
  }
];

export class NodeKokoroClient implements AudioRuntimeClient {
  private readonly modelsDir: string;

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir;
  }

  async health(): Promise<{ running: boolean; modelStatus: string }> {
    await this.assertNodeRuntimeAvailable();
    return { running: true, modelStatus: "node_core_ready" };
  }

  async listVoices(): Promise<VoiceDefinition[]> {
    return [...KOKORO_VOICES];
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

  async batchTts(segments: TtsSegmentRequest[], outputDir: string): Promise<BatchTtsResponse> {
    await mkdir(outputDir, { recursive: true });
    const wavPaths: string[] = [];

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }

      if (segment.model !== "kokoro") {
        throw new Error("Expressive voice selected, but expressive runtime pack is not active.");
      }

      const wavPath = join(outputDir, `seg-${String(index).padStart(5, "0")}-${sanitize(segment.id)}.wav`);
      await this.synthesizeKokoroSegment(segment.text, segment.voiceId, segment.speed, wavPath);
      wavPaths.push(wavPath);
    }

    return { wavPaths };
  }

  private async assertNodeRuntimeAvailable(): Promise<void> {
    const { command, args, env } = this.resolveNodeCommand();
    await runCommand(command, [...args, "-v"], env, {
      timeoutMs: 15_000,
      timeoutHint: "Node runtime check timed out."
    });
  }

  private async synthesizeKokoroSegment(
    text: string,
    voiceId: string,
    speed: number,
    outputPath: string
  ): Promise<void> {
    const runtime = this.resolveNodeCommand();
    const cacheLikelyReady = await hasCachedModelData(runtime.hfHome);
    const script = getKokoroNodeScriptPath();
    const model = process.env.LOCAL_PODCAST_KOKORO_NODE_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
    const normalizedSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;

    // Empty cache can trigger long first-run downloads. Time out and provide a clear fix instead of hanging forever.
    const timeoutMs = cacheLikelyReady ? 120_000 : 240_000;
    const timeoutHint = cacheLikelyReady
      ? "Node Kokoro synthesis timed out. Try reducing input length or restarting render."
      : "Node Kokoro model cache is empty or still downloading. Seed cache via `npm run seed:kokoro-node` (or keep network available) and retry.";

    await runCommand(
      runtime.command,
      [
        ...runtime.args,
        script,
        "--text", text,
        "--voice", mapVoiceId(voiceId),
        "--output", outputPath,
        "--speed", normalizedSpeed.toString(),
        "--model", model
      ],
      runtime.env,
      { timeoutMs, timeoutHint }
    );
  }

  private resolveNodeCommand(): { command: string; args: string[]; env: NodeJS.ProcessEnv; hfHome: string } {
    const command = process.env.LOCAL_PODCAST_NODE_BIN?.trim() || process.execPath;
    const rawFlags = process.env.LOCAL_PODCAST_NODE_BIN_FLAGS?.trim() || defaultNodeFlags(command);
    const args = rawFlags.length > 0 ? rawFlags.split(/\s+/g).filter(Boolean) : [];
    if (isElectronBinary(command) && !args.includes("--run-as-node")) {
      args.unshift("--run-as-node");
    }
    const hfHome = process.env.LOCAL_PODCAST_NODE_HF_CACHE?.trim() || join(this.modelsDir, "kokoro-node-cache");

    return {
      command,
      args,
      hfHome,
      env: {
        ...process.env,
        NODE_PATH: process.env.NODE_PATH ?? getNodeModulesRoot(),
        HF_HOME: process.env.HF_HOME ?? hfHome,
        HF_HUB_CACHE: process.env.HF_HUB_CACHE ?? join(hfHome, "hub")
      }
    };
  }
}

function defaultNodeFlags(command: string): string {
  const base = basename(command).toLowerCase();
  if (base === "node" || base.startsWith("node")) {
    return "";
  }
  return "--run-as-node";
}

function isElectronBinary(command: string): boolean {
  return basename(command).toLowerCase().includes("electron");
}

interface CommandOptions {
  timeoutMs: number;
  timeoutHint: string;
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: CommandOptions
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }
      child.kill("SIGKILL");
      const detail = stderr.trim();
      const suffix = detail ? ` Details: ${detail}` : "";
      rejectPromise(new Error(`${options.timeoutHint}${suffix}`));
    }, options.timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Node Kokoro runtime failed (${code}): ${stderr}`));
    });
  });
}

function mapVoiceId(voiceId: string): string {
  if (voiceId === "kokoro_story") {
    return "af_bella";
  }
  return "af_heart";
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

async function hasCachedModelData(cacheRoot: string): Promise<boolean> {
  try {
    const queue = [cacheRoot];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        if (entry.isFile()) {
          return true;
        }
        if (entry.isDirectory()) {
          queue.push(join(current, entry.name));
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}
