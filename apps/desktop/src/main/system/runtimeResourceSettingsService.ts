import { app } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RuntimeResourceSettings,
  UpdateRuntimeResourceSettingsInput
} from "../../shared/types.js";
import { logDebug, logInfo, logWarn } from "../utils/logging.js";
import { AppSettingsStore } from "./appSettingsStore.js";

const SETTINGS_KEY = "runtime.resources.v1";
const LEGACY_SETTINGS_FILE_NAME = "runtime-resource-settings.json";
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

interface RuntimeResourceSettingsServiceOptions {
  settingsStore?: AppSettingsStore;
  legacyFilePath?: string;
  getUserDataPath?: () => string;
}

export class RuntimeResourceSettingsService {
  private loaded = false;
  private readonly fallbackIdleStopMinutes = resolveFallbackIdleStopMinutesFromEnv();
  private readonly settingsStore: AppSettingsStore;
  private readonly legacyFilePathOverride?: string;
  private readonly getUserDataPath: () => string;
  private settings: RuntimeResourceSettings = {
    strictWakeOnly: DEFAULT_STRICT_WAKE_ONLY,
    idleStopMinutes: this.fallbackIdleStopMinutes,
    promptPending: true
  };

  constructor(options: RuntimeResourceSettingsServiceOptions = {}) {
    this.settingsStore = options.settingsStore ?? new AppSettingsStore();
    this.legacyFilePathOverride = options.legacyFilePath;
    this.getUserDataPath = options.getUserDataPath ?? (() => app.getPath("userData"));
  }

  async initialize(): Promise<RuntimeResourceSettings> {
    if (this.loaded) {
      return this.getSettings();
    }

    const persisted = this.settingsStore.get<PersistedRuntimeResourceSettings>(SETTINGS_KEY);
    if (persisted) {
      const hasExplicitChoice = persisted.explicitChoiceSaved === true;
      this.settings = {
        strictWakeOnly: normalizeStrictWakeOnly(persisted.strictWakeOnly),
        idleStopMinutes: normalizeIdleStopMinutes(persisted.idleStopMinutes, this.fallbackIdleStopMinutes),
        promptPending: !hasExplicitChoice
      };
      this.loaded = true;
      logInfo("runtime-settings", "loaded runtime resource settings from sqlite", {
        strictWakeOnly: this.settings.strictWakeOnly,
        idleStopMinutes: this.settings.idleStopMinutes,
        promptPending: this.settings.promptPending
      });
      return this.getSettings();
    }

    const legacyFilePath = this.resolveLegacyFilePath();
    try {
      const raw = await readFile(legacyFilePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistedRuntimeResourceSettings;
      const hasExplicitChoice = parsed.explicitChoiceSaved === true;
      this.settings = {
        strictWakeOnly: normalizeStrictWakeOnly(parsed.strictWakeOnly),
        idleStopMinutes: normalizeIdleStopMinutes(parsed.idleStopMinutes, this.fallbackIdleStopMinutes),
        promptPending: !hasExplicitChoice
      };
      this.settingsStore.set<PersistedRuntimeResourceSettings>(SETTINGS_KEY, {
        strictWakeOnly: this.settings.strictWakeOnly,
        idleStopMinutes: this.settings.idleStopMinutes,
        explicitChoiceSaved: hasExplicitChoice
      });
      logInfo("runtime-settings", "migrated legacy runtime resource settings into sqlite", {
        legacyFilePath,
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
        legacyFilePath,
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

    this.settingsStore.set<PersistedRuntimeResourceSettings>(SETTINGS_KEY, {
      strictWakeOnly: normalized.strictWakeOnly,
      idleStopMinutes: normalized.idleStopMinutes,
      explicitChoiceSaved: true
    });

    this.settings = normalized;
    logDebug("runtime-settings", "saved runtime resource settings into sqlite", {
      strictWakeOnly: normalized.strictWakeOnly,
      idleStopMinutes: normalized.idleStopMinutes
    });
    return this.getSettings();
  }

  private resolveLegacyFilePath(): string {
    if (this.legacyFilePathOverride) {
      return this.legacyFilePathOverride;
    }
    return join(this.getUserDataPath(), LEGACY_SETTINGS_FILE_NAME);
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
