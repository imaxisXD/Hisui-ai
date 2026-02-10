import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeResourceSettingsService } from "./runtimeResourceSettingsService.js";

const testState = vi.hoisted(() => ({
  userDataPath: ""
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => testState.userDataPath
  }
}));

interface InMemorySettingsStore {
  get: <T>(key: string) => T | null;
  set: <T>(key: string, value: T) => void;
  has: (key: string) => boolean;
}

function createInMemorySettingsStore(): InMemorySettingsStore {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string) {
      return (store.get(key) as T | undefined) ?? null;
    },
    set<T>(key: string, value: T) {
      store.set(key, value);
    },
    has(key: string) {
      return store.has(key);
    }
  };
}

describe("RuntimeResourceSettingsService", () => {
  let userDataPath = "";
  let legacyFilePath = "";
  let settingsStore: InMemorySettingsStore;

  beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), "local-podcast-runtime-settings-"));
    legacyFilePath = join(userDataPath, "runtime-resource-settings.json");
    testState.userDataPath = userDataPath;
    settingsStore = createInMemorySettingsStore();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(userDataPath, { recursive: true, force: true });
  });

  it("returns conservative defaults when no sqlite value or legacy file exists", async () => {
    const service = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      getUserDataPath: () => userDataPath
    });
    const settings = await service.initialize();

    expect(settings).toEqual({
      strictWakeOnly: true,
      idleStopMinutes: 5,
      promptPending: true
    });
    expect(service.getPolicy()).toEqual({
      strictWakeOnly: true,
      idleStopMs: 300_000
    });
  });

  it("migrates legacy json settings into sqlite on first load", async () => {
    await writeFile(legacyFilePath, JSON.stringify({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      explicitChoiceSaved: true
    }, null, 2), "utf-8");

    const first = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      legacyFilePath,
      getUserDataPath: () => userDataPath
    });
    const migrated = await first.initialize();

    expect(migrated).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      promptPending: false
    });

    const second = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      legacyFilePath: join(userDataPath, "missing.json"),
      getUserDataPath: () => userDataPath
    });
    const restored = await second.initialize();
    expect(restored).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      promptPending: false
    });
  });

  it("clamps values and marks prompt as resolved after save", async () => {
    const service = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      getUserDataPath: () => userDataPath
    });
    await service.initialize();

    const updated = await service.updateSettings({
      strictWakeOnly: false,
      idleStopMinutes: 99
    });

    expect(updated).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 30,
      promptPending: false
    });
    expect(service.getPolicy()).toEqual({
      strictWakeOnly: false,
      idleStopMs: 1_800_000
    });
  });

  it("uses env fallback only before first explicit save", async () => {
    vi.stubEnv("LOCAL_PODCAST_AUDIO_IDLE_MS", String(10 * 60_000));

    const beforeSave = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      getUserDataPath: () => userDataPath
    });
    const initial = await beforeSave.initialize();
    expect(initial.idleStopMinutes).toBe(10);

    await beforeSave.updateSettings({
      strictWakeOnly: false,
      idleStopMinutes: 3
    });

    const afterSave = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      getUserDataPath: () => userDataPath
    });
    const restored = await afterSave.initialize();
    expect(restored.idleStopMinutes).toBe(3);
    expect(restored.promptPending).toBe(false);
  });

  it("ignores legacy kokoroAccelerationMode values during migration", async () => {
    await writeFile(legacyFilePath, JSON.stringify({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      kokoroAccelerationMode: "webgpu",
      explicitChoiceSaved: true
    }, null, 2), "utf-8");

    const service = new RuntimeResourceSettingsService({
      settingsStore: settingsStore as never,
      legacyFilePath,
      getUserDataPath: () => userDataPath
    });
    const loaded = await service.initialize();
    expect(loaded).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      promptPending: false
    });
  });
});
