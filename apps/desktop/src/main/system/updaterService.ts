import { app } from "electron";
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from "electron-updater";
import type { UpdateState } from "../../shared/types.js";
import { nowIso } from "../utils/time.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/logging.js";

const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const { autoUpdater } = electronUpdater as { autoUpdater: AppUpdater };

function normalizeReleaseDate(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function baseState(phase: UpdateState["phase"], message?: string): UpdateState {
  return {
    phase,
    currentVersion: app.getVersion(),
    message
  };
}

export class UpdaterService {
  private state: UpdateState = app.isPackaged
    ? baseState("idle", "Ready to check for updates.")
    : baseState("disabled", "Auto-updates are disabled in development builds.");
  private initialized = false;
  private checkIntervalMs: number;
  private intervalHandle: NodeJS.Timeout | null = null;
  private checkPromise: Promise<UpdateState> | null = null;

  constructor(checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS) {
    this.checkIntervalMs = checkIntervalMs;
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (!app.isPackaged) {
      logInfo("updater", "auto-updates disabled because app is not packaged");
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", this.handleCheckingForUpdate);
    autoUpdater.on("update-available", this.handleUpdateAvailable);
    autoUpdater.on("download-progress", this.handleDownloadProgress);
    autoUpdater.on("update-downloaded", this.handleUpdateDownloaded);
    autoUpdater.on("update-not-available", this.handleUpdateNotAvailable);
    autoUpdater.on("error", this.handleError);

    logInfo("updater", "initialized updater service", { checkIntervalMs: this.checkIntervalMs });

    void this.checkForUpdates();
    this.intervalHandle = setInterval(() => {
      void this.checkForUpdates();
    }, this.checkIntervalMs);
  }

  dispose(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    autoUpdater.removeListener("checking-for-update", this.handleCheckingForUpdate);
    autoUpdater.removeListener("update-available", this.handleUpdateAvailable);
    autoUpdater.removeListener("download-progress", this.handleDownloadProgress);
    autoUpdater.removeListener("update-downloaded", this.handleUpdateDownloaded);
    autoUpdater.removeListener("update-not-available", this.handleUpdateNotAvailable);
    autoUpdater.removeListener("error", this.handleError);
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!app.isPackaged) {
      return this.getState();
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    this.checkPromise = (async () => {
      this.updateState({
        phase: "checking",
        message: "Checking for updates...",
        lastCheckedAt: nowIso(),
        availableVersion: undefined,
        releaseDate: undefined,
        downloadPercent: undefined
      });

      try {
        await autoUpdater.checkForUpdates();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError("updater", "check for updates failed", { message, error });
        this.updateState({
          phase: "error",
          message,
          lastCheckedAt: nowIso()
        });
      }

      return this.getState();
    })();

    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  async installDownloadedUpdate(): Promise<void> {
    if (!app.isPackaged) {
      throw new Error("Cannot install updates in development builds.");
    }
    if (this.state.phase !== "downloaded") {
      throw new Error("No downloaded update is ready to install.");
    }

    this.updateState({
      phase: "idle",
      message: "Installing update and restarting..."
    });
    logInfo("updater", "installing downloaded update");
    autoUpdater.quitAndInstall();
  }

  private updateState(patch: Partial<UpdateState>): void {
    this.state = {
      ...this.state,
      currentVersion: app.getVersion(),
      ...patch
    };
    logDebug("updater", "state updated", this.state);
  }

  private readonly handleCheckingForUpdate = (): void => {
    this.updateState({
      phase: "checking",
      message: "Checking for updates...",
      lastCheckedAt: nowIso()
    });
  };

  private readonly handleUpdateAvailable = (info: UpdateInfo): void => {
    logInfo("updater", "update available", { version: info.version });
    this.updateState({
      phase: "available",
      availableVersion: info.version,
      releaseDate: normalizeReleaseDate(info.releaseDate),
      message: "Update available. Downloading...",
      lastCheckedAt: nowIso()
    });
  };

  private readonly handleDownloadProgress = (progress: ProgressInfo): void => {
    this.updateState({
      phase: "downloading",
      downloadPercent: Number.isFinite(progress.percent) ? Number(progress.percent.toFixed(1)) : undefined,
      message: `Downloading update (${Math.round(progress.percent)}%)...`
    });
  };

  private readonly handleUpdateDownloaded = (event: UpdateDownloadedEvent): void => {
    logInfo("updater", "update downloaded", {
      version: event.version,
      releaseDate: event.releaseDate
    });
    this.updateState({
      phase: "downloaded",
      availableVersion: event.version,
      releaseDate: normalizeReleaseDate(event.releaseDate),
      downloadPercent: 100,
      message: "Update downloaded. Restart to install."
    });
  };

  private readonly handleUpdateNotAvailable = (info: UpdateInfo): void => {
    logInfo("updater", "no update available", { currentVersion: info.version });
    this.updateState({
      phase: "not-available",
      availableVersion: undefined,
      releaseDate: normalizeReleaseDate(info.releaseDate),
      downloadPercent: undefined,
      message: "You are on the latest version.",
      lastCheckedAt: nowIso()
    });
  };

  private readonly handleError = (error: Error): void => {
    logWarn("updater", "auto-updater error", { message: error.message, error });
    this.updateState({
      phase: "error",
      message: error.message,
      lastCheckedAt: nowIso()
    });
  };
}
