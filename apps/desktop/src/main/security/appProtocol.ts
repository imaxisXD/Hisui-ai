import { net, protocol } from "electron";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { logDebug, logWarn } from "../utils/logging.js";

export const APP_PROTOCOL_SCHEME = "app";
export const APP_PROTOCOL_HOST = "renderer";

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  return filePath === rootPath || filePath.startsWith(`${rootPath}${sep}`);
}

function toRelativeAssetPath(pathname: string): string | null {
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPathname.includes("\0")) {
    return null;
  }

  const trimmed = decodedPathname.replace(/^\/+/, "");
  if (!trimmed) {
    return "index.html";
  }

  return trimmed;
}

export function resolveRendererAssetPath(requestUrl: string, rendererRoot: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${APP_PROTOCOL_SCHEME}:` || parsed.hostname !== APP_PROTOCOL_HOST) {
    return null;
  }

  const relativeAssetPath = toRelativeAssetPath(parsed.pathname);
  if (!relativeAssetPath) {
    return null;
  }

  const normalizedRoot = resolve(rendererRoot);
  const candidatePath = resolve(normalizedRoot, relativeAssetPath);
  if (!isPathInsideRoot(candidatePath, normalizedRoot)) {
    return null;
  }

  return candidatePath;
}

export async function registerAppProtocol(rendererRoot: string): Promise<void> {
  protocol.handle(APP_PROTOCOL_SCHEME, async (request) => {
    const resolvedPath = resolveRendererAssetPath(request.url, rendererRoot);
    if (!resolvedPath) {
      logWarn("security/protocol", "blocked app protocol request", { url: request.url });
      return new Response("Not Found", { status: 404 });
    }

    try {
      await access(resolvedPath, constants.R_OK);
      return net.fetch(pathToFileURL(resolvedPath).toString());
    } catch {
      logDebug("security/protocol", "asset missing", { url: request.url, resolvedPath });
      return new Response("Not Found", { status: 404 });
    }
  });
}
