import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

export const QUERY_CACHE_PREFIX = "relay.rq.v1.";
export const QUERY_CACHE_BUSTER = "v1";
export const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
export const QUERY_CACHE_GC_TIME = 1000 * 60 * 60 * 24;

const PERSISTED_ROOTS = new Set([
  "me",
  "bootstrap",
  "messages",
  "message",
  "activity",
  "files",
  "later",
  "threads",
  "invites",
]);

export function queryCacheStorageKey(accountId: string) {
  return `${QUERY_CACHE_PREFIX}${accountId}`;
}

export function shouldPersistQuery(query: Query) {
  if (!defaultShouldDehydrateQuery(query)) return false;
  const root = query.queryKey[0];
  return typeof root === "string" && PERSISTED_ROOTS.has(root);
}

export function sanitizePersistedClient(client: PersistedClient): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      mutations: [],
      queries: client.clientState.queries.map((query) => {
        if (query.queryKey[0] !== "messages") return query;
        const data = query.state.data as { messages?: Array<{ pending?: boolean }> } | undefined;
        if (!data?.messages?.some((message) => message.pending)) return query;
        return {
          ...query,
          state: {
            ...query.state,
            data: { ...data, messages: data.messages.filter((message) => !message.pending) },
          },
        };
      }),
    },
  };
}
