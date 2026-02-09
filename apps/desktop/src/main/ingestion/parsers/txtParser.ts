import { readFile } from "node:fs/promises";
import type { ChapterImport } from "../../../shared/types.js";
import { splitIntoChapters } from "../textUtils.js";

export async function parseTxt(filePath: string): Promise<ChapterImport[]> {
  const content = await readFile(filePath, "utf-8");
  return splitIntoChapters(content).map((chapter) => ({
    title: chapter.title,
    text: chapter.text
  }));
}
