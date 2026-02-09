import { describe, expect, it } from "vitest";
import { NodeKokoroClient, resolveKokoroVoiceIdForRuntime } from "./nodeKokoroClient.js";

describe("resolveKokoroVoiceIdForRuntime", () => {
  it("maps legacy narrator aliases to canonical Kokoro IDs", () => {
    expect(resolveKokoroVoiceIdForRuntime("kokoro_narrator")).toBe("af_heart");
    expect(resolveKokoroVoiceIdForRuntime("kokoro_story")).toBe("af_bella");
  });

  it("keeps canonical IDs and falls back for blank values", () => {
    expect(resolveKokoroVoiceIdForRuntime("bf_emma")).toBe("bf_emma");
    expect(resolveKokoroVoiceIdForRuntime("")).toBe("af_heart");
  });
});

describe("NodeKokoroClient.listVoices", () => {
  it("returns the expanded English Kokoro voice list", async () => {
    const client = new NodeKokoroClient("/tmp/local-podcast-models");
    const voices = await client.listVoices();

    expect(voices).toHaveLength(28);
    expect(voices.every((voice) => voice.model === "kokoro")).toBe(true);
    expect(voices.some((voice) => voice.id === "af_heart")).toBe(true);
    expect(voices.some((voice) => voice.id === "bm_lewis")).toBe(true);
    expect(voices.some((voice) => voice.id === "kokoro_narrator")).toBe(false);
  });
});
