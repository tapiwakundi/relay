import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { MeResponse, RelayAccountSummary } from "@relay/shared";
import { unreadTotals } from "@relay/shared";
import {
  accountVault,
  api,
  extractCredentials,
  liveClient,
  pendingAuthClient,
  setActiveAccountId,
  setAddingAccount,
  signOut,
  signOutClient,
} from "./auth";
import { queryClient } from "./query";
import { reconnectAccountSockets, addRealtimeListener, sendRealtime, syncAccountSockets } from "./realtime-hub";
import { onAccountExpired } from "./session";

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

async function refreshOne(accountId: string) {
  try {
    const me = await api<MeResponse>("/api/me", undefined, accountId);
    const totals = unreadTotals(me.workspaces ?? []);
    await accountVault.update(accountId, {
      email: me.user.email,
      name: me.user.name,
      image: me.user.image,
      activeWorkspaceId: me.activeWorkspaceId,
      unreadTotal: totals.unreadTotal,
      mentionTotal: totals.mentionTotal,
    });
  } catch {
    /* expired accounts are handled via 401 */
  }
}

let pushToken: string | null = null;

export async function currentPushToken() {
  if (pushToken) return pushToken;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;
    const device = await Notifications.getExpoPushTokenAsync();
    pushToken = device.data;
    return pushToken;
  } catch {
    return null;
  }
}

async function registerPush(accountId: string) {
  const token = await currentPushToken();
  if (!token) return;
  await api("/api/device-tokens", {
    method: "POST",
    body: JSON.stringify({ token, platform: Platform.OS }),
  }, accountId);
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
      queryClient.clear();
      await accountVault.setActive(id);
      await publish();
    },
    [activeAccountId, publish],
  );

  const removeAccount = useCallback(
    async (id?: string | null) => {
      const target = id ?? activeAccountId;
      if (!target) return;
      if (target === activeAccountId) await signOut();
      await unregisterPush(target);
      const next = await accountVault.remove(target);
      queryClient.clear();
      setActiveAccountId(next);
      await publish();
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
      setAdding(false);
      setAddingAccount(false);
      queryClient.clear();
      await accountVault.setActive(creds.id);
      await publish();
      return { duplicate: true };
    }
    await accountVault.upsert(creds);
    await accountVault.setActive(creds.id);
    if (adding) await signOutClient(pendingAuthClient).catch(() => null);
    setAdding(false);
    setAddingAccount(false);
    queryClient.clear();
    await registerPush(creds.id);
    await refreshOne(creds.id);
    await publish();
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
      const index = await accountVault.snapshot();
      if (!Object.keys(index.accounts).length) {
        await accountVault.migrateIfEmpty(await extractCredentials());
      }
      if (cancel) return;
      await publish();
      const ids = (await accountVault.list()).map((account) => account.id);
      await Promise.all(ids.map((id) => registerPush(id)));
      await refreshAccounts();
      if (!cancel) setReady(true);
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
