import { readFile } from "node:fs/promises";
import pdf from "pdf-parse";
import type { ChapterImport } from "../../../shared/types.js";
import { splitIntoChapters } from "../textUtils.js";

export async function parsePdf(filePath: string): Promise<ChapterImport[]> {
  const raw = await readFile(filePath);
  const parsed = await pdf(raw);
  return splitIntoChapters(parsed.text).map((chapter) => ({
    title: chapter.title,
    text: chapter.text
  }));
}
