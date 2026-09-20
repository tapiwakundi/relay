import { safeStorage } from "electron";
import type { MeResponse, RelayAccountSummary } from "@relay/shared";
import { unreadTotals } from "@relay/shared";
import { COOKIE_KEY, cookieHeaderFromJson } from "./account-store";
import { getAccountVault } from "./account-conf";
import { API_ORIGIN, authClient } from "./auth";
import { syncRealtimeAccounts, setRealtimeAccountListener } from "./realtime";
import { setAccountUnread } from "./notifications";
import { sendToRenderer } from "./window";
import { relayChannels, type AccountsSnapshot } from "../shared/ipc";

function decryptBlob(blob: string | undefined): string | null {
  if (!blob) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(blob, "base64"));
    }
  } catch {
    /* fall through */
  }
  return blob;
}

export function getActiveAccountId() {
  return getAccountVault().activeId();
}

export function cookieForAccount(accountId?: string | null): string {
  const vault = getAccountVault();
  const id = accountId ?? vault.activeId();
  if (!id) return authClient.getCookie();
  if (id === vault.activeId() && !vault.isAdding()) return authClient.getCookie();
  const json = decryptBlob(vault.get(id)?.blobs[COOKIE_KEY]);
  return cookieHeaderFromJson(json);
}

export function accountsSnapshot(): AccountsSnapshot {
  const vault = getAccountVault();
  return {
    accounts: vault.list(),
    activeAccountId: vault.activeId(),
    adding: vault.isAdding(),
  };
}

export function broadcastAccounts() {
  const snapshot = accountsSnapshot();
  for (const account of snapshot.accounts) {
    setAccountUnread(account.id, account.unreadTotal + account.mentionTotal);
  }
  sendToRenderer(relayChannels.accountsChanged, snapshot);
}

async function fetchMe(accountId: string): Promise<MeResponse | null> {
  const cookie = cookieForAccount(accountId);
  if (!cookie) return null;
  try {
    const response = await fetch(new URL("/api/me", API_ORIGIN), { headers: { cookie } });
    if (response.status === 401) {
      await dropInvalidAccount(accountId);
      return null;
    }
    if (!response.ok) return null;
    return (await response.json()) as MeResponse;
  } catch {
    return null;
  }
}

export async function refreshSummary(accountId: string) {
  const me = await fetchMe(accountId);
  if (!me) return;
  const totals = unreadTotals(me.workspaces ?? []);
  getAccountVault().update(accountId, {
    email: me.user.email,
    name: me.user.name,
    image: me.user.image,
    activeWorkspaceId: me.activeWorkspaceId,
    unreadTotal: totals.unreadTotal,
    mentionTotal: totals.mentionTotal,
  });
  broadcastAccounts();
}

export async function refreshAllSummaries() {
  await Promise.all(getAccountVault().ids().map((id) => refreshSummary(id)));
}

const refreshSoon = new Map<string, NodeJS.Timeout>();
function scheduleSummaryRefresh(accountId: string) {
  const prev = refreshSoon.get(accountId);
  if (prev) clearTimeout(prev);
  refreshSoon.set(
    accountId,
    setTimeout(() => {
      refreshSoon.delete(accountId);
      void refreshSummary(accountId);
    }, 400),
  );
}

setRealtimeAccountListener((accountId, event) => {
  if (event.type === "unread" || event.type === "message.created") scheduleSummaryRefresh(accountId);
});

export async function completeAuth() {
  const session = await authClient.getSession();
  const user = session.data?.user;
  if (!user) {
    if (getAccountVault().isAdding()) getAccountVault().cancelAdd();
    broadcastAccounts();
    return { error: { message: "No session" } as const, duplicate: false };
  }
  const result = getAccountVault().commit({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
  });
  await refreshSummary(user.id);
  syncRealtimeAccounts(getAccountVault().ids(), cookieForAccount);
  broadcastAccounts();
  return { error: null, duplicate: result.duplicate };
}

export async function hydrateAccounts() {
  const vault = getAccountVault();
  if (!vault.list().length) {
    const session = await authClient.getSession().catch(() => null);
    if (session?.data?.user) {
      await completeAuth();
      return;
    }
  } else {
    await authClient.getSession().catch(() => null);
    await refreshAllSummaries();
  }
  syncRealtimeAccounts(vault.ids(), cookieForAccount);
  broadcastAccounts();
}

export function beginAddAccount() {
  getAccountVault().beginAdd();
  broadcastAccounts();
}

export function cancelAddAccount() {
  if (!getAccountVault().isAdding()) return;
  getAccountVault().cancelAdd();
  void authClient.getSession().catch(() => null);
  broadcastAccounts();
}

export async function switchAccount(accountId: string) {
  const vault = getAccountVault();
  if (vault.activeId() === accountId && !vault.isAdding()) return;
  vault.setActive(accountId);
  await authClient.getSession().catch(() => null);
  syncRealtimeAccounts(vault.ids(), cookieForAccount);
  broadcastAccounts();
}

export async function dropInvalidAccount(accountId: string) {
  const vault = getAccountVault();
  const next = vault.remove(accountId);
  if (next) {
    vault.setActive(next);
    await authClient.getSession().catch(() => null);
  }
  syncRealtimeAccounts(vault.ids(), cookieForAccount);
  broadcastAccounts();
}

export async function signOutAccount(accountId?: string | null) {
  const vault = getAccountVault();
  const id = accountId ?? vault.activeId();
  if (!id) {
    await authClient.signOut().catch(() => null);
    broadcastAccounts();
    syncRealtimeAccounts([], cookieForAccount);
    return;
  }
  const wasActive = vault.activeId() === id;
  if (wasActive) {
    await authClient.signOut().catch(() => null);
  } else {
    const cookie = cookieForAccount(id);
    if (cookie) {
      await fetch(new URL("/api/auth/sign-out", API_ORIGIN), {
        method: "POST",
        headers: { cookie },
      }).catch(() => null);
    }
  }
  const next = vault.remove(id);
  if (next) {
    vault.setActive(next);
    await authClient.getSession().catch(() => null);
  }
  syncRealtimeAccounts(vault.ids(), cookieForAccount);
  broadcastAccounts();
}

export type { RelayAccountSummary };
