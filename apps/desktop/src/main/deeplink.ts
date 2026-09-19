import { app, BrowserWindow } from "electron";
import { INVITE_SCHEME } from "../shared/ipc";

const pendingInvites: string[] = [];
let getWindow: () => BrowserWindow | null = () => null;

export function installDeepLinks(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter;
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(INVITE_SCHEME, process.execPath, [process.argv[1]]);
  } else {
    app.setAsDefaultProtocolClient(INVITE_SCHEME);
  }
  app.on("open-url", (event, url) => {
    event.preventDefault();
    captureUrl(url);
  });
  app.on("second-instance", (_event, argv) => {
    for (const arg of argv) captureUrl(arg);
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  for (const arg of process.argv) captureUrl(arg);
}

export function captureUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== `${INVITE_SCHEME}:`) return;
  const invite = parsed.searchParams.get("invite");
  if (!invite) return;
  pendingInvites.push(invite);
  const win = getWindow();
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send("relay:invite", invite);
  }
}

export function takePendingInvites() {
  return pendingInvites.splice(0);
}
