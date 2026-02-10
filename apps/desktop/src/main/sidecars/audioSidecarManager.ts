import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { AudioClient, type AudioRuntimeCapabilities, type AudioRuntimeClient } from "./audioClient.js";
import { NodeKokoroClient } from "./nodeKokoroClient.js";
import { KOKORO_VOICES } from "./nodeKokoroCore.js";
import { getAudioServiceScriptPath, getKokoroNodeScriptPath, getModelsDir, getNodeModulesRoot } from "../utils/paths.js";
import type {
  AudioRuntimeMode,
  KokoroBackendMode,
  TagValidationResult,
  VoiceDefinition
} from "../../shared/types.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/logging.js";
import { validateExpressionTags } from "../render/expressionTags.js";

export interface AudioSidecarStartOptions {
  modelsDir?: string;
  kokoroBackend?: KokoroBackendMode;
  runtimeMode?: AudioRuntimeMode;
}

export interface RuntimeResourcePolicy {
  strictWakeOnly: boolean;
  idleStopMs: number;
}

export class AudioSidecarManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private readonly port: number;
  private activeConfig: RuntimeConfig | null = null;
  private lastKnownConfig: RuntimeConfig | null = null;
  private readonly pythonClient: AudioClient;
  private activeRuntimeClient: AudioRuntimeClient;
  private lastSidecarStderr = "";
  private readonly runtimeGateway: AudioRuntimeClient;
  private runtimeResourcePolicy: RuntimeResourcePolicy;
  private idleStopMs: number;
  private idleStopTimer: NodeJS.Timeout | null = null;
  private activeClientRequests = 0;

  constructor(port = 43111) {
    this.port = port;
    this.pythonClient = new AudioClient(`http://127.0.0.1:${this.port}`);
    this.activeRuntimeClient = this.pythonClient;
    this.runtimeResourcePolicy = {
      strictWakeOnly: true,
      idleStopMs: resolveIdleStopMs(process.env.LOCAL_PODCAST_AUDIO_IDLE_MS)
    };
    this.idleStopMs = this.runtimeResourcePolicy.idleStopMs;
    this.runtimeGateway = {
      getCapabilities: async () => {
        if (this.hasActiveRuntime()) {
          return this.activeRuntimeClient.getCapabilities();
        }
        return this.getCapabilitiesForInactiveRuntime();
      },
      health: () => this.activeRuntimeClient.health(),
      listVoices: () => this.withRuntimeUsage(
        "listVoices",
        (runtime) => runtime.listVoices(),
        async () => this.getStaticVoicesForInactiveRuntime()
      ),
      previewVoice: (input, outputDir) => this.withRuntimeUsage(
        "previewVoice",
        (runtime) => runtime.previewVoice(input, outputDir)
      ),
      validateTags: (text: string) => this.withRuntimeUsage(
        "validateTags",
        (runtime) => runtime.validateTags(text),
        async () => validateExpressionTags(text) as TagValidationResult
      ),
      batchTts: (segments, outputDir, onProgress, runtimeOptions) => this.withRuntimeUsage(
        "batchTts",
        (runtime) => runtime.batchTts(segments, outputDir, onProgress, runtimeOptions)
      )
    };
  }

  get client(): AudioRuntimeClient {
    return this.runtimeGateway;
  }

  setRuntimeResourcePolicy(policy: RuntimeResourcePolicy): void {
    const nextPolicy: RuntimeResourcePolicy = {
      strictWakeOnly: policy.strictWakeOnly !== false,
      idleStopMs: normalizeIdleStopMs(policy.idleStopMs, this.idleStopMs)
    };
    this.runtimeResourcePolicy = nextPolicy;
    this.idleStopMs = nextPolicy.idleStopMs;
    logInfo("audio-sidecar", "runtime resource policy updated", {
      strictWakeOnly: nextPolicy.strictWakeOnly,
      idleStopMs: nextPolicy.idleStopMs
    });

    if (this.activeClientRequests > 0) {
      this.clearIdleStopTimer();
      return;
    }
    this.scheduleIdleStopIfNeeded("policy-updated");
  }

  setDefaultRuntimeConfig(options: AudioSidecarStartOptions = {}): void {
    const config = this.resolveConfig(options);
    this.lastKnownConfig = config;
    logDebug("audio-sidecar", "default runtime config set", config);
  }

  async start(options: AudioSidecarStartOptions = {}): Promise<void> {
    const config = this.resolveConfig(options);
    this.lastKnownConfig = config;
    this.clearIdleStopTimer();
    logInfo("audio-sidecar", "start requested", config);

    if (this.activeConfig && isSameConfig(this.activeConfig, config) && this.isRuntimeActive(config.runtimeMode)) {
      logDebug("audio-sidecar", "start skipped (already running with same config)", config);
      return;
    }

    if (this.process || this.activeRuntimeClient !== this.pythonClient) {
      logInfo("audio-sidecar", "stopping existing runtime before restart");
      await this.stop();
    }

    if (config.runtimeMode === "node-core") {
      logInfo("audio-sidecar", "starting node-core runtime", {
        modelsDir: config.modelsDir,
        kokoroBackend: config.kokoroBackend
      });
      await this.ensureNodeCacheReady(config.modelsDir);
      this.activeRuntimeClient = new NodeKokoroClient(config.modelsDir);
      this.activeConfig = config;
      await this.waitForHealth(5000);
      logInfo("audio-sidecar", "node-core runtime healthy");
      this.scheduleIdleStopIfNeeded("runtime-started");
      return;
    }

    const script = getAudioServiceScriptPath();
    await access(script, constants.R_OK);

    const pythonBinary = await resolvePythonBinary(script);
    const hfHome = join(config.modelsDir, ".hf-cache");
    const offline = process.env.LOCAL_PODCAST_HF_OFFLINE ?? "1";
    const kokoroNodeScript = getKokoroNodeScriptPath();
    const kokoroNodeCache = join(config.modelsDir, "kokoro-node-cache");
    const nodeBin = process.env.LOCAL_PODCAST_NODE_BIN?.trim() || await resolvePreferredNodeBinary();
    const nodeFlags = resolveNodeFlags(nodeBin);
    logInfo("audio-sidecar", "spawning python sidecar", {
      pythonBinary,
      script,
      port: this.port,
      modelsDir: config.modelsDir,
      kokoroBackend: config.kokoroBackend,
      runtimeMode: config.runtimeMode,
      nodeBin,
      nodeFlags
    });
    this.lastSidecarStderr = "";
    this.process = spawn(pythonBinary, [script, "--port", String(this.port)], {
      stdio: "pipe",
      env: {
        ...process.env,
        LOCAL_PODCAST_MODELS_DIR: config.modelsDir,
        HF_HOME: hfHome,
        HF_HUB_CACHE: join(hfHome, "hub"),
        HF_HUB_OFFLINE: offline,
        TRANSFORMERS_OFFLINE: offline,
        LOCAL_PODCAST_KOKORO_BACKEND: config.kokoroBackend,
        LOCAL_PODCAST_KOKORO_NODE_SCRIPT: process.env.LOCAL_PODCAST_KOKORO_NODE_SCRIPT ?? kokoroNodeScript,
        LOCAL_PODCAST_NODE_HF_CACHE: process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? kokoroNodeCache,
        LOCAL_PODCAST_NODE_BIN: nodeBin,
        LOCAL_PODCAST_NODE_BIN_FLAGS: nodeFlags,
        NODE_PATH: process.env.NODE_PATH ?? getNodeModulesRoot()
      }
    });
    this.activeRuntimeClient = this.pythonClient;
    this.activeConfig = config;

    this.process.stdout.on("data", (chunk) => {
      process.stdout.write(`[audio-sidecar] ${chunk}`);
    });

    this.process.stderr.on("data", (chunk) => {
      this.lastSidecarStderr += chunk.toString("utf-8");
      if (this.lastSidecarStderr.length > 8000) {
        this.lastSidecarStderr = this.lastSidecarStderr.slice(-8000);
      }
      process.stderr.write(`[audio-sidecar] ${chunk}`);
    });

    this.process.on("exit", (code, signal) => {
      logWarn("audio-sidecar", "python sidecar process exited", {
        runtimeMode: config.runtimeMode,
        code,
        signal
      });
      this.process = null;
      this.activeConfig = null;
    });

    await this.waitForHealth(15000);
    logInfo("audio-sidecar", "python sidecar healthy", {
      runtimeMode: config.runtimeMode
    });
    this.scheduleIdleStopIfNeeded("runtime-started");
  }

  async stop(): Promise<void> {
    this.clearIdleStopTimer();
    if (this.process) {
      logInfo("audio-sidecar", "stopping python sidecar process");
      this.process.kill("SIGTERM");
      this.process = null;
    } else {
      logDebug("audio-sidecar", "no python sidecar process to stop");
    }

    await this.releaseActiveRuntimeClient();
    this.activeConfig = null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.activeRuntimeClient.health();
      return health.running;
    } catch {
      return false;
    }
  }

  private async waitForHealth(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const requiresProcess = this.activeConfig?.runtimeMode !== "node-core";
    logDebug("audio-sidecar", "health wait started", {
      timeoutMs,
      requiresProcess,
      runtimeMode: this.activeConfig?.runtimeMode
    });
    while ((Date.now() - start) < timeoutMs) {
      if (requiresProcess && !this.process) {
        const detail = this.lastSidecarStderr.trim();
        if (detail) {
          throw new Error(`Audio sidecar exited before health check passed: ${detail}`);
        }
        throw new Error("Audio sidecar exited before health check passed");
      }
      if (await this.isHealthy()) {
        logDebug("audio-sidecar", "health check passed", {
          elapsedMs: Date.now() - start,
          runtimeMode: this.activeConfig?.runtimeMode
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const detail = this.lastSidecarStderr.trim();
    if (detail) {
      logError("audio-sidecar", "health wait failed", {
        timeoutMs,
        runtimeMode: this.activeConfig?.runtimeMode,
        detail
      });
      throw new Error(`Audio sidecar did not become healthy in time: ${detail}`);
    }
    logError("audio-sidecar", "health wait timed out without stderr", {
      timeoutMs,
      runtimeMode: this.activeConfig?.runtimeMode
    });
    throw new Error("Audio sidecar did not become healthy in time");
  }

  private resolveConfig(
    options: AudioSidecarStartOptions
  ): RuntimeConfig {
    return {
      modelsDir: options.modelsDir ?? process.env.LOCAL_PODCAST_MODELS_DIR ?? getModelsDir(),
      kokoroBackend: options.kokoroBackend ?? (process.env.LOCAL_PODCAST_KOKORO_BACKEND as KokoroBackendMode | undefined) ?? "auto",
      runtimeMode: options.runtimeMode ?? "python-expressive"
    };
  }

  private clearIdleStopTimer(): void {
    if (!this.idleStopTimer) {
      return;
    }
    clearTimeout(this.idleStopTimer);
    this.idleStopTimer = null;
  }

  private scheduleIdleStopIfNeeded(reason: string): void {
    this.clearIdleStopTimer();
    if (this.idleStopMs <= 0 || this.activeClientRequests > 0 || !this.activeConfig) {
      return;
    }
    if (!this.isRuntimeActive(this.activeConfig.runtimeMode)) {
      return;
    }

    this.idleStopTimer = setTimeout(() => {
      this.idleStopTimer = null;
      const config = this.activeConfig;
      if (!config || this.activeClientRequests > 0) {
        return;
      }

      logInfo("audio-sidecar", "idle timeout reached; stopping runtime", {
        idleMs: this.idleStopMs,
        runtimeMode: config.runtimeMode
      });
      void this.stop().catch((error) => {
        logWarn("audio-sidecar", "idle runtime stop failed", { error });
      });
    }, this.idleStopMs);
    this.idleStopTimer.unref?.();
    logDebug("audio-sidecar", "idle stop timer armed", {
      idleMs: this.idleStopMs,
      reason,
      runtimeMode: this.activeConfig.runtimeMode
    });
  }

  private async withRuntimeUsage<T>(
    wakeReason: WakeReason,
    action: (runtime: AudioRuntimeClient) => Promise<T>,
    fallbackWhenNoWake?: () => Promise<T>
  ): Promise<T> {
    this.activeClientRequests += 1;
    this.clearIdleStopTimer();
    try {
      const wakeAllowed = this.canWakeRuntime(wakeReason);
      const runtimeActive = this.hasActiveRuntime();
      logDebug("audio-sidecar", "runtime request received", {
        wakeReason,
        wakeAllowed,
        runtimeActive,
        strictWakeOnly: this.runtimeResourcePolicy.strictWakeOnly
      });
      if (!wakeAllowed && !runtimeActive) {
        logInfo("audio-sidecar", "runtime wake blocked by strict policy", {
          wakeReason
        });
        if (fallbackWhenNoWake) {
          return await fallbackWhenNoWake();
        }
        throw new Error(`Runtime wake blocked by strict policy for ${wakeReason}`);
      }

      await this.ensureRuntimeReadyForRequest({ allowWake: wakeAllowed, wakeReason });
      return await action(this.activeRuntimeClient);
    } finally {
      this.activeClientRequests = Math.max(0, this.activeClientRequests - 1);
      this.scheduleIdleStopIfNeeded("request-complete");
    }
  }

  private async ensureRuntimeReadyForRequest(options: { allowWake: boolean; wakeReason: WakeReason }): Promise<void> {
    const config = this.activeConfig ?? this.lastKnownConfig ?? this.resolveConfig({});
    if (this.isRuntimeActive(config.runtimeMode)) {
      return;
    }

    if (!options.allowWake) {
      return;
    }

    logInfo("audio-sidecar", "runtime inactive for request; starting on demand", {
      ...config,
      wakeReason: options.wakeReason
    });
    await this.start(config);
  }

  private hasActiveRuntime(): boolean {
    return this.process !== null || this.activeRuntimeClient !== this.pythonClient;
  }

  private canWakeRuntime(wakeReason: WakeReason): boolean {
    if (!this.runtimeResourcePolicy.strictWakeOnly) {
      return true;
    }
    return wakeReason === "previewVoice" || wakeReason === "batchTts";
  }

  private getStaticVoicesForInactiveRuntime(): VoiceDefinition[] {
    const config = this.activeConfig ?? this.lastKnownConfig ?? this.resolveConfig({});
    if (config.runtimeMode === "python-expressive") {
      return [...KOKORO_VOICES, ...CHATTERBOX_VOICES].map((voice) => ({ ...voice }));
    }
    return [...KOKORO_VOICES].map((voice) => ({ ...voice }));
  }

  private async ensureNodeCacheReady(modelsDir: string): Promise<void> {
    const cacheDir = join(modelsDir, "kokoro-node-cache");
    if (await hasCachedFiles(cacheDir)) {
      logDebug("audio-sidecar", "node cache already present", { cacheDir });
      return;
    }
    logInfo("audio-sidecar", "node cache missing, seeding", { cacheDir });

    const seedScript = join(dirname(getKokoroNodeScriptPath()), "seed-model.mjs");
    await access(seedScript, constants.R_OK);

    const nodeBin = process.env.LOCAL_PODCAST_NODE_BIN?.trim() || await resolvePreferredNodeBinary();
    const nodeFlags = resolveNodeFlags(nodeBin);
    const args = [
      ...splitFlags(nodeFlags),
      seedScript,
      "--cacheDir",
      cacheDir
    ];
    logInfo("audio-sidecar", "running node cache seed command", {
      nodeBin,
      nodeFlags,
      seedScript,
      cacheDir
    });

    await runCommandWithTimeout(nodeBin, args, {
      ...process.env,
      LOCAL_PODCAST_NODE_HF_CACHE: process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? cacheDir,
      NODE_PATH: process.env.NODE_PATH ?? getNodeModulesRoot()
    }, 90_000, "Kokoro node cache seed timed out. Check network access or pre-seed with `npm run seed:kokoro-node`.");
    logInfo("audio-sidecar", "node cache seed completed", { cacheDir });
  }

  private isRuntimeActive(runtimeMode: AudioRuntimeMode): boolean {
    if (runtimeMode === "node-core") {
      return this.activeRuntimeClient !== this.pythonClient;
    }
    return this.process !== null;
  }

  private async releaseActiveRuntimeClient(): Promise<void> {
    if (this.activeRuntimeClient === this.pythonClient) {
      return;
    }

    const disposable = this.activeRuntimeClient as { dispose?: () => Promise<void> | void };
    if (typeof disposable.dispose === "function") {
      try {
        await Promise.resolve(disposable.dispose());
      } catch (error) {
        logWarn("audio-sidecar", "runtime dispose failed", { error });
      }
    }
    this.activeRuntimeClient = this.pythonClient;
  }

  private getCapabilitiesForInactiveRuntime(): AudioRuntimeCapabilities {
    const mode = this.activeConfig?.runtimeMode ?? this.lastKnownConfig?.runtimeMode;
    if (mode === "node-core") {
      return {
        runtime: "node-core",
        supportsKokoroDeviceOverride: true,
        supportedKokoroDevices: ["cpu"]
      };
    }
    if (mode === "python-expressive") {
      return {
        runtime: "python-expressive",
        supportsKokoroDeviceOverride: false,
        supportedKokoroDevices: []
      };
    }
    return {
      runtime: "unknown",
      supportsKokoroDeviceOverride: false,
      supportedKokoroDevices: []
    };
  }
}

const commandExistsCache = new Map<string, Promise<boolean>>();

async function resolvePythonBinary(audioServiceScriptPath: string): Promise<string> {
  const override = process.env.LOCAL_PODCAST_PYTHON_BIN;
  if (override && await commandExists(override)) {
    return override;
  }

  const venvPython = join(dirname(audioServiceScriptPath), ".venv", "bin", "python");
  if (await commandExists(venvPython)) {
    return venvPython;
  }

  for (const candidate of ["python3.12", "python3.13", "python3.11", "python3"]) {
    if (await commandExists(candidate)) {
      return candidate;
    }
  }

  return "python3";
}

async function commandExists(command: string): Promise<boolean> {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  const cached = commandExistsCache.get(normalized);
  if (cached) {
    return cached;
  }

  const probe = (async () => {
    if (isAbsolute(normalized) || normalized.includes("/")) {
      try {
        await access(normalized, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }

    return await new Promise<boolean>((resolvePromise) => {
      const child = spawn(normalized, ["--version"], { stdio: "ignore" });
      child.once("error", () => resolvePromise(false));
      child.once("exit", (code) => resolvePromise(code === 0));
    });
  })();

  commandExistsCache.set(normalized, probe);
  return probe;
}

async function resolvePreferredNodeBinary(): Promise<string> {
  if (isElectronBinary(process.execPath) && await commandExists("node")) {
    return "node";
  }
  return process.execPath;
}

function isSameConfig(
  left: RuntimeConfig,
  right: RuntimeConfig
): boolean {
  return (
    left.modelsDir === right.modelsDir
      && left.kokoroBackend === right.kokoroBackend
      && left.runtimeMode === right.runtimeMode
  );
}

interface RuntimeConfig {
  modelsDir: string;
  kokoroBackend: KokoroBackendMode;
  runtimeMode: AudioRuntimeMode;
}

type WakeReason = "listVoices" | "validateTags" | "previewVoice" | "batchTts";

const CHATTERBOX_VOICES: VoiceDefinition[] = [
  {
    id: "chatterbox_expressive",
    model: "chatterbox",
    label: "Chatterbox Expressive",
    description: "Expression-heavy dialogue"
  },
  {
    id: "chatterbox_studio",
    model: "chatterbox",
    label: "Chatterbox Studio",
    description: "Balanced expressive studio voice"
  }
];

function resolveIdleStopMs(value: string | undefined): number {
  const fallback = 5 * 60_000;
  if (!value) {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeIdleStopMs(value: number, fallback = 5 * 60_000): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value > 0 ? Math.floor(value) : 0;
}

function defaultNodeFlags(nodeBin: string): string {
  const base = basename(nodeBin).toLowerCase();
  if (base === "node" || base.startsWith("node")) {
    return "";
  }
  return "--run-as-node";
}

function resolveNodeFlags(nodeBin: string): string {
  const fromEnv = process.env.LOCAL_PODCAST_NODE_BIN_FLAGS?.trim();
  if (fromEnv) {
    if (isElectronBinary(nodeBin) && !fromEnv.includes("--run-as-node")) {
      return `--run-as-node ${fromEnv}`.trim();
    }
    return fromEnv;
  }
  return defaultNodeFlags(nodeBin);
}

function isElectronBinary(nodeBin: string): boolean {
  return basename(nodeBin).toLowerCase().includes("electron");
}

function splitFlags(value: string): string[] {
  return value.split(/\s+/g).filter(Boolean);
}

async function runCommandWithTimeout(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  timeoutMessage: string
): Promise<void> {
  logDebug("audio-sidecar/command", "spawn", {
    command,
    args,
    timeoutMs
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stderr = "";
    let stdout = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }
      child.kill("SIGKILL");
      const detail = (stderr || stdout).trim();
      const suffix = detail ? ` Details: ${detail}` : "";
      logError("audio-sidecar/command", "timeout", {
        command,
        args,
        timeoutMs,
        detail
      });
      rejectPromise(new Error(`${timeoutMessage}${suffix}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length > 6000) {
        stdout = stdout.slice(-6000);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > 6000) {
        stderr = stderr.slice(-6000);
      }
    });

    child.on("error", (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      logError("audio-sidecar/command", "spawn error", {
        command,
        args,
        error
      });
      rejectPromise(error);
    });

    child.on("close", (code, signal) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      if (code === 0) {
        logDebug("audio-sidecar/command", "completed", {
          command,
          args,
          stdout: stdout.trim()
        });
        resolvePromise();
        return;
      }
      const detail = (stderr || stdout).trim();
      logError("audio-sidecar/command", "failed", {
        command,
        args,
        code,
        signal,
        detail
      });
      const exitLabel = signal ? `signal=${signal}` : `code=${code}`;
      rejectPromise(new Error(`Command failed (${exitLabel}): ${detail}`));
    });
  });
}

async function hasCachedFiles(root: string): Promise<boolean> {
  try {
    const queue = [root];
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
