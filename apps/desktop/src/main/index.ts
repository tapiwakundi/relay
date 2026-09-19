import { app, BrowserWindow, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ipcMain } from "electron";
import type { WsClientEvent } from "@relay/shared";
import { relayChannels, type ApiRequest } from "../shared/ipc";
import { proxyApi } from "./api";
import { API_ORIGIN, authClient } from "./auth";
import { installCapture, prepareMedia } from "./capture";
import { installDeepLinks, takePendingInvites } from "./deeplink";
import { installNotifications, setActiveChannel, setBadge } from "./notifications";
import { closeRealtime, openRealtime, sendRealtime } from "./realtime";
import { installAutoUpdater } from "./updater";
import { getMainWindow, setMainWindow } from "./window";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// When a config object is passed, @better-auth/electron only enables features that are explicitly `true`.
// `bridges` registers the better-auth:* IPC handlers the preload relies on; `scheme` handles the
// com.endurancelabs.relaydesktop://auth/callback deep link after browser sign-in. CSP is managed in
// installContentSecurityPolicy() below.
authClient.setupMain({
  csp: false,
  scheme: true,
  bridges: true,
  getWindow: getMainWindow,
});
installDeepLinks(getMainWindow);
installNotifications(getMainWindow);
installAutoUpdater(getMainWindow);

function authMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

ipcMain.handle(relayChannels.api, (_event, request: ApiRequest) => proxyApi(request));
ipcMain.handle(relayChannels.signInEmail, async (_event, email: unknown, password: unknown) => {
  if (typeof email !== "string" || typeof password !== "string") {
    return { error: { message: "Email and password are required" } };
  }
  try {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) return { error: { message: result.error.message || "Couldn’t sign in" } };
    return { error: null };
  } catch (error) {
    return { error: { message: authMessage(error, "Couldn’t sign in") } };
  }
});
ipcMain.handle(relayChannels.signUpEmail, async (_event, name: unknown, email: unknown, password: unknown) => {
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
    return { error: { message: "Name, email, and password are required" } };
  }
  try {
    const result = await authClient.signUp.email({ name, email, password });
    if (result.error) return { error: { message: result.error.message || "Couldn’t create account" } };
    return { error: null };
  } catch (error) {
    return { error: { message: authMessage(error, "Couldn’t create account") } };
  }
});
ipcMain.handle(relayChannels.realtimeOpen, () => {
  openRealtime();
});
ipcMain.handle(relayChannels.realtimeClose, () => {
  closeRealtime();
});
ipcMain.handle(relayChannels.realtimeSend, (_event, payload: WsClientEvent) => {
  sendRealtime(payload);
});
ipcMain.handle(relayChannels.setBadge, (_event, count: unknown) => {
  setBadge(typeof count === "number" ? count : 0);
});
ipcMain.handle(relayChannels.setActiveChannel, (_event, channelId: unknown) => {
  setActiveChannel(typeof channelId === "string" ? channelId : null);
});
ipcMain.handle(relayChannels.pendingInvites, () => takePendingInvites());
ipcMain.handle(relayChannels.prepareMedia, () => prepareMedia());

function installContentSecurityPolicy() {
  if (!app.isPackaged) return;
  const api = new URL(API_ORIGIN).origin;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: mediastream:",
    `connect-src 'self' ${api} https: wss:`,
    "worker-src 'self' blob:",
  ].join("; ");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-security-policy") delete headers[key];
    }
    headers["Content-Security-Policy"] = [policy];
    callback({ responseHeaders: headers });
  });
}

function appIconPath() {
  return path.join(__dirname, "../../packaging/icon-1024.png");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Relay",
    icon: appIconPath(),
    backgroundColor: "#3F0E40",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      // Sandboxed preloads run as plain scripts (no ESM), so the preload is built as CJS `index.js`
      // (see electron.vite.config.ts) rather than electron-vite's default `.mjs` for "type": "module" packages.
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  setMainWindow(win);
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("preload-error", preloadPath, error);
  });
  win.on("closed", () => {
    if (getMainWindow() === win) setMainWindow(null);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    const allowed = (devUrl && url.startsWith(devUrl)) || url.startsWith("file:");
    if (allowed) return;
    event.preventDefault();
    if (url.startsWith("https:") || url.startsWith("http:")) void shell.openExternal(url);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(appIconPath());
  }
  installCapture();
  installContentSecurityPolicy();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
