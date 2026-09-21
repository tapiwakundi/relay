import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  persistQueryClientSubscribe,
  type Persister,
} from "@tanstack/react-query-persist-client";
import * as Network from "expo-network";
import { queryClient } from "./query";
import {
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE,
  queryCacheStorageKey,
  sanitizePersistedClient,
  shouldPersistQuery,
} from "./query-persist-core";

const dehydrateOptions = { shouldDehydrateQuery: shouldPersistQuery };

function persisterFor(accountId: string): Persister {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: queryCacheStorageKey(accountId),
    throttleTime: 2000,
    serialize: (client) => JSON.stringify(sanitizePersistedClient(client)),
  });
}

type Attached = { accountId: string; persister: Persister; unsub: () => void };

let attached: Attached | null = null;
let lock = Promise.resolve();

function enqueue(fn: () => Promise<void>) {
  const next = lock.then(fn, fn);
  lock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function flushAttached() {
  if (!attached) return;
  await persistQueryClientSave({
    queryClient,
    persister: attached.persister,
    buster: QUERY_CACHE_BUSTER,
    dehydrateOptions,
  });
}

export function attachQueryPersistence(accountId: string) {
  return enqueue(async () => {
    if (attached?.accountId === accountId) return;
    if (attached) {
      await flushAttached();
      attached.unsub();
      attached = null;
    }
    queryClient.clear();
    const persister = persisterFor(accountId);
    try {
      await persistQueryClientRestore({
        queryClient,
        persister,
        maxAge: QUERY_CACHE_MAX_AGE,
        buster: QUERY_CACHE_BUSTER,
      });
    } catch {
      await persister.removeClient();
    }
    attached = {
      accountId,
      persister,
      unsub: persistQueryClientSubscribe({
        queryClient,
        persister,
        buster: QUERY_CACHE_BUSTER,
        dehydrateOptions,
      }),
    };
  });
}

export function detachQueryPersistence() {
  return enqueue(async () => {
    if (attached) {
      await flushAttached();
      attached.unsub();
      attached = null;
    }
    queryClient.clear();
  });
}

export function dropQueryPersistence(accountId: string) {
  return enqueue(async () => {
    if (attached?.accountId === accountId) {
      attached.unsub();
      await attached.persister.removeClient();
      attached = null;
      queryClient.clear();
      return;
    }
    await persisterFor(accountId).removeClient();
  });
}

export function flushQueryPersistence() {
  return flushAttached();
}

let onlineBound = false;

export function bindQueryOnlineManager() {
  if (onlineBound) return;
  onlineBound = true;
  onlineManager.setEventListener((setOnline) => {
    const net = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected ?? true);
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") void flushQueryPersistence();
    });
    void Network.getNetworkStateAsync().then((state) => setOnline(state.isConnected ?? true));
    return () => {
      net.remove();
      app.remove();
    };
  });
}
