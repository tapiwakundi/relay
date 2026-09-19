import WebSocket from "ws";
import type { WsClientEvent, WsServerEvent } from "@relay/shared";
import { API_ORIGIN, authClient } from "./auth";
import { notifyIncomingMessage } from "./notifications";
import { sendToRenderer } from "./window";

let socket: WebSocket | null = null;
let subscribers = 0;
let retries = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let meId: string | null = null;
const queue: WsClientEvent[] = [];

function socketUrl() {
  const url = new URL(API_ORIGIN);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

function flush() {
  while (queue.length && socket?.readyState === WebSocket.OPEN) {
    const event = queue.shift();
    if (event) socket.send(JSON.stringify(event));
  }
}

async function openSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const cookie = authClient.getCookie();
  if (!cookie || cookie === "{}") return;
  try {
    const session = await authClient.getSession();
    meId = session.data?.user?.id ?? null;
  } catch {
    meId = null;
  }

  const next = new WebSocket(socketUrl(), { headers: { cookie } });
  socket = next;
  next.on("open", () => {
    retries = 0;
    flush();
    sendToRenderer("relay:realtime-open-event");
  });
  next.on("message", (raw) => {
    try {
      const event = JSON.parse(String(raw)) as WsServerEvent;
      if (event.type === "message.created") notifyIncomingMessage(event.message, meId);
      sendToRenderer("relay:realtime-event", event);
    } catch {
      /* ignore malformed frames */
    }
  });
  next.on("close", (code) => {
    if (socket === next) socket = null;
    if (subscribers <= 0 || code === 4401) return;
    const wait = Math.min(8000, 400 * 2 ** retries++);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void openSocket(), wait);
  });
  next.on("error", () => {
    next.close();
  });
}

export function openRealtime() {
  subscribers += 1;
  void openSocket();
}

export function closeRealtime() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
}

export function sendRealtime(event: WsClientEvent) {
  if (!event || typeof event !== "object" || typeof event.type !== "string") return;
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  else queue.push(event);
}
