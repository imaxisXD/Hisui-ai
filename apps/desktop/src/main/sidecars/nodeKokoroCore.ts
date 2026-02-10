import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceDefinition, VoicePreviewInput } from "../../shared/types.js";
import { logDebug, logError, logInfo } from "../utils/logging.js";
import type {
  BatchTtsRuntimeOptions,
  BatchTtsProgress,
  BatchTtsResponse,
  RuntimeVoicePreviewResult,
  TtsSegmentRequest
} from "./audioClient.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
let cachedWorkspaceRoot: string | null = null;

const LEGACY_KOKORO_VOICE_ALIASES: Record<string, string> = {
  kokoro_narrator: "af_heart",
  kokoro_story: "af_bella"
};

export const KOKORO_VOICES: VoiceDefinition[] = [
  { id: "af_heart", model: "kokoro", label: "Kokoro Heart", description: "American English female voice (engine: af_heart)." },
  { id: "af_bella", model: "kokoro", label: "Kokoro Bella", description: "American English female voice (engine: af_bella)." },
  { id: "af_alloy", model: "kokoro", label: "Kokoro Alloy", description: "American English female voice (engine: af_alloy)." },
  { id: "af_aoede", model: "kokoro", label: "Kokoro Aoede", description: "American English female voice (engine: af_aoede)." },
  { id: "af_jessica", model: "kokoro", label: "Kokoro Jessica", description: "American English female voice (engine: af_jessica)." },
  { id: "af_kore", model: "kokoro", label: "Kokoro Kore", description: "American English female voice (engine: af_kore)." },
  { id: "af_nicole", model: "kokoro", label: "Kokoro Nicole", description: "American English female voice (engine: af_nicole)." },
  { id: "af_nova", model: "kokoro", label: "Kokoro Nova", description: "American English female voice (engine: af_nova)." },
  { id: "af_river", model: "kokoro", label: "Kokoro River", description: "American English female voice (engine: af_river)." },
  { id: "af_sarah", model: "kokoro", label: "Kokoro Sarah", description: "American English female voice (engine: af_sarah)." },
  { id: "af_sky", model: "kokoro", label: "Kokoro Sky", description: "American English female voice (engine: af_sky)." },
  { id: "am_adam", model: "kokoro", label: "Kokoro Adam", description: "American English male voice (engine: am_adam)." },
  { id: "am_echo", model: "kokoro", label: "Kokoro Echo", description: "American English male voice (engine: am_echo)." },
  { id: "am_eric", model: "kokoro", label: "Kokoro Eric", description: "American English male voice (engine: am_eric)." },
  { id: "am_fenrir", model: "kokoro", label: "Kokoro Fenrir", description: "American English male voice (engine: am_fenrir)." },
  { id: "am_liam", model: "kokoro", label: "Kokoro Liam", description: "American English male voice (engine: am_liam)." },
  { id: "am_michael", model: "kokoro", label: "Kokoro Michael", description: "American English male voice (engine: am_michael)." },
  { id: "am_onyx", model: "kokoro", label: "Kokoro Onyx", description: "American English male voice (engine: am_onyx)." },
  { id: "am_puck", model: "kokoro", label: "Kokoro Puck", description: "American English male voice (engine: am_puck)." },
  { id: "am_santa", model: "kokoro", label: "Kokoro Santa", description: "American English male voice (engine: am_santa)." },
  { id: "bf_alice", model: "kokoro", label: "Kokoro Alice (UK)", description: "British English female voice (engine: bf_alice)." },
  { id: "bf_emma", model: "kokoro", label: "Kokoro Emma (UK)", description: "British English female voice (engine: bf_emma)." },
  { id: "bf_isabella", model: "kokoro", label: "Kokoro Isabella (UK)", description: "British English female voice (engine: bf_isabella)." },
  { id: "bf_lily", model: "kokoro", label: "Kokoro Lily (UK)", description: "British English female voice (engine: bf_lily)." },
  { id: "bm_daniel", model: "kokoro", label: "Kokoro Daniel (UK)", description: "British English male voice (engine: bm_daniel)." },
  { id: "bm_fable", model: "kokoro", label: "Kokoro Fable (UK)", description: "British English male voice (engine: bm_fable)." },
  { id: "bm_george", model: "kokoro", label: "Kokoro George (UK)", description: "British English male voice (engine: bm_george)." },
  { id: "bm_lewis", model: "kokoro", label: "Kokoro Lewis (UK)", description: "British English male voice (engine: bm_lewis)." }
];

