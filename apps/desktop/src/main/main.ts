import { app, BrowserWindow } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers.js";
import { AudioSidecarManager } from "./sidecars/audioSidecarManager.js";
import { LlmPrepService } from "./sidecars/llmPrepService.js";
import { BootstrapManager } from "./bootstrap/bootstrapManager.js";
import { logDebug, logError, logInfo, logWarn } from "./utils/logging.js";

let mainWindow: BrowserWindow | null = null;
let ipcReady = false;
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const audioSidecar = new AudioSidecarManager();
const llmPrep = new LlmPrepService();
const bootstrap = new BootstrapManager(audioSidecar);

async function createMainWindow(): Promise<void> {
  logInfo("main", "createMainWindow:start", {
    viteDevServer: Boolean(process.env.VITE_DEV_SERVER_URL)
  });

  if (!ipcReady) {
    registerIpcHandlers({ audioSidecar, llmPrep, bootstrap });
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
    await mainWindow.loadFile(join(THIS_DIR, "../../renderer/index.html"));
    logInfo("main", "loaded packaged renderer file");
  }

  mainWindow.on("closed", () => {
    logDebug("main", "main window closed");
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  logInfo("main", "app ready");
  void createMainWindow();

  app.on("activate", () => {
    logDebug("main", "app activate", { openWindows: BrowserWindow.getAllWindows().length });
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  logInfo("main", "before-quit");
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
