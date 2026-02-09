import { sanitizeFileName } from "../../shared/fileName.js";

interface RenderTargetInput {
  outputDir: string;
  outputFileName: string;
  projectTitle: string;
}

interface OverwriteCheckInput extends RenderTargetInput {
  lastOutputPath?: string;
}

export function buildRenderTargetPath(input: RenderTargetInput): string | null {
  const outputDir = trimTrailingPathSeparators(input.outputDir);
  if (!outputDir) {
    return null;
  }

  const outputName = resolveOutputName(input.outputFileName, input.projectTitle);
  const separator = outputDir.includes("\\") ? "\\" : "/";

  if (outputDir.endsWith(separator)) {
    return `${outputDir}${outputName}.mp3`;
  }
  return `${outputDir}${separator}${outputName}.mp3`;
}

export function shouldConfirmOverwrite(input: OverwriteCheckInput): boolean {
  const lastOutputPath = input.lastOutputPath?.trim();
  if (!lastOutputPath) {
    return false;
  }

  const nextTarget = buildRenderTargetPath(input);
  if (!nextTarget) {
    return false;
  }

  return normalizePathForComparison(nextTarget) === normalizePathForComparison(lastOutputPath);
}

export function toFileUrl(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return "";
  }
  if (/^file:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const windowsStyle = /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.includes("\\");
  const slashNormalized = windowsStyle ? trimmed.replace(/\\/g, "/") : trimmed;
  const encodedPath = slashNormalized
    .split("/")
    .map((segment, index) => {
      if (windowsStyle && index === 0 && /^[a-zA-Z]:$/.test(segment)) {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join("/");

  if (windowsStyle) {
    return `file:///${encodedPath}`;
  }
  if (encodedPath.startsWith("/")) {
    return `file://${encodedPath}`;
  }
  return `file://${encodedPath}`;
}

function resolveOutputName(outputFileName: string, projectTitle: string): string {
  const preferredName = outputFileName.trim() || projectTitle.trim();
  return sanitizeFileName(preferredName) || "podcast";
}

function trimTrailingPathSeparators(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[a-zA-Z]:[\\/]?$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}\\`;
  }
  if (/^[\\/]+$/.test(trimmed)) {
    return trimmed.startsWith("\\") ? "\\" : "/";
  }
  return trimmed.replace(/[\\/]+$/g, "");
}

function normalizePathForComparison(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  const windowsStyle = /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.includes("\\");
  const separatorNormalized = windowsStyle ? trimmed.replace(/\//g, "\\") : trimmed.replace(/\\/g, "/");
  const withoutTrailingSeparator = separatorNormalized.replace(/[\\/]+$/g, "");

  return windowsStyle ? withoutTrailingSeparator.toLowerCase() : withoutTrailingSeparator;
}
