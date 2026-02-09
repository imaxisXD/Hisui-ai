import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "./fileName.js";

describe("sanitizeFileName", () => {
  it("normalizes spaces and lowercases", () => {
    expect(sanitizeFileName("  My Podcast Title  ")).toBe("my-podcast-title");
  });

  it("removes unsupported characters and keeps safe symbols", () => {
    expect(sanitizeFileName("A_B.C!?* (Draft)")).toBe("a_b.c-draft");
  });

  it("returns an empty string for blank input", () => {
    expect(sanitizeFileName("   ")).toBe("");
  });
});
