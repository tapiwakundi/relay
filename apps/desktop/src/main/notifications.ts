import { app, BrowserWindow, Notification } from "electron";
import { relayChannels } from "../shared/ipc";
import {
  aggregatedUnread,
  navigationFromNotification,
  shouldSuppressDesktopNotification,
} from "./notification-logic";

const retained = new Set<Notification>();
let activeView: { accountId: string | null; channelId: string | null } = { accountId: null, channelId: null };
let getWindow: () => BrowserWindow | null = () => null;
const unreadByAccount = new Map<string, number>();

export function installNotifications(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter;
}

export function setActiveChannel(channelId: string | null, accountId?: string | null) {
  activeView = { accountId: accountId ?? activeView.accountId, channelId };
}

export function setAccountUnread(accountId: string, count: number) {
  unreadByAccount.set(accountId, Math.max(0, count));
  app.setBadgeCount(aggregatedUnread(unreadByAccount.values()));
}

export function clearAccountUnread(accountId: string) {
  unreadByAccount.delete(accountId);
  app.setBadgeCount(aggregatedUnread(unreadByAccount.values()));
}

export function setBadge(count: number) {
  const next = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (activeView.accountId) setAccountUnread(activeView.accountId, next);
  else app.setBadgeCount(next);
}

export function notifyIncomingMessage(
  message: {
    userId?: string;
    userName?: string;
    body?: string;
    channelId?: string;
    fileName?: string | null;
  },
  context: { meId: string | null; accountId: string; workspaceId?: string },
) {
  if (!message.channelId || !Notification.isSupported()) return;
  const win = getWindow();
  if (
    shouldSuppressDesktopNotification(
      {
        accountId: activeView.accountId,
        channelId: activeView.channelId,
        focused: Boolean(win?.isFocused()),
        minimized: Boolean(win?.isMinimized()),
      },
      context,
      message,
    )
  ) {
    return;
  }

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
    target.webContents.send(
      relayChannels.navigate,
      navigationFromNotification(context, message.channelId!),
    );
  });
  notification.on("close", () => retained.delete(notification));
  notification.show();
}
