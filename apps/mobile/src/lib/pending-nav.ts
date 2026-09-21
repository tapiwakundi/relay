import type { PushNotificationData } from "@relay/shared";

let pending: PushNotificationData | null = null;
let openChannel: ((channelId: string) => void) | null = null;
let answerHuddle: ((channelId: string) => void) | null = null;
let showHuddle: ((channelId: string) => void) | null = null;
const seenNotifications = new Set<string>();

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

export function setPendingHuddleAnswerer(fn: ((channelId: string) => void) | null) {
  answerHuddle = fn;
}

export function setHuddleScreenOpener(fn: ((channelId: string) => void) | null) {
  showHuddle = fn;
}

export function openHuddleScreen(channelId: string) {
  showHuddle?.(channelId);
}

export function pushFields(data: unknown): Partial<PushNotificationData> {
  if (!data || typeof data !== "object") return {};
  const raw = data as Record<string, unknown>;
  const nested = raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : null;
  const source = nested?.channelId ? nested : raw;
  const huddleId = typeof source.huddleId === "string" ? source.huddleId : undefined;
  const kind = source.kind === "huddle" || huddleId ? "huddle" : source.kind === "message" ? "message" : undefined;
  return {
    kind,
    accountId: typeof source.accountId === "string" ? source.accountId : undefined,
    workspaceId: typeof source.workspaceId === "string" ? source.workspaceId : undefined,
    channelId: typeof source.channelId === "string" ? source.channelId : undefined,
    messageId: typeof source.messageId === "string" ? source.messageId : undefined,
    huddleId,
    callerName: typeof source.callerName === "string" ? source.callerName : undefined,
  };
}

export function claimNotification(id: string | null | undefined) {
  if (!id || seenNotifications.has(id)) return false;
  seenNotifications.add(id);
  return true;
}

export function openPendingIfReady(activeAccountId: string | null, workspaceId: string | null) {
  if (!pending?.channelId || !pending.accountId) return false;
  if (pending.accountId !== activeAccountId) return false;
  if (pending.workspaceId && workspaceId && pending.workspaceId !== workspaceId) return false;
  const channelId = pending.channelId;
  const kind = pending.kind;
  pending = null;
  openChannel?.(channelId);
  if (kind === "huddle") answerHuddle?.(channelId);
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
