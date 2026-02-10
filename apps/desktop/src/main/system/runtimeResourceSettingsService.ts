import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  RuntimeResourceSettings,
  UpdateRuntimeResourceSettingsInput
} from "../../shared/types.js";
import { logDebug, logInfo, logWarn } from "../utils/logging.js";

const SETTINGS_FILE_NAME = "runtime-resource-settings.json";
const DEFAULT_STRICT_WAKE_ONLY = true;
const DEFAULT_IDLE_STOP_MINUTES = 5;
const MIN_IDLE_STOP_MINUTES = 1;
const MAX_IDLE_STOP_MINUTES = 30;
const IDLE_TIMEOUT_ENV_VAR = "LOCAL_PODCAST_AUDIO_IDLE_MS";

interface PersistedRuntimeResourceSettings {
  strictWakeOnly?: unknown;
  idleStopMinutes?: unknown;
  kokoroAccelerationMode?: unknown;
  explicitChoiceSaved?: unknown;
}

export interface RuntimeResourcePolicy {
  strictWakeOnly: boolean;
  idleStopMs: number;
}

export class RuntimeResourceSettingsService {
  private filePath = "";
  private loaded = false;
  private readonly fallbackIdleStopMinutes = resolveFallbackIdleStopMinutesFromEnv();
  private settings: RuntimeResourceSettings = {
    strictWakeOnly: DEFAULT_STRICT_WAKE_ONLY,
    idleStopMinutes: this.fallbackIdleStopMinutes,
    promptPending: true
  };

  async initialize(): Promise<RuntimeResourceSettings> {
    if (this.loaded) {
      return this.getSettings();
    }

    const userDataPath = app.getPath("userData");
    this.filePath = join(userDataPath, SETTINGS_FILE_NAME);

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistedRuntimeResourceSettings;
      const hasExplicitChoice = parsed.explicitChoiceSaved === true;
      this.settings = {
        strictWakeOnly: normalizeStrictWakeOnly(parsed.strictWakeOnly),
        idleStopMinutes: normalizeIdleStopMinutes(parsed.idleStopMinutes, this.fallbackIdleStopMinutes),
        promptPending: !hasExplicitChoice
      };
      logInfo("runtime-settings", "loaded persisted runtime resource settings", {
        filePath: this.filePath,
        strictWakeOnly: this.settings.strictWakeOnly,
        idleStopMinutes: this.settings.idleStopMinutes,
        promptPending: this.settings.promptPending
      });
    } catch (error) {
      // Missing/corrupt settings should fall back to conservative defaults.
      this.settings = {
        strictWakeOnly: DEFAULT_STRICT_WAKE_ONLY,
        idleStopMinutes: this.fallbackIdleStopMinutes,
        promptPending: true
      };
      logWarn("runtime-settings", "using default runtime resource settings", {
        filePath: this.filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    this.loaded = true;
    return this.getSettings();
  }

  getSettings(): RuntimeResourceSettings {
    return { ...this.settings };
  }

  getPolicy(): RuntimeResourcePolicy {
    return {
      strictWakeOnly: this.settings.strictWakeOnly,
      idleStopMs: this.settings.idleStopMinutes * 60_000
    };
  }

  async updateSettings(input: UpdateRuntimeResourceSettingsInput): Promise<RuntimeResourceSettings> {
    if (!this.loaded) {
      await this.initialize();
    }

    const normalized: RuntimeResourceSettings = {
      strictWakeOnly: normalizeStrictWakeOnly(input.strictWakeOnly),
      idleStopMinutes: normalizeIdleStopMinutes(input.idleStopMinutes, this.fallbackIdleStopMinutes),
      promptPending: false
    };

    const payload: PersistedRuntimeResourceSettings = {
      strictWakeOnly: normalized.strictWakeOnly,
      idleStopMinutes: normalized.idleStopMinutes,
      explicitChoiceSaved: true
    };

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf-8");

    this.settings = normalized;
    logDebug("runtime-settings", "saved runtime resource settings", {
      filePath: this.filePath,
      strictWakeOnly: normalized.strictWakeOnly,
      idleStopMinutes: normalized.idleStopMinutes
    });
    return this.getSettings();
  }
}

function normalizeStrictWakeOnly(value: unknown): boolean {
  return value === false ? false : true;
}

function normalizeIdleStopMinutes(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(MIN_IDLE_STOP_MINUTES, Math.min(MAX_IDLE_STOP_MINUTES, Math.round(numeric)));
}

function resolveFallbackIdleStopMinutesFromEnv(): number {
  const raw = process.env[IDLE_TIMEOUT_ENV_VAR];
  if (!raw) {
    return DEFAULT_IDLE_STOP_MINUTES;
  }
  const parsedMs = Number(raw.trim());
  if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
    return DEFAULT_IDLE_STOP_MINUTES;
  }
  const parsedMinutes = parsedMs / 60_000;
  return Math.max(MIN_IDLE_STOP_MINUTES, Math.min(MAX_IDLE_STOP_MINUTES, Math.round(parsedMinutes)));
}
