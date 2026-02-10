import type {
  AppTheme,
  UiPreferences,
  UpdateUiPreferencesInput
} from "../../shared/types.js";
import { AppSettingsStore } from "./appSettingsStore.js";

const SETTINGS_KEY = "ui.preferences.v1";
const DEFAULT_THEME: AppTheme = "hisui";
const DEFAULT_OUTPUT_FILE_NAME = "podcast-output";
const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.4;

interface UiPreferencesServiceOptions {
  settingsStore?: AppSettingsStore;
}

export class UiPreferencesService {
  private readonly settingsStore: AppSettingsStore;
  private cached: UiPreferences | null = null;

  constructor(options: UiPreferencesServiceOptions = {}) {
    this.settingsStore = options.settingsStore ?? new AppSettingsStore();
  }

  getPreferences(): UiPreferences {
    if (!this.cached) {
      const persisted = this.settingsStore.get<Partial<UiPreferences>>(SETTINGS_KEY);
      this.cached = normalizeUiPreferences(persisted ?? {});
    }
    return { ...this.cached };
  }

  updatePreferences(input: UpdateUiPreferencesInput): UiPreferences {
    const current = this.getPreferences();
    const next = normalizeUiPreferences({
      ...current,
      ...input,
      selectedProjectHistoryId: input.selectedProjectHistoryId === undefined
        ? current.selectedProjectHistoryId
        : input.selectedProjectHistoryId
    });
    this.cached = next;
    this.settingsStore.set<UiPreferences>(SETTINGS_KEY, next);
    return { ...next };
  }
}

function normalizeUiPreferences(input: {
  theme?: unknown;
  outputDir?: unknown;
  outputFileName?: unknown;
  speed?: unknown;
  enableLlmPrep?: unknown;
  selectedProjectHistoryId?: unknown;
}): UiPreferences {
  return {
    theme: normalizeTheme(input.theme),
    outputDir: normalizeString(input.outputDir),
    outputFileName: normalizeOutputFileName(input.outputFileName),
    speed: normalizeSpeed(input.speed),
    enableLlmPrep: input.enableLlmPrep === true,
    selectedProjectHistoryId: normalizeOptionalString(input.selectedProjectHistoryId)
  };
}

function normalizeTheme(value: unknown): AppTheme {
  return value === "folio" ? "folio" : DEFAULT_THEME;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeOutputFileName(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_OUTPUT_FILE_NAME;
  }
  const normalized = value.trim();
  return normalized || DEFAULT_OUTPUT_FILE_NAME;
}

function normalizeSpeed(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SPEED;
  }
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, Number(numeric.toFixed(2))));
}
