import { describe, expect, it } from "vitest";
import {
  isAllowedExternalUrl,
  isAllowedPermission,
  isTrustedNavigationUrl,
  isTrustedRendererUrl
} from "./urlPolicy.js";

describe("urlPolicy", () => {
  it("allows trusted dev renderer URL and blocks others in dev", () => {
    expect(isTrustedRendererUrl("http://127.0.0.1:5173/#/library", false)).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173", false)).toBe(false);
    expect(isTrustedRendererUrl("https://127.0.0.1:5173", false)).toBe(false);
  });

  it("allows trusted packaged renderer URL and blocks others in packaged mode", () => {
    expect(isTrustedRendererUrl("app://renderer/index.html", true)).toBe(true);
    expect(isTrustedRendererUrl("app://evil/index.html", true)).toBe(false);
    expect(isTrustedRendererUrl("http://127.0.0.1:5173", true)).toBe(false);
  });

  it("handles invalid URL values safely", () => {
    expect(isTrustedRendererUrl("not-a-url", true)).toBe(false);
    expect(isTrustedNavigationUrl("::::", false)).toBe(false);
  });

  it("permits only allowlisted clipboard permissions", () => {
    expect(isAllowedPermission("clipboard-read")).toBe(true);
    expect(isAllowedPermission("clipboard-sanitized-write")).toBe(true);
    expect(isAllowedPermission("clipboard-write")).toBe(true);
    expect(isAllowedPermission("media")).toBe(false);
  });

  it("allows only https external URLs", () => {
    expect(isAllowedExternalUrl("https://example.com/docs")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com/docs")).toBe(false);
    expect(isAllowedExternalUrl("file:///tmp/demo")).toBe(false);
  });
});
