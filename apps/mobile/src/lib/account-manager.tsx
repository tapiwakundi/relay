import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { MeResponse, RelayAccountSummary } from "@relay/shared";
import { unreadTotals, workspacePreviewFromMe } from "@relay/shared";
import {
  accountVault,
  api,
  discardPendingAuth,
  extractCredentials,
  pendingAuthClient,
  setActiveAccountId,
  setAddingAccount,
  signOut,
  signOutClient,
} from "./auth";
import { attachQueryPersistence, detachQueryPersistence, dropQueryPersistence } from "./query-persist";
import {
  reconnectAccountSockets,
  addRealtimeListener,
  sendRealtime,
  syncAccountSockets,
  closeAccountSockets,
} from "./realtime-hub";
import { onAccountExpired, suppressAccountExpiry } from "./session";

type AccountCtx = {
  ready: boolean;
  accounts: RelayAccountSummary[];
  activeAccountId: string | null;
  adding: boolean;
  switchAccount: (id: string) => Promise<void>;
  startAddAccount: () => void;
  cancelAddAccount: () => Promise<void>;
  completeAuth: () => Promise<{ duplicate: boolean }>;
  removeAccount: (id?: string | null) => Promise<void>;
  refreshAccounts: () => Promise<void>;
};

const Ctx = createContext<AccountCtx | null>(null);

async function summariesFromVault(): Promise<{ accounts: RelayAccountSummary[]; activeAccountId: string | null }> {
  const index = await accountVault.snapshot();
  return { accounts: Object.values(index.accounts), activeAccountId: index.activeAccountId };
}

const refreshGen = new Map<string, number>();

async function refreshOne(accountId: string) {
  const gen = (refreshGen.get(accountId) ?? 0) + 1;
  refreshGen.set(accountId, gen);
  try {
    const me = await api<MeResponse>("/api/me", undefined, accountId);
    if (refreshGen.get(accountId) !== gen) return;
    const totals = unreadTotals(me.workspaces ?? []);
    await accountVault.update(accountId, {
      email: me.user.email,
      name: me.user.name,
      image: me.user.image,
      activeWorkspaceId: me.activeWorkspaceId,
      unreadTotal: totals.unreadTotal,
      mentionTotal: totals.mentionTotal,
      workspace: workspacePreviewFromMe(me),
    });
  } catch {
    /* expired accounts are handled via 401 */
  }
}

let pushToken: string | null = null;
const removals = new Set<string>();

function expoProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export async function currentPushToken() {
  if (pushToken) return pushToken;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Messages",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1A5FB4",
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;
    const projectId = expoProjectId();
    if (!projectId) return null;
    const device = await Notifications.getExpoPushTokenAsync({ projectId });
    pushToken = device.data;
    return pushToken;
  } catch (err) {
    console.warn("[push] failed to get Expo token", err);
    return null;
  }
}

async function registerPush(accountId: string) {
  try {
    const token = await currentPushToken();
    if (!token) return;
    await api("/api/device-tokens", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS }),
    }, accountId);
  } catch (err) {
    console.warn("[push] failed to register token", err);
  }
}

async function unregisterPush(accountId: string) {
  if (!pushToken) return;
  try {
    await api("/api/device-tokens", {
      method: "DELETE",
      body: JSON.stringify({ token: pushToken }),
    }, accountId);
  } catch {
    /* ignore */
  }
}

