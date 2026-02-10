import { access, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import type { UpdateRuntimeResourceSettingsInput, VoicePreviewInput } from "../../shared/types.js";
import { registerIpcHandlers } from "./registerIpcHandlers.js";

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const powerBlockerState = vi.hoisted(() => {
  const started = new Set<number>();
  let nextId = 1;

  const start = vi.fn(() => {
    const id = nextId;
    nextId += 1;
    started.add(id);
    return id;
  });

  const stop = vi.fn((id: number) => {
    started.delete(id);
  });

  const isStarted = vi.fn((id: number) => started.has(id));

  const reset = () => {
    started.clear();
    nextId = 1;
    start.mockClear();
    stop.mockClear();
    isStarted.mockClear();
  };

  return {
    start,
    stop,
    isStarted,
    reset
  };
});

const renderJobs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const createIdMock = vi.hoisted(() => vi.fn(() => "job-123"));
const renderProjectMock = vi.hoisted(() => vi.fn(async (
  projectId: string,
  _options: unknown,
  signal: AbortSignal,
  jobId: string
) => ({
  id: jobId,
  projectId,
  state: signal.aborted ? "canceled" : "completed",
  outputMp3Path: "/tmp/output.mp3"
})));

vi.mock("../db/projectRepository.js", () => ({
  createProject: vi.fn((project) => project),
  getProject: vi.fn(() => null),
  getRenderJob: vi.fn((jobId: string) => {
    const job = renderJobs.get(jobId);
    return job ? { ...job } : null;
  }),
  updateSpeakers: vi.fn(async () => ({ id: "project-1" })),
  updateSegments: vi.fn(async () => ({ id: "project-1" })),
  upsertRenderJob: vi.fn((job: Record<string, unknown>) => {
    if (typeof job.id === "string") {
      renderJobs.set(job.id, { ...job });
    }
    return job;
  })
}));

vi.mock("../utils/id.js", () => ({
  createId: createIdMock
}));

vi.mock("../render/renderService.js", () => ({
  RenderService: class {
    renderProject(...args: Parameters<typeof renderProjectMock>) {
      return renderProjectMock(...args);
    }
  }
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => "/tmp",
    getName: () => "Hisui"
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getFocusedWindow: () => null
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }
  },
  powerSaveBlocker: {
    start: powerBlockerState.start,
    stop: powerBlockerState.stop,
    isStarted: powerBlockerState.isStarted
  },
  shell: {
    showItemInFolder: vi.fn(),
    openPath: vi.fn(async () => "")
  }
}));

function trustedEvent(): IpcMainInvokeEvent {
  return {
    sender: {
      id: 7,
      getURL: () => "http://127.0.0.1:5173/#/library"
    },
    senderFrame: {
      url: "http://127.0.0.1:5173/#/library"
    }
  } as unknown as IpcMainInvokeEvent;
}

function makeDeps(overrides?: Partial<Parameters<typeof registerIpcHandlers>[0]>) {
  return {
    audioSidecar: {
      client: {
        health: vi.fn(async () => ({ running: true, modelStatus: "ready" })),
        listVoices: vi.fn(async () => []),
        previewVoice: vi.fn(async (_input: VoicePreviewInput, outputDir: string) => {
          const wavPath = join(outputDir, "preview.wav");
          await writeFile(wavPath, Buffer.from("RIFF-preview-audio"));
          return {
            wavPath,
            engine: "test-engine"
          };
        }),
        validateTags: vi.fn(async () => ({ isValid: true, invalidTags: [], supportedTags: [] })),
        batchTts: vi.fn(async () => ({ wavPaths: [] }))
      },
      isHealthy: vi.fn(async () => true)
    } as never,
    llmPrep: {
      prepareText: vi.fn(async (text: string) => ({ originalText: text, preparedText: text, changed: false })),
      available: vi.fn(async () => true)
    } as never,
    bootstrap: {
      getStatus: vi.fn(async () => ({})),
      start: vi.fn(async () => ({}))
    } as never,
    updater: {
      getState: vi.fn(() => ({ phase: "idle", currentVersion: "0.2.0" })),
      checkForUpdates: vi.fn(async () => ({ phase: "checking", currentVersion: "0.2.0" })),
      installDownloadedUpdate: vi.fn(async () => undefined)
    } as never,
    diagnostics: {
      getSnapshot: vi.fn(async () => ({
        collectedAt: new Date().toISOString(),
        appName: "Hisui",
        appVersion: "0.2.0",
        crashDumpsPath: "/tmp",
        recentCrashDumps: [],
        appMetrics: []
      }))
    } as never,
    runtimeResourceSettings: {
      getSettings: vi.fn(() => ({
        strictWakeOnly: true,
        idleStopMinutes: 5,
        promptPending: true
      })),
      updateSettings: vi.fn(async (input: UpdateRuntimeResourceSettingsInput) => ({
        strictWakeOnly: input.strictWakeOnly,
        idleStopMinutes: input.idleStopMinutes,
        promptPending: false
      })),
      getPolicy: vi.fn(() => ({
        strictWakeOnly: true,
        idleStopMs: 300_000
      }))
    } as never,
    assertTrustedIpcSender: vi.fn(),
    ...overrides
  };
}

