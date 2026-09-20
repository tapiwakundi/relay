import type { ChatMessage, PushNotificationData } from "@relay/shared";
import { inArray } from "drizzle-orm";
import type { AppDb } from "./db/index.js";
import { deviceToken } from "./db/schema.js";
import { removeDeviceTokens } from "./domain.js";
import type { Hub, UnreadBump } from "./hub.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 100;

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

export type PushSender = typeof fetch;

function expoHeaders() {
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
    "content-type": "application/json",
  };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function bodyPreview(message: ChatMessage) {
  const text = message.body?.trim() || message.fileName || "New message";
  return text.slice(0, 180);
}

export async function notifyUnreadPush(
  db: AppDb,
  hub: Hub,
  bumps: UnreadBump[],
  message: ChatMessage,
  send: PushSender = fetch,
) {
  const offline = bumps.filter((bump) => !hub.isOnline(bump.userId) && !hub.isViewing(bump.userId, bump.channelId));
  if (!offline.length) return { sent: 0, removed: [] as string[] };

  const userIds = [...new Set(offline.map((bump) => bump.userId))];
  const rows = await db.select().from(deviceToken).where(inArray(deviceToken.userId, userIds));
  if (!rows.length) return { sent: 0, removed: [] as string[] };

  const bumpByUser = new Map(offline.map((bump) => [bump.userId, bump]));
  const messages: {
    to: string;
    title: string;
    body: string;
    sound: "default";
    data: PushNotificationData;
  }[] = [];
  for (const row of rows) {
    const bump = bumpByUser.get(row.userId);
    if (!bump) continue;
    messages.push({
      to: row.token,
      title: message.userName || "Relay",
      body: bodyPreview(message),
      sound: "default",
      data: {
        accountId: row.userId,
        workspaceId: bump.workspaceId,
        channelId: bump.channelId,
        messageId: message.id,
      },
    });
  }
  if (!messages.length) return { sent: 0, removed: [] as string[] };

  const invalid = new Set<string>();
  const ticketToToken = new Map<string, string>();
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    const res = await send(EXPO_PUSH_URL, {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) continue;
    const payload = (await res.json()) as { data?: ExpoTicket[] };
    for (const [index, ticket] of (payload.data ?? []).entries()) {
      const token = chunk[index]?.to ?? "";
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        invalid.add(token);
      } else if (ticket.status === "ok" && ticket.id) {
        ticketToToken.set(ticket.id, token);
      }
    }
  }

  const ticketIds = [...ticketToToken.keys()];
  if (ticketIds.length) {
    for (let i = 0; i < ticketIds.length; i += BATCH) {
      const ids = ticketIds.slice(i, i + BATCH);
      const res = await send(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as { data?: Record<string, ExpoReceipt> };
      for (const [ticketId, receipt] of Object.entries(payload.data ?? {})) {
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          const token = ticketToToken.get(ticketId);
          if (token) invalid.add(token);
        }
      }
    }
  }

  const removed = [...invalid].filter(Boolean);
  if (removed.length) await removeDeviceTokens(db, removed);
  return { sent: messages.length, removed };
}
