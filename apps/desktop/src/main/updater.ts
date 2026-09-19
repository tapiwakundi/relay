import { app, ipcMain, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { relayChannels, type UpdateState } from "../shared/ipc";

let installed = false;
let getWindow: (() => BrowserWindow | null) | null = null;
let state: UpdateState = {
  status: app.isPackaged ? "idle" : "disabled",
  currentVersion: app.getVersion(),
  message: app.isPackaged ? undefined : "Update checks are available in the installed app.",
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Couldn’t check for updates.";
}

function publish(next: Omit<UpdateState, "currentVersion">) {
  state = { ...next, currentVersion: app.getVersion() };
  const win = getWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(relayChannels.updateState, state);
  }
  return state;
}

async function checkForUpdates() {
  if (!app.isPackaged) return state;
  publish({ status: "checking" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publish({ status: "error", message: errorMessage(error) });
  }
  return state;
}

async function downloadUpdate() {
  if (!app.isPackaged || state.status !== "available") return;
  publish({ status: "downloading", version: state.version, percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    publish({ status: "error", version: state.version, message: errorMessage(error) });
  }
}

function installUpdate() {
  if (!app.isPackaged || state.status !== "downloaded") return;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

export function installAutoUpdater(windowProvider: () => BrowserWindow | null) {
  if (installed) return;
  installed = true;
  getWindow = windowProvider;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    publish({ status: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    publish({ status: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    publish({ status: "up-to-date" });
  });
  autoUpdater.on("download-progress", (progress) => {
    publish({
      status: "downloading",
      version: state.version,
      percent: Math.max(0, Math.min(100, progress.percent)),
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    publish({ status: "downloaded", version: info.version });
  });
  autoUpdater.on("update-cancelled", (info) => {
    publish({ status: "available", version: info.version, message: "Download cancelled." });
  });
  autoUpdater.on("error", (error) => {
    publish({ status: "error", version: state.version, message: errorMessage(error) });
  });

  ipcMain.handle(relayChannels.getUpdateState, () => state);
  ipcMain.handle(relayChannels.checkForUpdates, () => checkForUpdates());
  ipcMain.handle(relayChannels.downloadUpdate, () => downloadUpdate());
  ipcMain.handle(relayChannels.installUpdate, () => installUpdate());
}
