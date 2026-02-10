import { describe, expect, it } from "vitest";
import { resolveRendererAssetPath } from "./appProtocol.js";

describe("appProtocol", () => {
  const rendererRoot = "/tmp/hisui/renderer";

  it("resolves valid renderer assets", () => {
    expect(resolveRendererAssetPath("app://renderer/index.html", rendererRoot)).toBe("/tmp/hisui/renderer/index.html");
    expect(resolveRendererAssetPath("app://renderer/assets/main.js", rendererRoot)).toBe("/tmp/hisui/renderer/assets/main.js");
  });

  it("defaults root request to index.html", () => {
    expect(resolveRendererAssetPath("app://renderer/", rendererRoot)).toBe("/tmp/hisui/renderer/index.html");
  });

  it("rejects unknown host/scheme", () => {
    expect(resolveRendererAssetPath("app://evil/index.html", rendererRoot)).toBeNull();
    expect(resolveRendererAssetPath("https://renderer/index.html", rendererRoot)).toBeNull();
  });

  it("rejects traversal attempts", () => {
    expect(resolveRendererAssetPath("app://renderer/%2e%2e%2fmain.js", rendererRoot)).toBeNull();
    expect(resolveRendererAssetPath("app://renderer/%2e%2e%2f%2e%2e%2fmain.js", rendererRoot)).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(resolveRendererAssetPath("not-a-url", rendererRoot)).toBeNull();
  });
});
