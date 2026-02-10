import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TtsSegmentRequest } from "./audioClient.js";

class MockUtilityProcess extends EventEmitter {
  pid: number | undefined = 4242;
  stdout: NodeJS.ReadableStream | null = null;
  stderr: NodeJS.ReadableStream | null = null;
  postedMessages: unknown[] = [];

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  kill(): boolean {
    this.pid = undefined;
    this.emit("exit", 0);
    return true;
  }
}

interface MockState {
  children: MockUtilityProcess[];
  forkCalls: Array<{ modulePath: string; args: string[] | undefined; options: unknown }>;
}

async function setupClient(): Promise<{
  client: import("./nodeKokoroClient.js").NodeKokoroClient;
  state: MockState;
}> {
  vi.resetModules();
  const state: MockState = {
    children: [],
    forkCalls: []
  };

  vi.doMock("electron", () => ({
    app: {
      isPackaged: false
    },
    utilityProcess: {
      fork: vi.fn((modulePath: string, args?: string[], options?: unknown) => {
        state.forkCalls.push({ modulePath, args, options });
        const child = new MockUtilityProcess();
        state.children.push(child);
        return child;
      })
    }
  }));

  const { NodeKokoroClient } = await import("./nodeKokoroClient.js");
  return {
    client: new NodeKokoroClient("/tmp/local-podcast-models"),
    state
  };
}

function getFirstPostedMessage(child: MockUtilityProcess): Record<string, unknown> {
  const message = child.postedMessages[0];
  if (!message || typeof message !== "object") {
    throw new Error("Expected utility request message");
  }
  return message as Record<string, unknown>;
}

describe("NodeKokoroClient utility process bridge", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("sends health request and resolves response", async () => {
    const { client, state } = await setupClient();
    const healthPromise = client.health();

    await vi.waitFor(() => {
      expect(state.children).toHaveLength(1);
    });
    const child = state.children[0];
    const request = getFirstPostedMessage(child!);
    expect(request.kind).toBe("request");
    expect(request.action).toBe("health");
    expect(request.payload).toEqual({});

    child!.emit("message", {
      kind: "response",
      id: request.id,
      action: "health",
      ok: true,
      result: {
        running: true,
        modelStatus: "node_core_ready"
      }
    });

    await expect(healthPromise).resolves.toEqual({
      running: true,
      modelStatus: "node_core_ready"
    });
  });

  it("forwards batch progress and resolves final response", async () => {
    const { client, state } = await setupClient();
    const progressSpy = vi.fn();
    const segments: TtsSegmentRequest[] = [{
      id: "seg-1",
      text: "hello world",
      voiceId: "af_heart",
      model: "kokoro",
      speed: 1,
      expressionTags: []
    }];

    const batchPromise = client.batchTts(
      segments,
      "/tmp/out",
      progressSpy,
      { kokoroNodeDevice: "cpu" }
    );

    await vi.waitFor(() => {
      expect(state.children).toHaveLength(1);
    });
    const child = state.children[0];
    const request = getFirstPostedMessage(child!);
    expect(request.action).toBe("batchTts");
    expect(request.payload).toMatchObject({
      outputDir: "/tmp/out",
      runtimeOptions: { kokoroNodeDevice: "cpu" }
    });

    child!.emit("message", {
      kind: "progress",
      id: request.id,
      action: "batchTts",
      progress: {
        completedSegments: 1,
        totalSegments: 1
      }
    });

    child!.emit("message", {
      kind: "response",
      id: request.id,
      action: "batchTts",
      ok: true,
      result: {
        wavPaths: ["/tmp/out/seg-1.wav"]
      }
    });

    await expect(batchPromise).resolves.toEqual({
      wavPaths: ["/tmp/out/seg-1.wav"]
    });
    expect(progressSpy).toHaveBeenCalledWith({
      completedSegments: 1,
      totalSegments: 1
    });
  });

  it("refreshes batch timeout when progress updates are received", async () => {
    vi.useFakeTimers();
    const { client, state } = await setupClient();
    const segments: TtsSegmentRequest[] = [{
      id: "seg-1",
      text: "hello world",
      voiceId: "af_heart",
      model: "kokoro",
      speed: 1,
      expressionTags: []
    }];

    const batchPromise = client.batchTts(segments, "/tmp/out", vi.fn(), { kokoroNodeDevice: "cpu" });

    await vi.waitFor(() => {
      expect(state.children).toHaveLength(1);
    });
    const child = state.children[0];
    const request = getFirstPostedMessage(child!);

    vi.advanceTimersByTime((25 * 60_000) - 1_000);
    child!.emit("message", {
      kind: "progress",
      id: request.id,
      action: "batchTts",
      progress: {
        completedSegments: 1,
        totalSegments: 2
      }
    });
    vi.advanceTimersByTime((25 * 60_000) - 1_000);

    child!.emit("message", {
      kind: "response",
      id: request.id,
      action: "batchTts",
      ok: true,
      result: {
        wavPaths: ["/tmp/out/seg-1.wav"]
      }
    });

    await expect(batchPromise).resolves.toEqual({
      wavPaths: ["/tmp/out/seg-1.wav"]
    });
  });

  it("rejects in-flight requests when utility process exits", async () => {
    const { client, state } = await setupClient();
    const healthPromise = client.health();

    await vi.waitFor(() => {
      expect(state.children).toHaveLength(1);
    });
    const child = state.children[0];
    child!.emit("exit", 1);

    await expect(healthPromise).rejects.toThrow(
      "Node Kokoro utility process exited while handling a request."
    );
  });

  it("sends dispose RPC and terminates utility process", async () => {
    const { client, state } = await setupClient();
    const healthPromise = client.health();

    await vi.waitFor(() => {
      expect(state.children).toHaveLength(1);
    });
    const child = state.children[0];
    const healthRequest = getFirstPostedMessage(child!);
    child!.emit("message", {
      kind: "response",
      id: healthRequest.id,
      action: "health",
      ok: true,
      result: { running: true, modelStatus: "node_core_ready" }
    });
    await healthPromise;

    const disposePromise = client.dispose();
    const disposeMessage = child!.postedMessages.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      return (entry as { action?: string }).action === "dispose";
    }) as Record<string, unknown> | undefined;

    expect(disposeMessage).toBeDefined();

    child!.emit("message", {
      kind: "response",
      id: disposeMessage!.id,
      action: "dispose",
      ok: true,
      result: { ok: true }
    });

    await disposePromise;
    expect(child!.pid).toBeUndefined();
  });
});
