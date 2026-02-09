import { app } from "electron";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
let cachedWorkspaceRoot: string | null = null;

function looksLikeWorkspaceRoot(candidate: string): boolean {
  return (
    existsSync(join(candidate, "package.json")) &&
    existsSync(join(candidate, "apps")) &&
    existsSync(join(candidate, "services")) &&
    existsSync(join(candidate, "resources"))
  );
}

export function getWorkspaceRoot(): string {
  if (cachedWorkspaceRoot) {
    return cachedWorkspaceRoot;
  }

  let cursor = THIS_DIR;
  for (let depth = 0; depth < 10; depth += 1) {
    if (looksLikeWorkspaceRoot(cursor)) {
      cachedWorkspaceRoot = cursor;
      return cursor;
    }

    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }

  // Conservative fallback if discovery fails.
  cachedWorkspaceRoot = resolve(THIS_DIR, "../../../../../");
  return cachedWorkspaceRoot;
}

export function getResourceRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return join(getWorkspaceRoot(), "resources");
}

export function getAudioServiceScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "services", "audio", "server.py");
  }
  return join(getWorkspaceRoot(), "services", "audio", "server.py");
}

export function getKokoroNodeScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "services", "kokoro-node", "cli.mjs");
  }
  return join(getWorkspaceRoot(), "services", "kokoro-node", "cli.mjs");
}

export function getFfmpegPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "bin", "ffmpeg");
  }
  return join(getWorkspaceRoot(), "resources", "bin", "ffmpeg");
}

export function getLlamaCliPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "bin", "llama-cli");
  }
  return join(getWorkspaceRoot(), "resources", "bin", "llama-cli");
}

export function getModelsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "models");
  }
  return join(getWorkspaceRoot(), "resources", "models");
}

export function getNodeModulesRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "node_modules");
  }
  return join(getWorkspaceRoot(), "node_modules");
}
