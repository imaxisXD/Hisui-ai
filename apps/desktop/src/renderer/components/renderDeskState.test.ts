import { describe, expect, it } from "vitest";
import { buildRenderTargetPath, shouldConfirmOverwrite, toFileUrl } from "./renderDeskState.js";

describe("renderDeskState", () => {
  it("builds a normalized target path", () => {
    expect(buildRenderTargetPath({
      outputDir: "/Users/you/Desktop",
      outputFileName: "Relieving letter",
      projectTitle: "Ignored"
    })).toBe("/Users/you/Desktop/relieving-letter.mp3");
  });

  it("confirms overwrite when output matches last completed target", () => {
    expect(shouldConfirmOverwrite({
      outputDir: "/Users/you/Desktop",
      outputFileName: "Relieving letter",
      projectTitle: "Ignored",
      lastOutputPath: "/Users/you/Desktop/relieving-letter.mp3"
    })).toBe(true);
  });

  it("does not confirm overwrite when output target changed", () => {
    expect(shouldConfirmOverwrite({
      outputDir: "/Users/you/Desktop",
      outputFileName: "Relieving letter v2",
      projectTitle: "Ignored",
      lastOutputPath: "/Users/you/Desktop/relieving-letter.mp3"
    })).toBe(false);
  });

  it("treats windows paths as case-insensitive", () => {
    expect(shouldConfirmOverwrite({
      outputDir: "C:\\Users\\You\\Desktop\\",
      outputFileName: "My Episode",
      projectTitle: "Ignored",
      lastOutputPath: "c:\\users\\you\\desktop\\my-episode.mp3"
    })).toBe(true);
  });

  it("creates a file url for unix-style paths", () => {
    expect(toFileUrl("/Users/you/Desktop/my file.mp3")).toBe("file:///Users/you/Desktop/my%20file.mp3");
  });

  it("creates a file url for windows-style paths", () => {
    expect(toFileUrl("C:\\Users\\You\\Desktop\\my file.mp3")).toBe("file:///C:/Users/You/Desktop/my%20file.mp3");
  });
});
