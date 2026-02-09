import { app } from "electron";
import { spawn } from "node:child_process";
import { constants, createWriteStream } from "node:fs";
import { access, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { dirname, join, relative, resolve } from "node:path";
import type {
  AudioRuntimeMode,
  BootstrapStartInput,
  BootstrapStatus,
  KokoroBackendMode,
  ModelPackSource,
  ModelPackState,
  ModelPackStatus
} from "../../shared/types.js";
import type { AudioSidecarManager } from "../sidecars/audioSidecarManager.js";
import { getModelsDir } from "../utils/paths.js";

interface PersistedBootstrapState {
  installPath: string;
  kokoroBackend: KokoroBackendMode;
  installedPacks: string[];
  completedAt: string;
}

interface ModelPackDefinition {
  id: string;
  title: string;
  description: string;
  sizeBytes: number;
  required: boolean;
  recommended: boolean;
  installTargets: string[];
  remoteUrlEnv: string;
}

interface ModelPackSourceInfo {
  source: ModelPackSource;
  downloadUrl?: string;
}

interface CopyEntry {
  sourcePath: string;
  relativePath: string;
  size: number;
}

const STATE_FILE_NAME = "bootstrap-state.json";
const DOWNLOADS_DIR_NAME = ".downloads";
const ALLOWED_BACKENDS: KokoroBackendMode[] = ["auto", "node", "node-first", "node-fallback"];

const MODEL_PACKS: ModelPackDefinition[] = [
  {
    id: "kokoro-core",
    title: "Kokoro Core",
    description: "Required local narration pack for baseline audiobook rendering.",
    sizeBytes: 380 * 1024 * 1024,
    required: true,
    recommended: true,
    installTargets: ["kokoro", "kokoro-node-cache"],
    remoteUrlEnv: "LOCAL_PODCAST_MODEL_URL_KOKORO_PACK"
  },
  {
    id: "chatterbox-expressive",
    title: "Chatterbox Expressive",
    description: "Optional expressive voice pack with tokenizer cache for dialogue-heavy projects.",
    sizeBytes: 640 * 1024 * 1024,
    required: false,
    recommended: true,
    installTargets: ["chatterbox", ".hf-cache"],
    remoteUrlEnv: "LOCAL_PODCAST_MODEL_URL_CHATTERBOX_PACK"
  }
];

const MODEL_PACK_BY_ID = new Map(MODEL_PACKS.map((pack) => [pack.id, pack]));

export class BootstrapManager {
  private readonly audioSidecar: AudioSidecarManager;
  private statePath = "";
  private status: BootstrapStatus;
  private initialized = false;
  private currentRun: Promise<void> | null = null;
  private lastProgressUpdate = 0;

  constructor(audioSidecar: AudioSidecarManager) {
    this.audioSidecar = audioSidecar;
    this.status = {
      phase: "awaiting-input",
      firstRun: true,
      defaultInstallPath: "",
      installPath: "",
      kokoroBackend: "auto",
      step: "idle",
      message: "Select a runtime path and required model packs.",
      percent: 0,
      bytesCopied: 0,
      bytesTotal: 0,
      modelPacks: []
    };
  }

  async getStatus(): Promise<BootstrapStatus> {
    await this.ensureInitialized();
    if (this.status.phase !== "running") {
      await this.refreshPackStatuses();
      this.refreshAwaitingMessage();
    }
    return { ...this.status, modelPacks: this.status.modelPacks.map(clonePackStatus) };
  }

  async start(input: BootstrapStartInput): Promise<BootstrapStatus> {
    await this.ensureInitialized();

    if (this.currentRun) {
      return { ...this.status, modelPacks: this.status.modelPacks.map(clonePackStatus) };
    }

    const normalized = this.normalizeInput(input);
    this.status.installPath = normalized.installPath;
    this.status.kokoroBackend = normalized.kokoroBackend;
    await this.refreshPackStatuses();

    const selectedPackIds = this.normalizeSelectedPackIds(normalized.selectedPackIds);
    if (selectedPackIds.length === 0) {
      this.status = {
        ...this.status,
        phase: "error",
        step: "validate",
        message: "Choose at least one model pack to continue.",
        error: "No model packs selected."
      };
      return { ...this.status, modelPacks: this.status.modelPacks.map(clonePackStatus) };
    }

    this.status = {
      ...this.status,
      phase: "running",
      step: "prepare",
      message: "Preparing runtime folders...",
      percent: 1,
      bytesCopied: 0,
      bytesTotal: 0,
      error: undefined
    };

    this.currentRun = this.runBootstrap(normalized, selectedPackIds).finally(() => {
      this.currentRun = null;
    });

    return { ...this.status, modelPacks: this.status.modelPacks.map(clonePackStatus) };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    const userDataPath = app.getPath("userData");
    const defaultInstallPath = join(userDataPath, "offline-runtime");
    this.statePath = join(userDataPath, STATE_FILE_NAME);
    this.status.defaultInstallPath = defaultInstallPath;
    this.status.installPath = defaultInstallPath;

    try {
      const raw = await readFile(this.statePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedBootstrapState>;
      if (parsed.installPath) {
        this.status.installPath = resolve(parsed.installPath);
      }
      if (parsed.kokoroBackend && ALLOWED_BACKENDS.includes(parsed.kokoroBackend)) {
        this.status.kokoroBackend = parsed.kokoroBackend;
      }
    } catch {
      // Missing state is expected on first run.
    }

    await this.refreshPackStatuses();
    this.refreshAwaitingMessage();
  }

  private async refreshPackStatuses(): Promise<void> {
    const previousById = new Map(this.status.modelPacks.map((pack) => [pack.id, pack]));
    const next: ModelPackStatus[] = [];

    for (const definition of MODEL_PACKS) {
      const existing = previousById.get(definition.id);
      if (existing && this.status.phase === "running" && isTransientPackState(existing.state)) {
        next.push(existing);
        continue;
      }

      const sourceInfo = this.resolvePackSource(definition);
      const installed = await this.isPackInstalled(definition, this.status.installPath);
      next.push({
        id: definition.id,
        title: definition.title,
        description: definition.description,
        sizeBytes: definition.sizeBytes,
        required: definition.required,
        recommended: definition.recommended,
        source: sourceInfo.source,
        downloadUrl: sourceInfo.downloadUrl,
        state: installed ? "installed" : "not-installed",
        percent: installed ? 100 : 0,
        downloadedBytes: installed ? definition.sizeBytes : 0,
        totalBytes: definition.sizeBytes
      });
    }

    this.status.modelPacks = next;
    this.status.firstRun = this.hasMissingRequiredPack();
  }

  private refreshAwaitingMessage(): void {
    if (this.status.phase === "running") {
      return;
    }

    if (this.status.phase === "ready") {
      return;
    }

    if (this.status.phase === "error" && this.status.error) {
      return;
    }

    this.status.phase = "awaiting-input";
    this.status.step = this.status.firstRun ? "select-packs" : "awaiting-start";
    this.status.message = this.status.firstRun
      ? "Download and install required model packs to continue."
      : "Local models are already installed. Start services to continue.";
    this.status.percent = 0;
    this.status.bytesCopied = 0;
    this.status.bytesTotal = 0;
    this.status.error = undefined;
  }

  private normalizeInput(input: BootstrapStartInput): BootstrapStartInput {
    const installPath = input.installPath.trim() ? resolve(input.installPath.trim()) : this.status.installPath;
    const kokoroBackend = ALLOWED_BACKENDS.includes(input.kokoroBackend) ? input.kokoroBackend : "auto";
    return {
      installPath,
      kokoroBackend,
      selectedPackIds: input.selectedPackIds
    };
  }

  private normalizeSelectedPackIds(candidateIds: string[]): string[] {
    const valid = new Set(MODEL_PACKS.map((pack) => pack.id));
    const selected = new Set<string>();

    for (const id of candidateIds) {
      if (valid.has(id)) {
        selected.add(id);
      }
    }

    for (const pack of MODEL_PACKS) {
      if (pack.required) {
        selected.add(pack.id);
      }
    }

    return [...selected];
  }

  private async runBootstrap(input: BootstrapStartInput, selectedPackIds: string[]): Promise<void> {
    try {
      await mkdir(input.installPath, { recursive: true });
      const targetModelsDir = join(input.installPath, "models");
      const downloadsDir = join(input.installPath, DOWNLOADS_DIR_NAME);
      await mkdir(targetModelsDir, { recursive: true });
      await mkdir(downloadsDir, { recursive: true });

      const selectedPacks = this.status.modelPacks.filter((pack) => selectedPackIds.includes(pack.id));
      const pendingPacks = selectedPacks.filter((pack) => pack.state !== "installed");

      const packTotals = new Map<string, number>();
      const packDone = new Map<string, number>();
      for (const pack of pendingPacks) {
        packTotals.set(pack.id, Math.max(pack.totalBytes, 1));
        packDone.set(pack.id, 0);
        this.patchPack(pack.id, { state: "queued", error: undefined, percent: 0 });
      }
      this.updateOverallProgress("queue", "Preparing selected model packs...", packDone, packTotals, true);

      for (const packStatus of pendingPacks) {
        const definition = MODEL_PACK_BY_ID.get(packStatus.id);
        if (!definition) {
          throw new Error(`Unknown model pack: ${packStatus.id}`);
        }

        const sourceInfo = this.resolvePackSource(definition);
        if (sourceInfo.source === "remote" && sourceInfo.downloadUrl) {
          await this.downloadAndInstallRemotePack(
            definition,
            sourceInfo.downloadUrl,
            downloadsDir,
            targetModelsDir,
            packDone,
            packTotals
          );
        } else {
          await this.installBundledPack(
            definition,
            targetModelsDir,
            packDone,
            packTotals
          );
        }

        const packTotal = packTotals.get(definition.id) ?? definition.sizeBytes;
        packDone.set(definition.id, packTotal);
        this.patchPack(definition.id, {
          state: "installed",
          percent: 100,
          downloadedBytes: packTotal,
          totalBytes: packTotal,
          error: undefined
        });
        this.updateOverallProgress("install", `Installed ${definition.title}.`, packDone, packTotals, true);
      }

      const runtimeMode = determineRuntimeMode(selectedPackIds);
      let runtimeModeUsed: AudioRuntimeMode = runtimeMode;

      this.status = {
        ...this.status,
        phase: "running",
        step: "sidecar",
        message: runtimeMode === "node-core"
          ? "Starting local speech runtime (warming model cache on first run)..."
          : "Starting local speech runtime...",
        percent: 92
      };

      try {
        await withTimeout(this.audioSidecar.start({
          modelsDir: targetModelsDir,
          kokoroBackend: input.kokoroBackend,
          runtimeMode
        }), 120_000, "Timed out while starting local speech runtime. If this is first run, verify network or pre-seed Kokoro cache with `npm run seed:kokoro-node` and retry.");
      } catch (error) {
        if (runtimeMode !== "node-core") {
          throw error;
        }

        this.status = {
          ...this.status,
          phase: "running",
          step: "sidecar-fallback",
          message: "Node core runtime unavailable. Falling back to Python runtime...",
          percent: 94
        };

        await withTimeout(this.audioSidecar.start({
          modelsDir: targetModelsDir,
          kokoroBackend: input.kokoroBackend,
          runtimeMode: "python-expressive"
        }), 120_000, "Timed out while starting fallback Python runtime.");
        runtimeModeUsed = "python-expressive";
      }

      await this.refreshPackStatuses();
      await this.persistState({
        installPath: input.installPath,
        kokoroBackend: input.kokoroBackend,
        installedPacks: this.status.modelPacks.filter((pack) => pack.state === "installed").map((pack) => pack.id),
        completedAt: new Date().toISOString()
      });

      const total = this.status.modelPacks
        .filter((pack) => selectedPackIds.includes(pack.id))
        .reduce((sum, pack) => sum + Math.max(pack.totalBytes, 0), 0);

      this.status = {
        ...this.status,
        phase: "ready",
        firstRun: false,
        step: "ready",
        message: runtimeModeUsed === "python-expressive"
          ? "Selected model packs are installed. Expressive runtime is ready."
          : "Required model packs are installed. Core local runtime is ready (no Python required).",
        percent: 100,
        bytesCopied: total,
        bytesTotal: total,
        error: undefined
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = {
        ...this.status,
        phase: "error",
        step: "error",
        message: "Setup failed. Review the error and retry.",
        error: message
      };
    }
  }

  private async downloadAndInstallRemotePack(
    definition: ModelPackDefinition,
    downloadUrl: string,
    downloadsDir: string,
    targetModelsDir: string,
    packDone: Map<string, number>,
    packTotals: Map<string, number>
  ): Promise<void> {
    const archivePath = join(downloadsDir, `${definition.id}.tar.gz`);
    this.patchPack(definition.id, {
      state: "downloading",
      downloadUrl,
      source: "remote",
      percent: 0,
      downloadedBytes: 0,
      totalBytes: packTotals.get(definition.id) ?? definition.sizeBytes,
      error: undefined
    });

    await downloadToFile(downloadUrl, archivePath, (downloadedBytes, totalBytes) => {
      const normalizedTotal = totalBytes > 0 ? totalBytes : Math.max(packTotals.get(definition.id) ?? definition.sizeBytes, 1);
      packTotals.set(definition.id, normalizedTotal);
      packDone.set(definition.id, downloadedBytes);
      this.patchPack(definition.id, {
        state: "downloading",
        percent: toPercent(downloadedBytes, normalizedTotal),
        downloadedBytes,
        totalBytes: normalizedTotal
      });
      this.updateOverallProgress(
        "download",
        `Downloading ${definition.title}...`,
        packDone,
        packTotals
      );
    });

    this.patchPack(definition.id, {
      state: "extracting",
      percent: 100,
      downloadedBytes: packTotals.get(definition.id) ?? definition.sizeBytes,
      totalBytes: packTotals.get(definition.id) ?? definition.sizeBytes
    });
    this.status.step = "extract";
    this.status.message = `Installing ${definition.title}...`;
    await installArchivePack(archivePath, definition.installTargets, targetModelsDir);
  }

  private async installBundledPack(
    definition: ModelPackDefinition,
    targetModelsDir: string,
    packDone: Map<string, number>,
    packTotals: Map<string, number>
  ): Promise<void> {
    const sourceModelsDir = getModelsDir();
    this.patchPack(definition.id, {
      state: "downloading",
      source: "bundled",
      percent: 0,
      downloadedBytes: 0,
      totalBytes: definition.sizeBytes,
      error: undefined
    });

    await installBundledTargets(
      sourceModelsDir,
      definition.installTargets,
      targetModelsDir,
      (copiedBytes, totalBytes) => {
        const normalizedTotal = totalBytes > 0 ? totalBytes : Math.max(definition.sizeBytes, 1);
        packTotals.set(definition.id, normalizedTotal);
        packDone.set(definition.id, copiedBytes);
        this.patchPack(definition.id, {
          state: "downloading",
          percent: toPercent(copiedBytes, normalizedTotal),
          downloadedBytes: copiedBytes,
          totalBytes: normalizedTotal
        });
        this.updateOverallProgress(
          "install",
          `Installing bundled ${definition.title}...`,
          packDone,
          packTotals
        );
      }
    );
  }

  private patchPack(packId: string, patch: Partial<ModelPackStatus>): void {
    this.status.modelPacks = this.status.modelPacks.map((pack) => (
      pack.id === packId ? { ...pack, ...patch } : pack
    ));
  }

  private updateOverallProgress(
    step: string,
    message: string,
    packDone: Map<string, number>,
    packTotals: Map<string, number>,
    force = false
  ): void {
    const now = Date.now();
    if (!force && (now - this.lastProgressUpdate) < 120) {
      return;
    }
    this.lastProgressUpdate = now;

    const bytesTotal = [...packTotals.values()].reduce((sum, value) => sum + Math.max(value, 0), 0);
    const bytesCopied = [...packDone.entries()].reduce((sum, [packId, copied]) => {
      const total = packTotals.get(packId) ?? copied;
      return sum + Math.min(Math.max(copied, 0), Math.max(total, 0));
    }, 0);

    const ratio = bytesTotal > 0 ? bytesCopied / bytesTotal : 1;
    const percent = Math.min(86, Math.max(8, Math.round(8 + (ratio * 78))));

    this.status = {
      ...this.status,
      phase: "running",
      step,
      message,
      percent,
      bytesCopied,
      bytesTotal,
      error: undefined
    };
  }

  private resolvePackSource(definition: ModelPackDefinition): ModelPackSourceInfo {
    const configuredUrl = process.env[definition.remoteUrlEnv]?.trim();
    if (configuredUrl) {
      return { source: "remote", downloadUrl: configuredUrl };
    }
    return { source: "bundled" };
  }

  private hasMissingRequiredPack(): boolean {
    return this.status.modelPacks.some((pack) => pack.required && pack.state !== "installed");
  }

  private async isPackInstalled(definition: ModelPackDefinition, installPath: string): Promise<boolean> {
    const modelsRoot = join(installPath, "models");
    for (const target of definition.installTargets) {
      const targetPath = join(modelsRoot, target);
      if (!(await pathExists(targetPath))) {
        return false;
      }
    }
    return true;
  }

  private async persistState(state: PersistedBootstrapState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2), "utf-8");
  }
}

async function downloadToFile(
  url: string,
  destinationPath: string,
  onProgress: (downloadedBytes: number, totalBytes: number) => void
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download model pack (${response.status}): ${url}`);
  }

  const totalBytes = Number(response.headers.get("content-length") ?? "0");
  await mkdir(dirname(destinationPath), { recursive: true });
  const writer = createWriteStream(destinationPath);
  const reader = response.body.getReader();

  let downloadedBytes = 0;
  onProgress(downloadedBytes, totalBytes);

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    downloadedBytes += value.byteLength;
    if (!writer.write(Buffer.from(value))) {
      await once(writer, "drain");
    }
    onProgress(downloadedBytes, totalBytes);
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    writer.end((error?: Error | null) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise();
    });
  });
  onProgress(downloadedBytes, totalBytes);
}

async function installArchivePack(
  archivePath: string,
  installTargets: string[],
  targetModelsDir: string
): Promise<void> {
  const extractDir = join(dirname(archivePath), `${Date.now()}-extract`);
  await mkdir(extractDir, { recursive: true });

  try {
    await runCommand("tar", ["-xzf", archivePath, "-C", extractDir]);

    for (const installTarget of installTargets) {
      const sourcePath = await resolveExtractedTargetPath(extractDir, installTarget, installTargets.length);
      if (!sourcePath) {
        throw new Error(`Downloaded pack missing expected target '${installTarget}'.`);
      }

      const destinationPath = join(targetModelsDir, installTarget);
      await rm(destinationPath, { recursive: true, force: true });
      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { recursive: true, force: true });
    }
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

async function resolveExtractedTargetPath(
  extractRoot: string,
  installTarget: string,
  targetCount: number
): Promise<string | null> {
  const direct = join(extractRoot, installTarget);
  if (await pathExists(direct)) {
    return direct;
  }

  const underModels = join(extractRoot, "models", installTarget);
  if (await pathExists(underModels)) {
    return underModels;
  }

  if (targetCount === 1) {
    const entries = await readdir(extractRoot, { withFileTypes: true });
    const contentEntries = entries.filter((entry) => !entry.name.startsWith("."));
    if (contentEntries.length === 1) {
      const singleEntry = contentEntries[0];
      if (singleEntry) {
        const candidate = join(extractRoot, singleEntry.name);
        if (await pathExists(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

async function installBundledTargets(
  sourceModelsDir: string,
  installTargets: string[],
  destinationModelsDir: string,
  onProgress: (copiedBytes: number, totalBytes: number) => void
): Promise<void> {
  const copyEntries = await collectCopyEntriesForTargets(sourceModelsDir, installTargets);
  const totalBytes = copyEntries.reduce((sum, entry) => sum + entry.size, 0);
  let copiedBytes = 0;

  for (const installTarget of installTargets) {
    const sourcePath = join(sourceModelsDir, installTarget);
    if (!(await pathExists(sourcePath))) {
      throw new Error(`Bundled model target missing: ${sourcePath}`);
    }
    await mkdir(join(destinationModelsDir, installTarget), { recursive: true });
  }

  onProgress(copiedBytes, totalBytes);

  for (const entry of copyEntries) {
    const destinationPath = join(destinationModelsDir, entry.relativePath);
    await mkdir(dirname(destinationPath), { recursive: true });

    let shouldCopy = true;
    try {
      const destinationStat = await stat(destinationPath);
      shouldCopy = destinationStat.size !== entry.size;
    } catch {
      shouldCopy = true;
    }

    if (shouldCopy) {
      await copyFile(entry.sourcePath, destinationPath);
    }

    copiedBytes += entry.size;
    onProgress(copiedBytes, totalBytes);
  }
}

async function collectCopyEntriesForTargets(sourceRoot: string, installTargets: string[]): Promise<CopyEntry[]> {
  const entries: CopyEntry[] = [];

  for (const installTarget of installTargets) {
    const targetPath = join(sourceRoot, installTarget);
    const targetStats = await stat(targetPath).catch(() => null);
    if (!targetStats) {
      throw new Error(`Bundled model target missing: ${targetPath}`);
    }

    if (targetStats.isFile()) {
      entries.push({
        sourcePath: targetPath,
        relativePath: installTarget,
        size: targetStats.size
      });
      continue;
    }

    const queue: string[] = [targetPath];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const children = await readdir(current, { withFileTypes: true });
      for (const child of children) {
        const childPath = join(current, child.name);
        if (child.isDirectory()) {
          queue.push(childPath);
          continue;
        }

        if (!child.isFile()) {
          continue;
        }

        const childStats = await stat(childPath);
        entries.push({
          sourcePath: childPath,
          relativePath: relative(sourceRoot, childPath),
          size: childStats.size
        });
      }
    }
  }

  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return entries;
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

function clonePackStatus(pack: ModelPackStatus): ModelPackStatus {
  return { ...pack };
}

function isTransientPackState(state: ModelPackState): boolean {
  return state === "queued" || state === "downloading" || state === "extracting";
}

function determineRuntimeMode(selectedPackIds: string[]): AudioRuntimeMode {
  return selectedPackIds.includes("chatterbox-expressive") ? "python-expressive" : "node-core";
}

function toPercent(done: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await new Promise<T>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error(message));
    }, timeoutMs);

    void promise.then((value) => {
      clearTimeout(timeout);
      resolvePromise(value);
    }).catch((error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
  });
}
