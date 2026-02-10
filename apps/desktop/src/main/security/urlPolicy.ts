const DEV_RENDERER_PROTOCOL = "http:";
const DEV_RENDERER_HOST = "127.0.0.1";
const DEV_RENDERER_PORT = "5173";
const PACKAGED_RENDERER_PROTOCOL = "app:";
const PACKAGED_RENDERER_HOST = "renderer";

const ALLOWED_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "clipboard-write"
]);

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isTrustedDevRenderer(url: URL): boolean {
  return url.protocol === DEV_RENDERER_PROTOCOL
    && url.hostname === DEV_RENDERER_HOST
    && url.port === DEV_RENDERER_PORT;
}

function isTrustedPackagedRenderer(url: URL): boolean {
  return url.protocol === PACKAGED_RENDERER_PROTOCOL
    && url.hostname === PACKAGED_RENDERER_HOST;
}

export function isTrustedRendererUrl(input: string, isPackaged: boolean): boolean {
  const url = parseUrl(input);
  if (!url) {
    return false;
  }

  if (isPackaged) {
    return isTrustedPackagedRenderer(url);
  }

  return isTrustedDevRenderer(url);
}

export function isTrustedNavigationUrl(input: string, isPackaged: boolean): boolean {
  if (input === "about:blank") {
    return true;
  }
  return isTrustedRendererUrl(input, isPackaged);
}

export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

export function isAllowedExternalUrl(input: string): boolean {
  const url = parseUrl(input);
  if (!url) {
    return false;
  }

  return url.protocol === "https:";
}
