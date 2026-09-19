import type { WsClientEvent, WsServerEvent } from "@relay/shared";

export function connectWs(onEvent: (event: WsServerEvent) => void, onOpen?: () => void) {
  let closed = false;
  const stop = window.relayDesktop.connectRealtime(
    (event) => {
      if (!closed) onEvent(event as WsServerEvent);
    },
    () => {
      if (!closed) onOpen?.();
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