interface BatchItem {
  text: string;
  voice: string;
  speed: number;
  output: string;
}

interface CommandOptions {
  timeoutMs: number;
  timeoutHint: string;
  onStdoutLine?: (line: string) => void;
}

export class NodeKokoroCore {
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

  async previewVoice(input: VoicePreviewInput, outputDir: string): Promise<RuntimeVoicePreviewResult> {
    if (input.model !== "kokoro") {
      throw new Error("Voice preview is currently supported only for Kokoro.");
    }
    await mkdir(outputDir, { recursive: true });
    const wavPath = join(outputDir, `preview-${sanitize(input.voiceId)}-${Date.now()}.wav`);
    await this.synthesizeBatch([{
      text: input.text,
      voice: resolveKokoroVoiceIdForRuntime(input.voiceId),
      speed: Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 1,
      output: wavPath
    }], outputDir);
    return {
      wavPath,
      engine: "kokoro-node"
    };
  }

  async batchTts(
    segments: TtsSegmentRequest[],
    outputDir: string,
    onProgress?: (progress: BatchTtsProgress) => void,
    runtimeOptions?: BatchTtsRuntimeOptions
  ): Promise<BatchTtsResponse> {
    await mkdir(outputDir, { recursive: true });
    const batch: BatchItem[] = [];
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
      wavPaths.push(wavPath);
      batch.push({
        text: segment.text,
        voice: resolveKokoroVoiceIdForRuntime(segment.voiceId),
        speed: Number.isFinite(segment.speed) && segment.speed > 0 ? segment.speed : 1,
        output: wavPath
      });
    }

    if (batch.length === 0) {
      return { wavPaths: [] };
    }

