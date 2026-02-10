import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  userDataPath: "",
  modelsDir: ""
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => testState.userDataPath
  }
}));

vi.mock("../utils/paths.js", () => ({
  getModelsDir: () => testState.modelsDir
}));

const execFileAsync = promisify(execFile);

describe("BootstrapManager", () => {
  let userDataPath = "";
  let modelsDir = "";

  beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), "local-podcast-userdata-"));
    modelsDir = await mkdtemp(join(tmpdir(), "local-podcast-models-"));
    testState.userDataPath = userDataPath;
    testState.modelsDir = modelsDir;

    await mkdir(join(modelsDir, "kokoro", "voices"), { recursive: true });
    await mkdir(join(modelsDir, "kokoro-node-cache"), { recursive: true });
    await mkdir(join(modelsDir, "chatterbox"), { recursive: true });
    await mkdir(join(modelsDir, ".hf-cache"), { recursive: true });
    await writeFile(join(modelsDir, "kokoro", "voices", "af_heart.safetensors"), Buffer.from("voice"));
    await writeFile(join(modelsDir, "chatterbox", "model.pt"), Buffer.from("model"));
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
    await rm(modelsDir, { recursive: true, force: true });
  });

  it("runs async setup and persists runtime config", async () => {
    const sidecar = {
      start: vi.fn(async () => undefined),
      setDefaultRuntimeConfig: vi.fn()
    };

    const { BootstrapManager } = await import("./bootstrapManager.js");
    const manager = new BootstrapManager(sidecar as never);

    const initial = await manager.getStatus();
    expect(initial.phase).toBe("awaiting-input");
    expect(initial.firstRun).toBe(true);
    expect(initial.installPath).toContain("offline-runtime");
    expect(initial.modelPacks.some((pack) => pack.id === "kokoro-core" && pack.required)).toBe(true);

    const runtimePath = join(userDataPath, "runtime-target");
    const startStatus = await manager.start({
      installPath: runtimePath,
      kokoroBackend: "node-first",
      selectedPackIds: ["kokoro-core"]
    });
    expect(startStatus.phase).toBe("running");

    const ready = await waitForReady(manager);
    expect(ready.phase).toBe("ready");
    expect(ready.firstRun).toBe(false);
    expect(ready.percent).toBe(100);

    expect(sidecar.start).toHaveBeenCalledWith({
      modelsDir: join(runtimePath, "models"),
      kokoroBackend: "node-first",
      runtimeMode: "node-core"
    });

    const copiedVoice = await readFile(join(runtimePath, "models", "kokoro", "voices", "af_heart.safetensors"));
    expect(copiedVoice.toString("utf-8")).toBe("voice");
    expect(ready.modelPacks.find((pack) => pack.id === "kokoro-core")?.state).toBe("installed");

    const secondManager = new BootstrapManager({
      start: vi.fn(async () => undefined),
      setDefaultRuntimeConfig: vi.fn()
    } as never);
    const resumed = await secondManager.getStatus();
    expect(resumed.phase).toBe("awaiting-input");
    expect(resumed.firstRun).toBe(false);
    expect(resumed.installPath).toBe(runtimePath);
    expect(resumed.kokoroBackend).toBe("node-first");
  });

  it("downloads selected model pack over HTTP and installs locally", async () => {
    const remoteRoot = await mkdtemp(join(tmpdir(), "local-podcast-remote-pack-"));
    const archivePath = join(remoteRoot, "kokoro-pack.tar.gz");
    const archiveSourceRoot = join(remoteRoot, "archive-source");
    await mkdir(join(archiveSourceRoot, "models", "kokoro", "voices"), { recursive: true });
    await mkdir(join(archiveSourceRoot, "models", "kokoro-node-cache"), { recursive: true });
    await writeFile(join(archiveSourceRoot, "models", "kokoro", "voices", "af_heart.safetensors"), Buffer.from("remote-voice"));

    await execFileAsync("tar", ["-czf", archivePath, "-C", archiveSourceRoot, "."]);
    process.env.LOCAL_PODCAST_MODEL_URL_KOKORO_PACK = "https://example.invalid/kokoro-pack.tar.gz";
    const archiveBytes = await readFile(archivePath);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input.url);
      if (url !== process.env.LOCAL_PODCAST_MODEL_URL_KOKORO_PACK) {
        return new Response("not-found", { status: 404 });
      }
      return new Response(archiveBytes, {
        status: 200,
        headers: {
          "content-type": "application/gzip",
          "content-length": String(archiveBytes.byteLength)
        }
      });
    });

    try {
      const sidecar = {
        start: vi.fn(async () => undefined),
        setDefaultRuntimeConfig: vi.fn()
      };
      const { BootstrapManager } = await import("./bootstrapManager.js");
      const manager = new BootstrapManager(sidecar as never);
      const runtimePath = join(userDataPath, "runtime-remote");

      await manager.start({
        installPath: runtimePath,
        kokoroBackend: "auto",
        selectedPackIds: ["kokoro-core"]
      });

      const ready = await waitForReady(manager);
      expect(ready.phase).toBe("ready");
      expect(ready.modelPacks.find((pack) => pack.id === "kokoro-core")?.source).toBe("remote");

      const installedVoice = await readFile(join(runtimePath, "models", "kokoro", "voices", "af_heart.safetensors"));
      expect(installedVoice.toString("utf-8")).toBe("remote-voice");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.LOCAL_PODCAST_MODEL_URL_KOKORO_PACK;
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });

  it("starts expressive runtime mode when optional chatterbox pack is selected", async () => {
    const sidecar = {
      start: vi.fn(async () => undefined),
      setDefaultRuntimeConfig: vi.fn()
    };

    const { BootstrapManager } = await import("./bootstrapManager.js");
    const manager = new BootstrapManager(sidecar as never);
    const runtimePath = join(userDataPath, "runtime-expressive");

    await manager.start({
      installPath: runtimePath,
      kokoroBackend: "auto",
      selectedPackIds: ["kokoro-core", "chatterbox-expressive"]
    });

    const ready = await waitForReady(manager);
    expect(ready.phase).toBe("ready");
    expect(sidecar.start).toHaveBeenCalledWith({
      modelsDir: join(runtimePath, "models"),
      kokoroBackend: "auto",
      runtimeMode: "python-expressive"
    });
  });
});

async function waitForReady(
  manager: {
    getStatus: () => Promise<{
      phase: string;
      error?: string;
      firstRun?: boolean;
      percent?: number;
      modelPacks: Array<{ id: string; state: string; source?: string }>;
    }>;
  }
): Promise<{ phase: string; error?: string; firstRun?: boolean; percent?: number; modelPacks: Array<{ id: string; state: string; source?: string }> }> {
  let lastStatus: { phase: string; error?: string; firstRun?: boolean; percent?: number; modelPacks: Array<{ id: string; state: string; source?: string }> } | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await manager.getStatus();
    lastStatus = status;
    if (status.phase === "ready") {
      return status;
    }
    if (status.phase === "error") {
      throw new Error(status.error ?? "bootstrap failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  throw new Error(`bootstrap did not reach ready state in time: ${JSON.stringify(lastStatus)}`);
}
