import { describe, expect, it } from "vitest";
import { chunkTextToSegments, estimateSegmentDurationSec } from "./chunking.js";

describe("chunkTextToSegments", () => {
  it("splits long text into ordered segments", () => {
    const text = "Sentence one. Sentence two is longer. Sentence three should push over the limit.";

    const result = chunkTextToSegments(text, {
      chapterId: "chapter-1",
      speakerId: "speaker-1",
      maxChars: 35,
      startOrder: 0
    });

    expect(result.length).toBeGreaterThan(1);
    expect(result[0]?.order).toBe(0);
    expect(result[1]?.order).toBe(1);
  });

  it("creates one fallback segment for short text", () => {
    const result = chunkTextToSegments("Short line", {
      chapterId: "chapter-1",
      speakerId: "speaker-1",
      maxChars: 320,
      startOrder: 0
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("Short line");
  });
});

describe("estimateSegmentDurationSec", () => {
  it("returns deterministic numeric estimate", () => {
    const duration = estimateSegmentDurationSec("one two three four five six");
    expect(duration).toBeGreaterThan(2);
    expect(duration).toBeLessThan(3);
  });
});