describe("registerIpcHandlers", () => {
  beforeEach(() => {
    ipcHandlers.clear();
    renderJobs.clear();
    powerBlockerState.reset();
    createIdMock.mockClear();
    renderProjectMock.mockClear();
  });

  it("returns base64 preview audio and removes temp output directory", async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const handler = ipcHandlers.get(IPC_CHANNELS.previewVoice);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:preview-voice handler to be registered");
    }

    const result = await handler(trustedEvent(), {
      text: "  Preview this voice.  ",
      voiceId: "af_heart",
      model: "kokoro",
      speed: 1
    } satisfies VoicePreviewInput) as {
      mimeType: string;
      audioBase64: string;
      engine?: string;
    };

    expect(result.mimeType).toBe("audio/wav");
    expect(result.audioBase64.length).toBeGreaterThan(0);
    expect(result.engine).toBe("test-engine");

    const previewVoice = deps.audioSidecar.client.previewVoice as ReturnType<typeof vi.fn>;
    expect(previewVoice).toHaveBeenCalledTimes(1);
    const call = previewVoice.mock.calls[0];
    expect(call?.[0]).toEqual(expect.objectContaining({
      text: "Preview this voice.",
      voiceId: "af_heart",
      model: "kokoro",
      expressionTags: []
    }));
    const outputDir = call?.[1];
    expect(typeof outputDir).toBe("string");
    if (typeof outputDir === "string") {
      await expect(access(outputDir)).rejects.toThrow();
    }

    expect(deps.assertTrustedIpcSender).toHaveBeenCalled();
  });

  it("returns base64 for absolute readable render-audio files", async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const handler = ipcHandlers.get(IPC_CHANNELS.readAudioFile);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:read-audio-file handler to be registered");
    }

    const samplePath = join("/tmp", `hisui-render-audio-${Date.now()}.mp3`);
    await writeFile(samplePath, Buffer.from("ID3-test-output"));

    try {
      const result = await handler(trustedEvent(), samplePath) as {
        mimeType: string;
        audioBase64: string;
      };

      expect(result.mimeType).toBe("audio/mpeg");
      expect(result.audioBase64.length).toBeGreaterThan(0);
    } finally {
      await rm(samplePath, { force: true });
    }
  });

  it("rejects relative paths when reading render-audio files", async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const handler = ipcHandlers.get(IPC_CHANNELS.readAudioFile);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:read-audio-file handler to be registered");
    }

    await expect(handler(trustedEvent(), "episode.mp3")).rejects.toThrow("expected absolute path");
  });

  it("blocks IPC handler when sender validation fails", async () => {
    const deps = makeDeps({
      assertTrustedIpcSender: vi.fn(() => {
        throw new Error("Blocked IPC request from untrusted sender.");
      })
    });

    registerIpcHandlers(deps);

    const handler = ipcHandlers.get(IPC_CHANNELS.listVoices);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:list-voices handler to be registered");
    }

    await expect(handler(trustedEvent())).rejects.toThrow("Blocked IPC request from untrusted sender.");
  });

  it("starts and releases power-save blocker around render jobs", async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const renderHandler = ipcHandlers.get(IPC_CHANNELS.renderProject);
    expect(renderHandler).toBeDefined();
    if (!renderHandler) {
      throw new Error("Expected app:render-project handler to be registered");
    }

    const queued = await renderHandler(trustedEvent(), "project-1", {
      outputDir: "/tmp",
      outputFileName: "episode",
      speed: 1,
      enableLlmPrep: false
    });

    expect(queued).toEqual(expect.objectContaining({
      id: "job-123",
      state: "queued"
    }));
    expect(powerBlockerState.start).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(powerBlockerState.stop).toHaveBeenCalledTimes(1);
  });

  it("returns runtime resource settings", async () => {
    const deps = makeDeps();
    registerIpcHandlers(deps);

    const handler = ipcHandlers.get(IPC_CHANNELS.getRuntimeResourceSettings);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:get-runtime-resource-settings handler to be registered");
    }

    const result = await handler(trustedEvent()) as {
      strictWakeOnly: boolean;
      idleStopMinutes: number;
      promptPending: boolean;
    };
    expect(result).toEqual({
      strictWakeOnly: true,
      idleStopMinutes: 5,
      promptPending: true
    });
  });

  it("updates runtime resource settings and applies sidecar policy", async () => {
    const setRuntimeResourcePolicy = vi.fn();
    const deps = makeDeps({
      audioSidecar: {
        client: {
          health: vi.fn(async () => ({ running: true, modelStatus: "ready" })),
          listVoices: vi.fn(async () => []),
          previewVoice: vi.fn(async () => ({ wavPath: "/tmp/preview.wav" })),
          validateTags: vi.fn(async () => ({ isValid: true, invalidTags: [], supportedTags: [] })),
          batchTts: vi.fn(async () => ({ wavPaths: [] }))
        },
        isHealthy: vi.fn(async () => true),
        setRuntimeResourcePolicy
      } as never
    });
    registerIpcHandlers(deps);

    const handler = ipcHandlers.get(IPC_CHANNELS.updateRuntimeResourceSettings);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:update-runtime-resource-settings handler to be registered");
    }

    const result = await handler(trustedEvent(), {
      strictWakeOnly: false,
      idleStopMinutes: 12
    } satisfies UpdateRuntimeResourceSettingsInput) as {
      strictWakeOnly: boolean;
      idleStopMinutes: number;
      promptPending: boolean;
    };

    expect(result).toEqual({
      strictWakeOnly: false,
      idleStopMinutes: 12,
      promptPending: false
    });
    expect(deps.runtimeResourceSettings.updateSettings).toHaveBeenCalledTimes(1);
    expect(deps.runtimeResourceSettings.getPolicy).toHaveBeenCalledTimes(1);
    expect(setRuntimeResourcePolicy).toHaveBeenCalledWith({
      strictWakeOnly: true,
      idleStopMs: 300_000
    });
  });
});