export function AccountManager({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<RelayAccountSummary[]>([]);
  const [activeAccountId, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const publish = useCallback(async () => {
    const next = await summariesFromVault();
    setAccounts(next.accounts);
    setActive(next.activeAccountId);
    setActiveAccountId(next.activeAccountId);
    await syncAccountSockets(next.accounts.map((account) => account.id));
  }, []);

  const refreshAccounts = useCallback(async () => {
    const ids = (await accountVault.list()).map((account) => account.id);
    await Promise.all(ids.map((id) => refreshOne(id)));
    await publish();
  }, [publish]);

  const switchAccount = useCallback(
    async (id: string) => {
      if (id === activeAccountId) return;
      setReady(false);
      await attachQueryPersistence(id);
      await accountVault.setActive(id);
      await publish();
      setReady(true);
    },
    [activeAccountId, publish],
  );

  const removeAccount = useCallback(
    async (id?: string | null) => {
      const target = id ?? activeAccountId;
      if (!target || removals.has(target)) return;
      removals.add(target);
      const releaseExpiry = suppressAccountExpiry(target);
      try {
        if (!(await accountVault.snapshot()).accounts[target]) return;
        if (target === activeAccountId) await signOut();
        await unregisterPush(target);
        const next = await accountVault.remove(target);
        setReady(false);
        await dropQueryPersistence(target);
        if (next) await attachQueryPersistence(next);
        else await detachQueryPersistence();
        setActiveAccountId(next);
        await publish();
        setReady(true);
      } finally {
        releaseExpiry();
        removals.delete(target);
      }
    },
    [activeAccountId, publish],
  );

  const completeAuth = useCallback(async () => {
    const creds = await extractCredentials();
    if (!creds) {
      if (adding) {
        setAdding(false);
        setAddingAccount(false);
      }
      return { duplicate: false };
    }
    const existing = (await accountVault.list()).some((account) => account.id === creds.id);
    if (adding && existing) {
      await signOutClient(pendingAuthClient).catch(() => null);
      await attachQueryPersistence(creds.id);
      await accountVault.setActive(creds.id);
      await publish();
      setAdding(false);
      setAddingAccount(false);
      return { duplicate: true };
    }
    await accountVault.upsert(creds);
    await accountVault.setActive(creds.id);
    if (adding) await discardPendingAuth();
    await attachQueryPersistence(creds.id);
    await registerPush(creds.id);
    await refreshOne(creds.id);
    await publish();
    setAdding(false);
    setAddingAccount(false);
    return { duplicate: existing };
  }, [adding, publish]);

  const startAddAccount = useCallback(() => {
    setAdding(true);
    setAddingAccount(true);
  }, []);

  const cancelAddAccount = useCallback(async () => {
    await signOutClient(pendingAuthClient).catch(() => null);
    setAdding(false);
    setAddingAccount(false);
  }, []);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      let index = await accountVault.snapshot();
      if (cancel) return;
      if (!Object.keys(index.accounts).length) {
        try {
          await accountVault.migrateIfEmpty(await extractCredentials());
          index = await accountVault.snapshot();
        } catch {
          /* getSession can fail offline; login still works */
        }
      }
      if (index.activeAccountId) await attachQueryPersistence(index.activeAccountId);
      else await detachQueryPersistence();
      if (cancel) return;
      await publish();
      if (!cancel) setReady(true);
      const ids = (await accountVault.list()).map((account) => account.id);
      await Promise.all(ids.map((id) => registerPush(id)));
      await refreshAccounts();
    })();
    return () => {
      cancel = true;
    };
  }, [publish, refreshAccounts]);

  useEffect(() => {
    return addRealtimeListener(
      (event, accountId) => {
        if (event.type === "unread" || event.type === "message.created") {
          void refreshOne(accountId).then(() => publish());
        }
      },
      (accountId) => {
        void api<{ channels: { id: string }[] }>("/api/watch-channels", undefined, accountId)
          .then((res) => {
            for (const channel of res.channels) sendRealtime({ type: "watch", channelId: channel.id }, accountId);
          })
          .catch(() => null);
      },
    );
  }, [publish]);

  useEffect(() => onAccountExpired((id) => {
    void removeAccount(id);
  }), [removeAccount]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        closeAccountSockets();
        return;
      }
      if (state !== "active") return;
      void (async () => {
        const ids = (await accountVault.list()).map((account) => account.id);
        await reconnectAccountSockets(ids);
        await refreshAccounts();
      })();
    });
    return () => sub.remove();
  }, [refreshAccounts]);

  const value = useMemo<AccountCtx>(
    () => ({
      ready,
      accounts,
      activeAccountId,
      adding,
      switchAccount,
      startAddAccount,
      cancelAddAccount,
      completeAuth,
      removeAccount,
      refreshAccounts,
    }),
    [
      ready,
      accounts,
      activeAccountId,
      adding,
      switchAccount,
      startAddAccount,
      cancelAddAccount,
      completeAuth,
      removeAccount,
      refreshAccounts,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccounts() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AccountManager missing");
  return ctx;
}
