import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getModelsDir, getWorkspaceRoot } from "./paths.js";

vi.mock("electron", () => ({
  app: {
    isPackaged: false
  }
}));

describe("path resolution", () => {
  it("discovers workspace root with expected top-level folders", () => {
    const root = getWorkspaceRoot();
    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "apps"))).toBe(true);
    expect(existsSync(join(root, "services"))).toBe(true);
    expect(existsSync(join(root, "resources"))).toBe(true);
  });

  it("resolves models directory from workspace resources in dev", () => {
    const root = getWorkspaceRoot();
    expect(getModelsDir()).toBe(join(root, "resources", "models"));
  });
});
