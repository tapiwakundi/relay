import { QueryClient } from "@tanstack/react-query";
import type { WsServerEvent } from "@relay/shared";
import { applyWsEvent as applyChatEvent, clearChannelUnread as clearUnread, keys } from "@relay/chat";
import { QUERY_CACHE_GC_TIME, shouldPersistQuery } from "./query-persist-core";

export { keys };
export type { Bootstrap, Me, MeResponse } from "@relay/chat";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 0,
      gcTime: QUERY_CACHE_GC_TIME,
      refetchOnReconnect: true,
    },
    dehydrate: { shouldDehydrateQuery: shouldPersistQuery },
  },
});

let activeWorkspaceId: string | null = null;

export function setActiveWorkspaceId(id: string | null) {
  activeWorkspaceId = id;
}

export function getActiveWorkspaceId() {
  return activeWorkspaceId;
}

let viewedChannelId: string | null = null;

export function setViewedChannelId(id: string | null) {
  viewedChannelId = id;
}

export function getViewedChannelId() {
  return viewedChannelId;
}

export function clearChannelUnread(channelId: string) {
  clearUnread(queryClient, channelId);
}

export function applyWsEvent(ev: WsServerEvent, meId: string) {
  applyChatEvent(queryClient, ev, viewedChannelId, meId);
}
