/// <reference types="vite/client" />

import type { RelayDesktop } from "../../shared/ipc";

declare global {
  interface Window {
    relayDesktop: RelayDesktop;
  }
}

export {};
