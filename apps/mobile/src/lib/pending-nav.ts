import type { PushNotificationData } from "@relay/shared";

let pending: PushNotificationData | null = null;
let openChannel: ((channelId: string) => void) | null = null;

export function setPendingNav(data: PushNotificationData) {
  pending = data;
}

export function peekPendingNav() {
  return pending;
}

export function takePendingNav() {
  const next = pending;
  pending = null;
  return next;
}

export function setPendingChannelOpener(fn: ((channelId: string) => void) | null) {
  openChannel = fn;
}

export function openPendingIfReady(activeAccountId: string | null, workspaceId: string | null) {
  if (!pending?.channelId || !pending.accountId) return false;
  if (pending.accountId !== activeAccountId) return false;
  if (pending.workspaceId && workspaceId && pending.workspaceId !== workspaceId) return false;
  const channelId = pending.channelId;
  pending = null;
  openChannel?.(channelId);
  return true;
}

export function navFromPush(
  data: Partial<PushNotificationData> | null | undefined,
  activeAccountId: string | null,
) {
  if (!data?.channelId || !data.accountId) return null;
  return {
    accountId: data.accountId,
    workspaceId: data.workspaceId,
    channelId: data.channelId,
    switchAccount: data.accountId !== activeAccountId,
  };
}
