import { app, BrowserWindow, Notification } from "electron";

const retained = new Set<Notification>();
let activeChannelId: string | null = null;
let getWindow: () => BrowserWindow | null = () => null;

export function installNotifications(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter;
}

export function setActiveChannel(channelId: string | null) {
  activeChannelId = channelId;
}

export function setBadge(count: number) {
  const next = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  app.setBadgeCount(next);
}

export function notifyIncomingMessage(message: {
  userId?: string;
  userName?: string;
  body?: string;
  channelId?: string;
  fileName?: string | null;
}, meId: string | null) {
  if (!message.channelId || !Notification.isSupported()) return;
  if (meId && message.userId === meId) return;
  const win = getWindow();
  const lookingAtChannel =
    Boolean(win?.isFocused()) && !win?.isMinimized() && activeChannelId === message.channelId;
  if (lookingAtChannel) return;

  const body = message.body?.trim() || message.fileName || "New message";
  const notification = new Notification({
    title: message.userName || "Relay",
    body: body.slice(0, 180),
    silent: false,
  });
  retained.add(notification);
  notification.on("click", () => {
    retained.delete(notification);
    const target = getWindow();
    if (!target || target.isDestroyed()) return;
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
    target.webContents.send("relay:navigate", message.channelId);
  });
  notification.on("close", () => retained.delete(notification));
  notification.show();
}
