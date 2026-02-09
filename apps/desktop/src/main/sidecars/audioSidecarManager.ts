import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";
import { AudioClient, type AudioRuntimeClient } from "./audioClient.js";
import { NodeKokoroClient } from "./nodeKokoroClient.js";
import { getAudioServiceScriptPath, getKokoroNodeScriptPath, getModelsDir, getNodeModulesRoot } from "../utils/paths.js";
import type { AudioRuntimeMode, KokoroBackendMode } from "../../shared/types.js";

export interface AudioSidecarStartOptions {
  modelsDir?: string;
  kokoroBackend?: KokoroBackendMode;
  runtimeMode?: AudioRuntimeMode;
}

export class AudioSidecarManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private readonly port: number;
  private activeConfig: { modelsDir: string; kokoroBackend: KokoroBackendMode; runtimeMode: AudioRuntimeMode } | null = null;
  private readonly pythonClient: AudioClient;
  private activeRuntimeClient: AudioRuntimeClient;
  private lastSidecarStderr = "";
  private readonly runtimeGateway: AudioRuntimeClient;

  constructor(port = 43111) {
    this.port = port;
    this.pythonClient = new AudioClient(`http://127.0.0.1:${this.port}`);
    this.activeRuntimeClient = this.pythonClient;
    this.runtimeGateway = {
      health: () => this.activeRuntimeClient.health(),
      listVoices: () => this.activeRuntimeClient.listVoices(),
      validateTags: (text: string) => this.activeRuntimeClient.validateTags(text),
      batchTts: (segments, outputDir) => this.activeRuntimeClient.batchTts(segments, outputDir)
    };
  }

  get client(): AudioRuntimeClient {
    return this.runtimeGateway;
  }

  async start(options: AudioSidecarStartOptions = {}): Promise<void> {
    const config = this.resolveConfig(options);

    if (this.process && this.activeConfig && isSameConfig(this.activeConfig, config)) {
      return;
    }

    if (this.process) {
      await this.stop();
    }

    if (config.runtimeMode === "node-core") {
      await this.ensureNodeCacheReady(config.modelsDir);
      this.activeRuntimeClient = new NodeKokoroClient(config.modelsDir);
      this.activeConfig = config;
      await this.waitForHealth(5000);
      return;
    }

    const script = getAudioServiceScriptPath();
    await access(script, constants.R_OK);

    const pythonBinary = resolvePythonBinary(script);
    const hfHome = join(config.modelsDir, ".hf-cache");
    const offline = process.env.LOCAL_PODCAST_HF_OFFLINE ?? "1";
    const kokoroNodeScript = getKokoroNodeScriptPath();
    const kokoroNodeCache = join(config.modelsDir, "kokoro-node-cache");
    const nodeBin = process.env.LOCAL_PODCAST_NODE_BIN?.trim() || process.execPath;
    const nodeFlags = resolveNodeFlags(nodeBin);
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

    this.process.on("exit", () => {
      this.process = null;
      this.activeConfig = null;
    });

    await this.waitForHealth(15000);
  }

  async stop(): Promise<void> {
    if (!this.process) {
      this.activeConfig = null;
      return;
    }

    this.process.kill("SIGTERM");
    this.process = null;
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
    while ((Date.now() - start) < timeoutMs) {
      if (requiresProcess && !this.process) {
        const detail = this.lastSidecarStderr.trim();
        if (detail) {
          throw new Error(`Audio sidecar exited before health check passed: ${detail}`);
        }
        throw new Error("Audio sidecar exited before health check passed");
      }
      if (await this.isHealthy()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const detail = this.lastSidecarStderr.trim();
    if (detail) {
      throw new Error(`Audio sidecar did not become healthy in time: ${detail}`);
    }
    throw new Error("Audio sidecar did not become healthy in time");
  }

  private resolveConfig(
    options: AudioSidecarStartOptions
  ): { modelsDir: string; kokoroBackend: KokoroBackendMode; runtimeMode: AudioRuntimeMode } {
    return {
      modelsDir: options.modelsDir ?? process.env.LOCAL_PODCAST_MODELS_DIR ?? getModelsDir(),
      kokoroBackend: options.kokoroBackend ?? (process.env.LOCAL_PODCAST_KOKORO_BACKEND as KokoroBackendMode | undefined) ?? "auto",
      runtimeMode: options.runtimeMode ?? "python-expressive"
    };
  }

  private async ensureNodeCacheReady(modelsDir: string): Promise<void> {
    const cacheDir = join(modelsDir, "kokoro-node-cache");
    if (await hasCachedFiles(cacheDir)) {
      return;
    }

    const seedScript = join(dirname(getKokoroNodeScriptPath()), "seed-model.mjs");
    await access(seedScript, constants.R_OK);

    const nodeBin = process.env.LOCAL_PODCAST_NODE_BIN?.trim() || process.execPath;
    const nodeFlags = resolveNodeFlags(nodeBin);
    const args = [
      ...splitFlags(nodeFlags),
      seedScript,
      "--cacheDir",
      cacheDir
    ];

    await runCommandWithTimeout(nodeBin, args, {
      ...process.env,
      LOCAL_PODCAST_NODE_HF_CACHE: process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? cacheDir,
      NODE_PATH: process.env.NODE_PATH ?? getNodeModulesRoot()
    }, 90_000, "Kokoro node cache seed timed out. Check network access or pre-seed with `npm run seed:kokoro-node`.");
  }
}

function resolvePythonBinary(audioServiceScriptPath: string): string {
  const override = process.env.LOCAL_PODCAST_PYTHON_BIN;
  if (override && commandExists(override)) {
    return override;
  }

  const venvPython = join(dirname(audioServiceScriptPath), ".venv", "bin", "python");
  if (commandExists(venvPython)) {
    return venvPython;
  }

  for (const candidate of ["python3.12", "python3.13", "python3.11", "python3"]) {
    if (commandExists(candidate)) {
      return candidate;
    }
  }

  return "python3";
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function isSameConfig(
  left: { modelsDir: string; kokoroBackend: KokoroBackendMode; runtimeMode: AudioRuntimeMode },
  right: { modelsDir: string; kokoroBackend: KokoroBackendMode; runtimeMode: AudioRuntimeMode }
): boolean {
  return (
    left.modelsDir === right.modelsDir
      && left.kokoroBackend === right.kokoroBackend
      && left.runtimeMode === right.runtimeMode
  );
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
      const detail = (stderr || stdout).trim();
      rejectPromise(new Error(`Command failed (${code}): ${detail}`));
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
