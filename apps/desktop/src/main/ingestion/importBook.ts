import { basename, extname } from "node:path";
import type { ImportResult, InputFormat } from "../../shared/types.js";
import { parseEpub } from "./parsers/epubParser.js";
import { parsePdf } from "./parsers/pdfParser.js";
import { parseTxt } from "./parsers/txtParser.js";

function toFormat(ext: string): InputFormat {
  const normalized = ext.toLowerCase();
  if (normalized === ".epub") {
    return "epub";
  }
  if (normalized === ".pdf") {
    return "pdf";
  }
  return "txt";
}

export async function importBook(filePath: string): Promise<ImportResult> {
  const ext = extname(filePath);
  const format = toFormat(ext);

  const warnings: string[] = [];
  let chapters;

  if (format === "epub") {
    chapters = await parseEpub(filePath);
  } else if (format === "pdf") {
    chapters = await parsePdf(filePath);
    warnings.push("PDF parsing can introduce formatting noise. Review chapter text before rendering.");
  } else {
    chapters = await parseTxt(filePath);
  }

  return {
    title: basename(filePath, ext),
    sourcePath: filePath,
    sourceFormat: format,
    chapters,
    warnings
  };
}
