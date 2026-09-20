import WebSocket from "ws";
import type { WsClientEvent, WsServerEvent } from "@relay/shared";
import { API_ORIGIN } from "./auth";
import { notifyIncomingMessage } from "./notifications";
import { sendToRenderer } from "./window";
import { relayChannels } from "../shared/ipc";

type CookieFn = (accountId: string) => string;

type AccountSocket = {
  accountId: string;
  socket: WebSocket | null;
  retries: number;
  queue: WsClientEvent[];
  meId: string | null;
  timer: NodeJS.Timeout | null;
  channels: Map<string, string>;
};

const sockets = new Map<string, AccountSocket>();
let subscribers = 0;
let cookieFor: CookieFn = () => "";
let onAccountEvent: ((accountId: string, event: WsServerEvent) => void) | null = null;

export function setRealtimeAccountListener(listener: ((accountId: string, event: WsServerEvent) => void) | null) {
  onAccountEvent = listener;
}

function socketUrl() {
  const url = new URL(API_ORIGIN);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

function flush(entry: AccountSocket) {
  while (entry.queue.length && entry.socket?.readyState === WebSocket.OPEN) {
    const event = entry.queue.shift();
    if (event) entry.socket.send(JSON.stringify(event));
  }
}

async function watchChannels(entry: AccountSocket, cookie: string) {
  try {
    const response = await fetch(new URL("/api/watch-channels", API_ORIGIN), { headers: { cookie } });
    if (!response.ok) return;
    const payload = (await response.json()) as { channels?: { id: string; workspaceId: string }[] };
    entry.channels.clear();
    for (const channel of payload.channels ?? []) {
      entry.channels.set(channel.id, channel.workspaceId);
      sendOn(entry, { type: "watch", channelId: channel.id });
    }
  } catch {
    /* ignore */
  }
}

function sendOn(entry: AccountSocket, event: WsClientEvent) {
  if (entry.socket?.readyState === WebSocket.OPEN) entry.socket.send(JSON.stringify(event));
  else entry.queue.push(event);
}

async function openSocket(entry: AccountSocket) {
  if (entry.socket && (entry.socket.readyState === WebSocket.OPEN || entry.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const cookie = cookieFor(entry.accountId);
  if (!cookie || cookie === "{}") return;

  const next = new WebSocket(socketUrl(), { headers: { cookie } });
  entry.socket = next;
  next.on("open", () => {
    entry.retries = 0;
    flush(entry);
    void watchChannels(entry, cookie);
    sendToRenderer(relayChannels.realtimeOpenEvent, { accountId: entry.accountId });
  });
  next.on("message", (raw) => {
    try {
      const event = JSON.parse(String(raw)) as WsServerEvent;
      if (event.type === "message.created") {
        notifyIncomingMessage(event.message, {
          meId: entry.meId ?? entry.accountId,
          accountId: entry.accountId,
          workspaceId: entry.channels.get(event.message.channelId),
        });
      }
      onAccountEvent?.(entry.accountId, event);
      sendToRenderer(relayChannels.realtimeEvent, { accountId: entry.accountId, event });
    } catch {
      /* ignore malformed frames */
    }
  });
  next.on("close", (code) => {
    if (entry.socket === next) entry.socket = null;
    if (subscribers <= 0 || code === 4401 || !sockets.has(entry.accountId)) return;
    const wait = Math.min(8000, 400 * 2 ** entry.retries++);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void openSocket(entry), wait);
  });
  next.on("error", () => {
    next.close();
  });
}

function ensureEntry(accountId: string): AccountSocket {
  let entry = sockets.get(accountId);
  if (entry) return entry;
  entry = {
    accountId,
    socket: null,
    retries: 0,
    queue: [],
    meId: accountId,
    timer: null,
    channels: new Map(),
  };
  sockets.set(accountId, entry);
  return entry;
}

function closeEntry(entry: AccountSocket) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.socket?.close();
  entry.socket = null;
  sockets.delete(entry.accountId);
}

export function syncRealtimeAccounts(accountIds: string[], getCookie: CookieFn) {
  cookieFor = getCookie;
  const keep = new Set(accountIds);
  for (const [id, entry] of sockets) {
    if (!keep.has(id)) closeEntry(entry);
  }
  for (const id of accountIds) ensureEntry(id);
  if (subscribers <= 0) return;
  for (const id of accountIds) void openSocket(ensureEntry(id));
}

export function openRealtime() {
  subscribers += 1;
  for (const entry of sockets.values()) void openSocket(entry);
}

export function closeRealtime() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0) return;
  for (const entry of sockets.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.socket?.close();
    entry.socket = null;
  }
}

export function sendRealtime(event: WsClientEvent, accountId?: string | null) {
  if (!event || typeof event !== "object" || typeof event.type !== "string") return;
  const id = accountId ?? [...sockets.keys()][0];
  if (!id) return;
  const entry = sockets.get(id);
  if (!entry) return;
  sendOn(entry, event);
}

export function sendRealtimeToActive(event: WsClientEvent, accountId: string | null) {
  sendRealtime(event, accountId);
}
