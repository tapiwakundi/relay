import type { WsClientEvent, WsServerEvent } from "@relay/shared";
import { getAccessToken } from "./auth";

export function connectWs(onEvent: (e: WsServerEvent) => void, onOpen?: () => void) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let ws: WebSocket | null = null;
  let closed = false;
  let retries = 0;
  const queue: WsClientEvent[] = [];

  const flush = () => {
    while (queue.length && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(queue.shift()));
    }
  };

  const open = async () => {
    const token = await getAccessToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    ws = new WebSocket(`${proto}://${location.host}/ws${qs}`);
    ws.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(String(ev.data)) as WsServerEvent);
      } catch {
        /* ignore */
      }
    };
    ws.onopen = () => {
      retries = 0;
      onOpen?.();
      flush();
    };
    ws.onclose = () => {
      if (closed) return;
      const wait = Math.min(8000, 400 * 2 ** retries++);
      setTimeout(() => void open(), wait);
    };
  };
  void open();

  return {
    send(event: WsClientEvent) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
      else queue.push(event);
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
}
