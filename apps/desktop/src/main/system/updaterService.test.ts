import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import { UpdaterService } from "./updaterService.js";

const mockedApp = vi.hoisted(() => ({
  isPackaged: true,
  getVersion: () => "0.2.0"
}));

const autoUpdaterState = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const on = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)?.add(callback);
    return autoUpdater;
  });

  const removeListener = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
    listeners.get(event)?.delete(callback);
    return autoUpdater;
  });

  const checkForUpdates = vi.fn(async () => undefined);
  const quitAndInstall = vi.fn();

  const emit = (event: string, ...args: unknown[]) => {
    for (const callback of listeners.get(event) ?? []) {
      callback(...args);
    }
  };

  const reset = () => {
    listeners.clear();
    on.mockClear();
    removeListener.mockClear();
    checkForUpdates.mockClear();
    quitAndInstall.mockClear();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  };

  const autoUpdater = {
    on,
    removeListener,
    checkForUpdates,
    quitAndInstall,
    autoDownload: true,
    autoInstallOnAppQuit: true
  };

  return {
    autoUpdater,
    checkForUpdates,
    quitAndInstall,
    emit,
    reset
  };
});

vi.mock("electron", () => ({
  app: mockedApp
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: autoUpdaterState.autoUpdater
  },
  autoUpdater: autoUpdaterState.autoUpdater
}));

describe("UpdaterService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedApp.isPackaged = true;
    autoUpdaterState.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables updater state in development mode", () => {
    mockedApp.isPackaged = false;
    const service = new UpdaterService(1000);

    service.initialize();

    expect(service.getState()).toEqual(expect.objectContaining({
      phase: "disabled",
      currentVersion: "0.2.0"
    }));
    expect(autoUpdaterState.checkForUpdates).not.toHaveBeenCalled();

    service.dispose();
  });

  it("tracks updater lifecycle transitions", async () => {
    const service = new UpdaterService(1000);
    service.initialize();

    expect(autoUpdaterState.checkForUpdates).toHaveBeenCalledTimes(1);

    autoUpdaterState.emit("checking-for-update");
    expect(service.getState().phase).toBe("checking");

    autoUpdaterState.emit("update-available", {
      version: "0.3.0",
      releaseDate: "2026-02-01T00:00:00.000Z"
    } as UpdateInfo);
    expect(service.getState()).toEqual(expect.objectContaining({
      phase: "available",
      availableVersion: "0.3.0"
    }));

    autoUpdaterState.emit("download-progress", {
      percent: 42.2
    } as ProgressInfo);
    expect(service.getState()).toEqual(expect.objectContaining({
      phase: "downloading",
      downloadPercent: 42.2
    }));

    autoUpdaterState.emit("update-downloaded", {
      version: "0.3.0",
      releaseDate: "2026-02-01T00:00:00.000Z"
    } as UpdateDownloadedEvent);
    expect(service.getState()).toEqual(expect.objectContaining({
      phase: "downloaded",
      availableVersion: "0.3.0",
      downloadPercent: 100
    }));

    await service.installDownloadedUpdate();
    expect(autoUpdaterState.quitAndInstall).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it("moves to error state when checkForUpdates throws", async () => {
    autoUpdaterState.checkForUpdates.mockRejectedValueOnce(new Error("network failure"));
    const service = new UpdaterService(1000);
    service.initialize();

    await service.checkForUpdates();

    expect(service.getState()).toEqual(expect.objectContaining({
      phase: "error",
      message: "network failure"
    }));

    service.dispose();
  });
});
