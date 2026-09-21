import { app, BrowserWindow, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ipcMain } from "electron";
import type { WsClientEvent } from "@relay/shared";
import { relayChannels, type ApiRequest, type AuthMode } from "../shared/ipc";
import { proxyApi } from "./api";
import { API_ORIGIN, authClient } from "./auth";
import {
  accountsSnapshot,
  beginAddAccount,
  cancelAddAccount,
  completeAuth,
  getActiveAccountId,
  hydrateAccounts,
  signOutAccount,
  switchAccount,
} from "./accounts";
import { installCapture, prepareMedia } from "./capture";
import { installDeepLinks, takePendingInvites } from "./deeplink";
import { installNotifications, setActiveChannel, setBadge } from "./notifications";
import { closeRealtime, openRealtime, sendRealtime } from "./realtime";
import { installApplicationMenu } from "./menu";
import { promptCheckForUpdates, installAutoUpdater } from "./updater";
import { lookupHostSync } from "./lookup-host";
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
installApplicationMenu(() => {
  void promptCheckForUpdates();
});

function authMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function beginAddIfRequested(add?: boolean) {
  if (!add) return false;
  const already = accountsSnapshot().adding;
  beginAddAccount();
  return !already;
}

ipcMain.on(relayChannels.lookupHost, (event, host: unknown) => {
  event.returnValue = typeof host === "string" ? lookupHostSync(host) : null;
});
ipcMain.handle(relayChannels.api, (_event, request: ApiRequest) => proxyApi(request));
ipcMain.handle(relayChannels.signInEmail, async (_event, email: unknown, password: unknown, options?: AuthMode) => {
  if (typeof email !== "string" || typeof password !== "string") {
    return { error: { message: "Email and password are required" } };
  }
  const startedAdd = beginAddIfRequested(options?.add);
  try {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      if (startedAdd) cancelAddAccount();
      return { error: { message: result.error.message || "Couldn’t sign in" } };
    }
    return completeAuth();
  } catch (error) {
    if (startedAdd) cancelAddAccount();
    return { error: { message: authMessage(error, "Couldn’t sign in") } };
  }
});
ipcMain.handle(relayChannels.signUpEmail, async (_event, name: unknown, email: unknown, password: unknown, options?: AuthMode) => {
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
    return { error: { message: "Name, email, and password are required" } };
  }
  const startedAdd = beginAddIfRequested(options?.add);
  try {
    const result = await authClient.signUp.email({ name, email, password });
    if (result.error) {
      if (startedAdd) cancelAddAccount();
      return { error: { message: result.error.message || "Couldn’t create account" } };
    }
    return completeAuth();
  } catch (error) {
    if (startedAdd) cancelAddAccount();
    return { error: { message: authMessage(error, "Couldn’t create account") } };
  }
});
ipcMain.handle(relayChannels.requestAuth, async (_event, options?: { provider?: string; add?: boolean }) => {
  const startedAdd = beginAddIfRequested(options?.add);
  try {
    await (authClient as typeof authClient & { requestAuth: (opts?: { provider?: string }) => Promise<void> }).requestAuth({
      provider: options?.provider ?? "google",
    });
  } catch (error) {
    if (startedAdd) cancelAddAccount();
    throw error;
  }
});
ipcMain.handle(relayChannels.listAccounts, () => accountsSnapshot());
ipcMain.handle(relayChannels.switchAccount, async (_event, accountId: unknown) => {
  if (typeof accountId !== "string") return;
  await switchAccount(accountId);
});
ipcMain.handle(relayChannels.startAddAccount, () => beginAddAccount());
ipcMain.handle(relayChannels.cancelAddAccount, () => cancelAddAccount());
ipcMain.handle(relayChannels.completeAuth, () => completeAuth());
ipcMain.handle(relayChannels.removeAccount, async (_event, accountId: unknown) => {
  await signOutAccount(typeof accountId === "string" ? accountId : null);
});
ipcMain.handle(relayChannels.realtimeOpen, () => {
  openRealtime();
});
ipcMain.handle(relayChannels.realtimeClose, () => {
  closeRealtime();
});
ipcMain.handle(relayChannels.realtimeSend, (_event, payload: WsClientEvent) => {
  sendRealtime(payload, getActiveAccountId());
});
ipcMain.handle(relayChannels.setBadge, (_event, count: unknown) => {
  setBadge(typeof count === "number" ? count : 0);
});
ipcMain.handle(relayChannels.setActiveChannel, (_event, channelId: unknown) => {
  setActiveChannel(typeof channelId === "string" ? channelId : null, getActiveAccountId());
});
ipcMain.handle(relayChannels.pendingInvites, () => takePendingInvites());
ipcMain.handle(relayChannels.prepareMedia, () => prepareMedia());
ipcMain.handle(relayChannels.showEmojiPanel, () => app.showEmojiPanel());

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
    backgroundColor: "#1A5FB4",
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

app.whenReady().then(async () => {
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(appIconPath());
  }
  installCapture();
  installContentSecurityPolicy();
  await hydrateAccounts();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
