import { describe, expect, it, vi } from "vitest";
import type { AudioRuntimeClient } from "./audioClient.js";
import { AudioSidecarManager } from "./audioSidecarManager.js";

vi.mock("electron", () => ({
  app: {
    isPackaged: false
  }
}));

function createRuntimeClient(
  overrides: Partial<AudioRuntimeClient> & { dispose?: () => Promise<void> | void } = {}
): AudioRuntimeClient & { dispose?: () => Promise<void> | void } {
  return {
    getCapabilities: async () => ({
      runtime: "unknown",
      supportsKokoroDeviceOverride: false,
      supportedKokoroDevices: []
    }),
    health: async () => ({ running: true, modelStatus: "ready" }),
    listVoices: async () => [],
    previewVoice: async () => ({ wavPath: "/tmp/voice.wav" }),
    validateTags: async () => ({ isValid: true, invalidTags: [], supportedTags: [] }),
    batchTts: async () => ({ wavPaths: [] }),
    ...overrides
  };
}

describe("AudioSidecarManager runtime lifecycle", () => {
  it("disposes active node runtime on stop", async () => {
    const manager = new AudioSidecarManager();
    const disposeSpy = vi.fn(async () => undefined);
    const runtimeClient = createRuntimeClient({ dispose: disposeSpy });

    (manager as unknown as {
      activeRuntimeClient: AudioRuntimeClient & { dispose?: () => Promise<void> | void };
      activeConfig: unknown;
    }).activeRuntimeClient = runtimeClient;
    (manager as unknown as { activeConfig: unknown }).activeConfig = {
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    };

    await manager.stop();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect((manager as unknown as { activeRuntimeClient: unknown; pythonClient: unknown }).activeRuntimeClient).toBe(
      (manager as unknown as { activeRuntimeClient: unknown; pythonClient: unknown }).pythonClient
    );
    expect((manager as unknown as { activeConfig: unknown }).activeConfig).toBeNull();
  });

  it("skips node runtime restart for unchanged active config", async () => {
    const manager = new AudioSidecarManager();
    const ensureNodeCacheReadySpy = vi.spyOn(manager as any, "ensureNodeCacheReady");
    const stopSpy = vi.spyOn(manager, "stop");

    (manager as unknown as {
      activeRuntimeClient: AudioRuntimeClient;
      activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
    }).activeRuntimeClient = createRuntimeClient();
    (manager as unknown as {
      activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
    }).activeConfig = {
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    };

    await manager.start({
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    });

    expect(stopSpy).not.toHaveBeenCalled();
    expect(ensureNodeCacheReadySpy).not.toHaveBeenCalled();
  });

  it("stops node runtime after idle timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("LOCAL_PODCAST_AUDIO_IDLE_MS", "20");
    try {
      const manager = new AudioSidecarManager();
      const disposeSpy = vi.fn(async () => undefined);
      const runtimeClient = createRuntimeClient({ dispose: disposeSpy });

      (manager as unknown as {
        activeRuntimeClient: AudioRuntimeClient & { dispose?: () => Promise<void> | void };
        activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
      }).activeRuntimeClient = runtimeClient;
      (manager as unknown as {
        activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
      }).activeConfig = {
        modelsDir: "/tmp/models",
        kokoroBackend: "auto",
        runtimeMode: "node-core"
      };

      await manager.client.listVoices();
      await vi.advanceTimersByTimeAsync(25);

      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect((manager as unknown as { activeConfig: unknown }).activeConfig).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("starts runtime on demand when sidecar is idle", async () => {
    const manager = new AudioSidecarManager();
    const startSpy = vi.spyOn(manager, "start").mockImplementation(async () => {
      const runtimeClient = createRuntimeClient({
        previewVoice: async () => ({ wavPath: "/tmp/voice.wav" })
      });
      (manager as unknown as {
        activeRuntimeClient: AudioRuntimeClient;
        activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
      }).activeRuntimeClient = runtimeClient;
      (manager as unknown as {
        activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
      }).activeConfig = {
          modelsDir: "/tmp/models",
          kokoroBackend: "auto",
          runtimeMode: "node-core"
        };
    });
    manager.setDefaultRuntimeConfig({
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    });

    const preview = await manager.client.previewVoice({
      text: "preview text",
      voiceId: "af_heart",
      model: "kokoro",
      speed: 1
    }, "/tmp");

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(preview.wavPath).toBe("/tmp/voice.wav");
  });

  it("does not wake runtime for listVoices in strict mode", async () => {
    const manager = new AudioSidecarManager();
    const startSpy = vi.spyOn(manager, "start");
    manager.setDefaultRuntimeConfig({
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    });

    const voices = await manager.client.listVoices();

    expect(startSpy).not.toHaveBeenCalled();
    expect(voices.length).toBeGreaterThan(0);
  });

  it("does not wake runtime for validateTags in strict mode", async () => {
    const manager = new AudioSidecarManager();
    const startSpy = vi.spyOn(manager, "start");
    manager.setDefaultRuntimeConfig({
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    });

    const result = await manager.client.validateTags("Hello [unknown]");

    expect(startSpy).not.toHaveBeenCalled();
    expect(result.isValid).toBe(false);
    expect(result.invalidTags).toEqual(["unknown"]);
  });

  it("allows listVoices to wake runtime when strict mode is disabled", async () => {
    const manager = new AudioSidecarManager();
    manager.setRuntimeResourcePolicy({
      strictWakeOnly: false,
      idleStopMs: 300_000
    });
    manager.setDefaultRuntimeConfig({
      modelsDir: "/tmp/models",
      kokoroBackend: "auto",
      runtimeMode: "node-core"
    });
    const startSpy = vi.spyOn(manager, "start").mockImplementation(async () => {
      const runtimeClient = createRuntimeClient({
        listVoices: async () => [{ id: "af_heart", model: "kokoro", label: "Kokoro Heart", description: "voice" }]
      });
      (manager as unknown as {
        activeRuntimeClient: AudioRuntimeClient;
        activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
      }).activeRuntimeClient = runtimeClient;
      (manager as unknown as {
        activeConfig: { modelsDir: string; kokoroBackend: "auto"; runtimeMode: "node-core" };
      }).activeConfig = {
        modelsDir: "/tmp/models",
        kokoroBackend: "auto",
        runtimeMode: "node-core"
      };
    });

    const voices = await manager.client.listVoices();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(voices).toHaveLength(1);
  });
});
