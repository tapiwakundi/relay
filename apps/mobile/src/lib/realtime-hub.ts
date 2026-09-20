import type { WsClientEvent, WsServerEvent } from "@relay/shared";
import { accountVault } from "./auth";
import { connectWs, type SocketConn } from "./ws";

type Handlers = {
  onEvent: (event: WsServerEvent, accountId: string) => void;
  onOpen?: (accountId: string) => void;
};

type EventListener = (event: WsServerEvent, accountId: string) => void;
type OpenListener = (accountId: string) => void;

const sockets = new Map<string, SocketConn>();
const eventListeners = new Set<EventListener>();
const openListeners = new Set<OpenListener>();

export function addRealtimeListener(onEvent: EventListener, onOpen?: OpenListener) {
  eventListeners.add(onEvent);
  if (onOpen) openListeners.add(onOpen);
  return () => {
    eventListeners.delete(onEvent);
    if (onOpen) openListeners.delete(onOpen);
  };
}

export function setRealtimeHandlers(next: Handlers | null) {
  eventListeners.clear();
  openListeners.clear();
  if (next) {
    eventListeners.add(next.onEvent);
    if (next.onOpen) openListeners.add(next.onOpen);
  }
}

export async function syncAccountSockets(accountIds: string[]) {
  const keep = new Set(accountIds);
  for (const [id, conn] of sockets) {
    if (!keep.has(id)) {
      conn.close();
      sockets.delete(id);
    }
  }
  await Promise.all(
    accountIds.map(async (id) => {
      if (sockets.has(id)) return;
      const creds = await accountVault.credentials(id);
      if (!creds?.token) return;
      const conn = connectWs(
        (event) => {
          for (const listener of eventListeners) listener(event, id);
        },
        () => {
          for (const listener of openListeners) listener(id);
        },
        creds.token,
      );
      sockets.set(id, conn);
    }),
  );
}

export function sendRealtime(event: WsClientEvent, accountId: string | null) {
  if (!accountId) return;
  sockets.get(accountId)?.send(event);
}

export function closeAccountSockets() {
  for (const conn of sockets.values()) conn.close();
  sockets.clear();
}

export async function reconnectAccountSockets(accountIds: string[]) {
  closeAccountSockets();
  await syncAccountSockets(accountIds);
}
