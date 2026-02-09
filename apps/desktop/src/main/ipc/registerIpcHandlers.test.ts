import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/ipc.js";
import type { VoicePreviewInput } from "../../shared/types.js";
import { registerIpcHandlers } from "./registerIpcHandlers.js";

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => "/tmp",
    getName: () => "Caster"
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
  shell: {
    showItemInFolder: vi.fn()
  }
}));

describe("registerIpcHandlers previewVoice", () => {
  beforeEach(() => {
    ipcHandlers.clear();
  });

  it("returns base64 preview audio and removes temp output directory", async () => {
    const previewVoice = vi.fn(async (_input: VoicePreviewInput, outputDir: string) => {
      const wavPath = join(outputDir, "preview.wav");
      await writeFile(wavPath, Buffer.from("RIFF-preview-audio"));
      return {
        wavPath,
        engine: "test-engine"
      };
    });

    registerIpcHandlers({
      audioSidecar: {
        client: {
          health: vi.fn(async () => ({ running: true, modelStatus: "ready" })),
          listVoices: vi.fn(async () => []),
          previewVoice,
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
      } as never
    });

    const handler = ipcHandlers.get(IPC_CHANNELS.previewVoice);
    expect(handler).toBeDefined();
    if (!handler) {
      throw new Error("Expected app:preview-voice handler to be registered");
    }

    const result = await handler({}, {
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
  });
});
