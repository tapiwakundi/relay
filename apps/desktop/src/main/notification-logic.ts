import type { AccountNavigation } from "@relay/shared";

export type NotificationView = {
  accountId: string | null;
  channelId: string | null;
  focused: boolean;
  minimized: boolean;
};

export function shouldSuppressDesktopNotification(
  view: NotificationView,
  context: { meId: string | null; accountId: string },
  message: { userId?: string; channelId?: string },
) {
  if (!message.channelId) return true;
  if (context.meId && message.userId === context.meId) return true;
  return (
    view.focused &&
    !view.minimized &&
    view.accountId === context.accountId &&
    view.channelId === message.channelId
  );
}

export function navigationFromNotification(
  context: { accountId: string; workspaceId?: string },
  channelId: string,
): AccountNavigation {
  return {
    accountId: context.accountId,
    workspaceId: context.workspaceId,
    channelId,
  };
}

export function aggregatedUnread(counts: Iterable<number>) {
  let total = 0;
  for (const count of counts) total += Math.max(0, count);
  return total;
}
