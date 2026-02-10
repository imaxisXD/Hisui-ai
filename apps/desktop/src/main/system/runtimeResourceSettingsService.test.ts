import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("RuntimeResourceSettingsService", () => {
  let userDataPath = "";

  beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), "local-podcast-runtime-settings-"));
    testState.userDataPath = userDataPath;
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("returns conservative defaults when settings file is missing", async () => {
    const service = new RuntimeResourceSettingsService();
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

  it("falls back to defaults when settings file is corrupt", async () => {
    await writeFile(join(userDataPath, "runtime-resource-settings.json"), "{not-json", "utf-8");

    const service = new RuntimeResourceSettingsService();
    const settings = await service.initialize();

    expect(settings).toEqual({
      strictWakeOnly: true,
      idleStopMinutes: 5,
      promptPending: true
    });
  });

  it("clamps values and marks prompt as resolved after save", async () => {
    const service = new RuntimeResourceSettingsService();
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

    const raw = await readFile(join(userDataPath, "runtime-resource-settings.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 30,
      explicitChoiceSaved: true
    });
  });

  it("restores saved settings across service instances", async () => {
    const first = new RuntimeResourceSettingsService();
    await first.initialize();
    await first.updateSettings({
      strictWakeOnly: true,
      idleStopMinutes: 1
    });

    const second = new RuntimeResourceSettingsService();
    const restored = await second.initialize();
    expect(restored).toEqual({
      strictWakeOnly: true,
      idleStopMinutes: 1,
      promptPending: false
    });
  });

  it("uses env idle timeout fallback only before first explicit save", async () => {
    vi.stubEnv("LOCAL_PODCAST_AUDIO_IDLE_MS", String(10 * 60_000));

    const beforeSave = new RuntimeResourceSettingsService();
    const initial = await beforeSave.initialize();
    expect(initial.idleStopMinutes).toBe(10);

    await beforeSave.updateSettings({
      strictWakeOnly: false,
      idleStopMinutes: 3
    });

    const afterSave = new RuntimeResourceSettingsService();
    const restored = await afterSave.initialize();
    expect(restored.idleStopMinutes).toBe(3);
    expect(restored.promptPending).toBe(false);
  });

  it("ignores legacy kokoroAccelerationMode values and removes them on next save", async () => {
    await writeFile(join(userDataPath, "runtime-resource-settings.json"), JSON.stringify({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      kokoroAccelerationMode: "webgpu",
      explicitChoiceSaved: true
    }, null, 2), "utf-8");

    const service = new RuntimeResourceSettingsService();
    const loaded = await service.initialize();
    expect(loaded).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 8,
      promptPending: false
    });

    await service.updateSettings({
      strictWakeOnly: true,
      idleStopMinutes: 6
    });

    const raw = await readFile(join(userDataPath, "runtime-resource-settings.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({
      strictWakeOnly: true,
      idleStopMinutes: 6,
      explicitChoiceSaved: true
    });
  });
});