    await this.synthesizeBatch(batch, outputDir, onProgress, runtimeOptions);
    return { wavPaths };
  }

  async dispose(): Promise<void> {
    // No long-lived child resources are held in this process-level runtime yet.
  }

  private async assertNodeRuntimeAvailable(): Promise<void> {
    const { command, args, env } = this.resolveNodeCommand();
    logDebug("node-kokoro", "checking node runtime", { command, args });
    await runCommand(command, [...args, "-v"], env, {
      timeoutMs: 15_000,
      timeoutHint: "Node runtime check timed out."
    });
  }

  private async synthesizeBatch(
    batch: BatchItem[],
    outputDir: string,
    onProgress?: (progress: BatchTtsProgress) => void,
    runtimeOptions?: BatchTtsRuntimeOptions
  ): Promise<void> {
    const runtime = this.resolveNodeCommand();
    const cacheLikelyReady = await hasCachedModelData(runtime.hfHome);
    const script = resolveKokoroNodeScriptPath();
    const model = process.env.LOCAL_PODCAST_KOKORO_NODE_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
    const requestedDevice = runtimeOptions?.kokoroNodeDevice;
    const resolvedDtype = process.env.LOCAL_PODCAST_KOKORO_NODE_DTYPE?.trim();
    const totalChars = batch.reduce((sum, item) => sum + item.text.length, 0);
    const timeoutMs = computeBatchTimeoutMs({
      cacheLikelyReady,
      segmentCount: batch.length,
      totalChars
    });

    const manifestPath = join(outputDir, `.kokoro-batch-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await writeFile(manifestPath, JSON.stringify({ tasks: batch }), "utf-8");

    logInfo("node-kokoro", "starting batch synthesis", {
      segmentCount: batch.length,
      totalChars,
      model,
      requestedDevice,
      resolvedDtype,
      timeoutMs,
      manifestPath
    });

    const runtimeArgs = [
      ...runtime.args,
      script,
      "--batchManifest", manifestPath,
      "--model", model,
      "--cacheDir", runtime.hfHome
    ];
    if (requestedDevice) {
      runtimeArgs.push("--device", requestedDevice);
    }
    if (resolvedDtype) {
      runtimeArgs.push("--dtype", resolvedDtype);
    }

    try {
      await runCommand(
        runtime.command,
        runtimeArgs,
        runtime.env,
        {
          timeoutMs,
          timeoutHint: `Node Kokoro batch synthesis reported no runtime output for ${Math.round(timeoutMs / 1000)}s. Try rendering with fewer chapters, or switch to Python expressive backend for this project.`,
          onStdoutLine: onProgress
            ? (line) => {
                const progress = parseBatchProgressLine(line);
                if (progress) {
                  onProgress(progress);
                }
              }
            : undefined
        }
      );
    } finally {
      await rm(manifestPath, { force: true }).catch(() => undefined);
    }
  }

  private resolveNodeCommand(): { command: string; args: string[]; env: NodeJS.ProcessEnv; hfHome: string } {
    const command = process.env.LOCAL_PODCAST_NODE_BIN?.trim() || resolvePreferredNodeBinary();
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
        LOCAL_PODCAST_MODELS_DIR: process.env.LOCAL_PODCAST_MODELS_DIR ?? this.modelsDir,
        LOCAL_PODCAST_NODE_HF_CACHE: process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? hfHome,
        NODE_PATH: process.env.NODE_PATH ?? resolveNodeModulesRoot(),
        HF_HOME: process.env.HF_HOME ?? hfHome,
        HF_HUB_CACHE: process.env.HF_HUB_CACHE ?? join(hfHome, "hub")
      }
    };
  }
}

function resolveKokoroNodeScriptPath(): string {
  const override = process.env.LOCAL_PODCAST_KOKORO_NODE_SCRIPT?.trim();
  if (override) {
    return override;
  }
  if (process.env.VITE_DEV_SERVER_URL) {
    return join(resolveWorkspaceRoot(), "services", "kokoro-node", "cli.mjs");
  }
  if (process.resourcesPath) {
    return join(process.resourcesPath, "services", "kokoro-node", "cli.mjs");
  }
  return join(resolveWorkspaceRoot(), "services", "kokoro-node", "cli.mjs");
}

function resolveNodeModulesRoot(): string {
  const nodePath = process.env.NODE_PATH?.trim();
  if (nodePath) {
    return nodePath;
  }
  if (process.env.VITE_DEV_SERVER_URL) {
    return join(resolveWorkspaceRoot(), "node_modules");
  }
  if (process.resourcesPath) {
    return join(process.resourcesPath, "node_modules");
  }
  return join(resolveWorkspaceRoot(), "node_modules");
}

function looksLikeWorkspaceRoot(candidate: string): boolean {
  return (
    existsSync(join(candidate, "package.json")) &&
    existsSync(join(candidate, "apps")) &&
    existsSync(join(candidate, "services")) &&
    existsSync(join(candidate, "resources"))
  );
}

function resolveWorkspaceRoot(): string {
  if (cachedWorkspaceRoot) {
    return cachedWorkspaceRoot;
  }

  let cursor = THIS_DIR;
  for (let depth = 0; depth < 10; depth += 1) {
    if (looksLikeWorkspaceRoot(cursor)) {
      cachedWorkspaceRoot = cursor;
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }

  cachedWorkspaceRoot = resolve(THIS_DIR, "../../../../../");
  return cachedWorkspaceRoot;
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

function resolvePreferredNodeBinary(): string {
  if (isElectronBinary(process.execPath) && commandExists("node")) {
    return "node";
  }
  return process.execPath;
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["-v"], { stdio: "ignore" });
  return result.status === 0;
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: CommandOptions
): Promise<void> {
  const startedAt = Date.now();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stderr = "";
    let stdout = "";
    let finished = false;
    let timeout: NodeJS.Timeout | null = null;
    const armTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        if (finished) {
          return;
        }
        child.kill("SIGKILL");
        const detail = (stderr || stdout).trim();
        const suffix = detail ? ` Details: ${detail}` : "";
        logError("node-kokoro/command", "timeout", {
          command,
          args: summarizeArgs(args),
          timeoutMs: options.timeoutMs,
          detail
        });
        rejectPromise(new Error(`${options.timeoutHint}${suffix}`));
      }, options.timeoutMs);
    };
    armTimeout();

    let stdoutLineBuffer = "";
    child.stdout.on("data", (chunk) => {
      armTimeout();
      const text = chunk.toString("utf-8");
      stdout += text;
      if (stdout.length > 3000) {
        stdout = stdout.slice(-3000);
      }
      stdoutLineBuffer += text;
      let lineBreakIndex = stdoutLineBuffer.indexOf("\n");
      while (lineBreakIndex >= 0) {
        const line = stdoutLineBuffer.slice(0, lineBreakIndex).trim();
        if (line.length > 0) {
          options.onStdoutLine?.(line);
        }
        if (line.length > 0 && shouldLogStdoutLine(line)) {
          logDebug("node-kokoro/command", "stdout", { line });
        }
        stdoutLineBuffer = stdoutLineBuffer.slice(lineBreakIndex + 1);
        lineBreakIndex = stdoutLineBuffer.indexOf("\n");
      }
    });

    child.stderr.on("data", (chunk) => {
      armTimeout();
      stderr += chunk.toString("utf-8");
      if (stderr.length > 3000) {
        stderr = stderr.slice(-3000);
      }
    });

    child.on("error", (error) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      logError("node-kokoro/command", "spawn error", {
        command,
        args: summarizeArgs(args),
        error
      });
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0) {
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= 3_000) {
          logInfo("node-kokoro/command", "completed", {
            command,
            args: summarizeArgs(args),
            elapsedMs
          });
        }
        resolvePromise();
        return;
      }
      logError("node-kokoro/command", "failed", {
        command,
        args: summarizeArgs(args),
        code,
        signal,
        stderr: stderr.trim(),
        stdout: stdout.trim()
      });
      const suffix = signal ? `signal=${signal}` : `code=${code}`;
      rejectPromise(new Error(`Node Kokoro runtime failed (${suffix}): ${stderr}`));
    });
  });
}

export function resolveKokoroVoiceIdForRuntime(voiceId: string): string {
  const mapped = LEGACY_KOKORO_VOICE_ALIASES[voiceId] ?? voiceId;
  const normalized = mapped.trim();
  return normalized.length > 0 ? normalized : "af_heart";
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function summarizeArgs(args: string[]): string[] {
  return args.map((value, index) => {
    if (value.length > 120) {
      return `[arg:${index}:len=${value.length}]`;
    }
    return value;
  });
}

function shouldLogStdoutLine(line: string): boolean {
  const progressMatch = line.match(/^\[kokoro-node\] job (\d+)\/(\d+) saved=/);
  if (!progressMatch) {
    return true;
  }
  const current = Number(progressMatch[1]);
  const total = Number(progressMatch[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return true;
  }
  if (current === 1 || current === total) {
    return true;
  }
  return current % 10 === 0;
}

function parseBatchProgressLine(line: string): BatchTtsProgress | null {
  const progressMatch = line.match(/^\[kokoro-node\] job (\d+)\/(\d+) saved=/);
  if (!progressMatch) {
    return null;
  }
  const completedSegments = Number(progressMatch[1]);
  const totalSegments = Number(progressMatch[2]);
  if (!Number.isFinite(completedSegments) || !Number.isFinite(totalSegments) || totalSegments <= 0) {
    return null;
  }
  return { completedSegments, totalSegments };
}

function computeBatchTimeoutMs(input: {
  cacheLikelyReady: boolean;
  segmentCount: number;
  totalChars: number;
}): number {
  const startupMs = input.cacheLikelyReady ? 90_000 : 240_000;
  const perSegmentMs = input.cacheLikelyReady ? 8_000 : 12_000;
  const perCharMs = input.cacheLikelyReady ? 40 : 80;
  const estimated = startupMs + (input.segmentCount * perSegmentMs) + (input.totalChars * perCharMs);
  return Math.max(180_000, Math.min(estimated, 20 * 60_000));
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
