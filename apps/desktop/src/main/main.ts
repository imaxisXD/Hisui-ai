import { app, BrowserWindow } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers.js";
import { AudioSidecarManager } from "./sidecars/audioSidecarManager.js";
import { LlmPrepService } from "./sidecars/llmPrepService.js";
import { BootstrapManager } from "./bootstrap/bootstrapManager.js";

let mainWindow: BrowserWindow | null = null;
let ipcReady = false;
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const audioSidecar = new AudioSidecarManager();
const llmPrep = new LlmPrepService();
const bootstrap = new BootstrapManager(audioSidecar);

async function createMainWindow(): Promise<void> {
  if (!ipcReady) {
    registerIpcHandlers({ audioSidecar, llmPrep, bootstrap });
    ipcReady = true;
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
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(join(THIS_DIR, "../../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  void audioSidecar.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
