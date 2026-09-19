import { BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

export function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function sendToRenderer(channel: string, payload?: unknown) {
  const win = getMainWindow();
  if (!win) return;
  if (payload === undefined) win.webContents.send(channel);
  else win.webContents.send(channel, payload);
}
