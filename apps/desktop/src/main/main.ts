import {
  app,
  BrowserWindow,
  crashReporter,
  protocol,
  session,
  shell
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers.js";
import { AudioSidecarManager } from "./sidecars/audioSidecarManager.js";
import { LlmPrepService } from "./sidecars/llmPrepService.js";
import { BootstrapManager } from "./bootstrap/bootstrapManager.js";
import { logDebug, logError, logInfo, logWarn } from "./utils/logging.js";
import {
  isAllowedExternalUrl,
  isAllowedPermission,
  isTrustedNavigationUrl,
  isTrustedRendererUrl
} from "./security/urlPolicy.js";
import { APP_PROTOCOL_SCHEME, registerAppProtocol } from "./security/appProtocol.js";
import { UpdaterService } from "./system/updaterService.js";
import { DiagnosticsService } from "./system/diagnostics.js";
import { RuntimeResourceSettingsService } from "./system/runtimeResourceSettingsService.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let ipcReady = false;
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const RENDERER_DIST_DIR = resolve(THIS_DIR, "../../renderer");
const audioSidecar = new AudioSidecarManager();
const llmPrep = new LlmPrepService();
const bootstrap = new BootstrapManager(audioSidecar);
const updater = new UpdaterService();
const diagnostics = new DiagnosticsService();
const runtimeResourceSettings = new RuntimeResourceSettingsService();

crashReporter.start({
  productName: "Hisui",
  companyName: "Hisui",
  submitURL: "https://invalid.local/crash-reports-disabled",
  uploadToServer: false,
  compress: true
});

function isTrustedIpcEvent(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl, app.isPackaged)) {
    return false;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return true;
  }

  return event.sender.id === mainWindow.webContents.id;
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  if (isTrustedIpcEvent(event)) {
    return;
  }

  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  logWarn("security/ipc", "blocked untrusted IPC sender", {
    senderUrl,
    senderWebContentsId: event.sender.id,
    expectedWebContentsId: mainWindow?.webContents.id
  });
  throw new Error("Blocked IPC request from untrusted sender.");
}

function configurePermissionHandlers(): void {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (!webContents) {
      return false;
    }
    const trustedOrigin = isTrustedRendererUrl(requestingOrigin, app.isPackaged);
    const isMainWindowSender = !mainWindow || mainWindow.isDestroyed() || webContents.id === mainWindow.webContents.id;
    const allowed = trustedOrigin && isMainWindowSender && isAllowedPermission(permission);

    if (!allowed) {
      logWarn("security/permissions", "permission check denied", {
        permission,
        requestingOrigin,
        senderWebContentsId: webContents.id,
        trustedOrigin,
        isMainWindowSender
      });
    }

    return allowed;
  });

  defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (!webContents) {
      callback(false);
      return;
    }

    const origin = webContents.getURL();
    const trustedOrigin = isTrustedRendererUrl(origin, app.isPackaged);
    const isMainWindowSender = !mainWindow || mainWindow.isDestroyed() || webContents.id === mainWindow.webContents.id;
    const allowed = trustedOrigin && isMainWindowSender && isAllowedPermission(permission);

    if (!allowed) {
      logWarn("security/permissions", "permission request denied", {
        permission,
        origin,
        senderWebContentsId: webContents.id,
        trustedOrigin,
        isMainWindowSender
      });
    }

    callback(allowed);
  });
}

function maybeOpenAllowedExternalUrl(targetUrl: string): void {
  if (!isAllowedExternalUrl(targetUrl)) {
    return;
  }

  void shell.openExternal(targetUrl).catch((error) => {
    logWarn("security/navigation", "failed to open external url", {
      targetUrl,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

function enforceNavigationPolicy(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler((details) => {
    logWarn("security/navigation", "blocked window.open", {
      url: details.url,
      frameName: details.frameName
    });
    return { action: "deny" };
  });

  const handleNavigationAttempt = (url: string, action: "navigate" | "redirect", preventDefault: () => void) => {
    if (isTrustedNavigationUrl(url, app.isPackaged)) {
      return;
    }

    preventDefault();
    logWarn("security/navigation", `blocked renderer ${action}`, {
      url,
      isPackaged: app.isPackaged
    });
    maybeOpenAllowedExternalUrl(url);
  };

  window.webContents.on("will-navigate", (event, url) => {
    handleNavigationAttempt(url, "navigate", () => event.preventDefault());
  });

  window.webContents.on("will-redirect", (event, url) => {
    handleNavigationAttempt(url, "redirect", () => event.preventDefault());
  });
}

async function createMainWindow(): Promise<void> {
  logInfo("main", "createMainWindow:start", {
    viteDevServer: Boolean(process.env.VITE_DEV_SERVER_URL)
  });

  if (!ipcReady) {
    registerIpcHandlers({
      audioSidecar,
      llmPrep,
      bootstrap,
      updater,
      diagnostics,
      runtimeResourceSettings,
      assertTrustedIpcSender
    });
    ipcReady = true;
    logDebug("main", "ipc handlers registered");
  }

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: resolve(THIS_DIR, "../../preload/preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  enforceNavigationPolicy(mainWindow);

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}: ${error}`);
    logError("main", "preload-error", { preloadPath, error });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logError("main", "renderer process terminated", details);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logDebug("main", "main window finished loading");
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.HISUI_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
      logInfo("main", "devtools opened (HISUI_OPEN_DEVTOOLS=1)");
    }
    logInfo("main", "loaded dev renderer URL", { url: process.env.VITE_DEV_SERVER_URL });
  } else {
    await mainWindow.loadURL("app://renderer/index.html");
    logInfo("main", "loaded packaged renderer URL", { url: "app://renderer/index.html" });
  }

  mainWindow.on("closed", () => {
    logDebug("main", "main window closed");
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  logInfo("main", "app ready");
  await registerAppProtocol(RENDERER_DIST_DIR);
  await runtimeResourceSettings.initialize();
  audioSidecar.setRuntimeResourcePolicy(runtimeResourceSettings.getPolicy());
  configurePermissionHandlers();
  updater.initialize();
  void createMainWindow();

  app.on("activate", () => {
    logDebug("main", "app activate", { openWindows: BrowserWindow.getAllWindows().length });
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}).catch((error) => {
  logError("main", "failed to bootstrap app", error);
  app.quit();
});

app.on("before-quit", () => {
  logInfo("main", "before-quit");
  updater.dispose();
  void audioSidecar.stop();
});

app.on("window-all-closed", () => {
  logDebug("main", "window-all-closed", { platform: process.platform });
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("unhandledRejection", (reason) => {
  logError("main", "unhandledRejection", { reason });
});

process.on("uncaughtException", (error) => {
  logError("main", "uncaughtException", error);
});

process.on("warning", (warning) => {
  const benignAutofillWarning = warning.message.includes("Autofill.enable")
    || warning.message.includes("Autofill.setAddresses");
  if (benignAutofillWarning) {
    logDebug("main", "ignoring devtools autofill warning", { warning: warning.message });
    return;
  }
  logWarn("main", "node warning", warning);
});
