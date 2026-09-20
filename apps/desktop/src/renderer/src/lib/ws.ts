import type { WsClientEvent, WsServerEvent } from "@relay/shared";

export function connectWs(
  onEvent: (event: WsServerEvent, accountId: string) => void,
  onOpen?: (accountId?: string) => void,
) {
  let closed = false;
  const stop = window.relayDesktop.connectRealtime(
    (envelope) => {
      if (closed) return;
      onEvent(envelope.event as WsServerEvent, envelope.accountId);
    },
    (accountId) => {
      if (!closed) onOpen?.(accountId);
    },
  );
  return {
    send(event: WsClientEvent) {
      if (!closed) void window.relayDesktop.sendRealtime(event);
    },
    close() {
      closed = true;
      stop();
    },
  };
}
