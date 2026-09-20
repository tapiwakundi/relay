import type { RelayAccountSummary } from "@relay/shared";

export const COOKIE_KEY = "better-auth.cookie";
export const CACHE_KEY = "better-auth.local_cache";
export const VAULT_KEY = "relay.accountVault";

export type AccountRecord = RelayAccountSummary & {
  blobs: Record<string, string>;
};

export type AccountVaultState = {
  version: 1;
  accounts: Record<string, AccountRecord>;
  activeAccountId: string | null;
  adding: boolean;
  pendingBlobs: Record<string, string>;
};

export type AccountVaultBackend = {
  read(): AccountVaultState | null;
  write(state: AccountVaultState): void;
  readLegacy(key: string): unknown;
  writeLegacy(key: string, value: string): void;
  deleteLegacy(key: string): void;
};

export type AccountProfile = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  activeWorkspaceId?: string | null;
  unreadTotal?: number;
  mentionTotal?: number;
};

function emptyState(): AccountVaultState {
  return {
    version: 1,
    accounts: {},
    activeAccountId: null,
    adding: false,
    pendingBlobs: {},
  };
}

function asState(value: unknown): AccountVaultState | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Partial<AccountVaultState>;
  if (rec.version !== 1 || !rec.accounts || typeof rec.accounts !== "object") return null;
  return {
    version: 1,
    accounts: rec.accounts,
    activeAccountId: typeof rec.activeAccountId === "string" ? rec.activeAccountId : null,
    adding: Boolean(rec.adding),
    pendingBlobs: rec.pendingBlobs && typeof rec.pendingBlobs === "object" ? rec.pendingBlobs : {},
  };
}

function summaryOf(account: AccountRecord): RelayAccountSummary {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    image: account.image,
    activeWorkspaceId: account.activeWorkspaceId,
    unreadTotal: account.unreadTotal,
    mentionTotal: account.mentionTotal,
  };
}

export function cookieHeaderFromJson(json: string | null | undefined): string {
  if (!json) return "";
  let parsed: Record<string, { value?: unknown; expires?: string | null }> = {};
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return "";
  }
  const pairs: string[] = [];
  for (const [key, entry] of Object.entries(parsed)) {
    if (!entry || typeof entry.value !== "string") continue;
    if (entry.expires && new Date(entry.expires) < new Date()) continue;
    pairs.push(`${key}=${encodeURIComponent(entry.value)}`);
  }
  return pairs.join("; ");
}

export function createAccountVault(backend: AccountVaultBackend) {
  const load = (): AccountVaultState => asState(backend.read()) ?? emptyState();
  const save = (state: AccountVaultState) => backend.write(state);

  const currentBlobs = (state: AccountVaultState): Record<string, string> => {
    if (state.adding) return { ...state.pendingBlobs };
    if (state.activeAccountId && state.accounts[state.activeAccountId]) {
      return { ...state.accounts[state.activeAccountId].blobs };
    }
    const blobs: Record<string, string> = {};
    for (const key of [COOKIE_KEY, CACHE_KEY]) {
      const value = backend.readLegacy(key);
      if (typeof value === "string" && value) blobs[key] = value;
    }
    return blobs;
  };

  return {
    snapshot: load,
    list(): RelayAccountSummary[] {
      return Object.values(load().accounts).map(summaryOf);
    },
    get(id: string): AccountRecord | null {
      return load().accounts[id] ?? null;
    },
    activeId(): string | null {
      return load().activeAccountId;
    },
    isAdding(): boolean {
      return load().adding;
    },
    getBlob(name: string): string | null {
      const value = currentBlobs(load())[name];
      return typeof value === "string" ? value : null;
    },
    setBlob(name: string, value: unknown) {
      const state = load();
      const serialized = value == null ? "" : String(value);
      if (state.adding) {
        state.pendingBlobs[name] = serialized;
        save(state);
        return;
      }
      if (state.activeAccountId && state.accounts[state.activeAccountId]) {
        state.accounts[state.activeAccountId].blobs[name] = serialized;
        save(state);
        return;
      }
      backend.writeLegacy(name, serialized);
    },
    beginAdd() {
      const state = load();
      if (state.adding) throw new Error("Already adding an account");
      state.adding = true;
      state.pendingBlobs = {};
      save(state);
    },
    cancelAdd() {
      const state = load();
      state.adding = false;
      state.pendingBlobs = {};
      save(state);
    },
    commit(profile: AccountProfile): { duplicate: boolean; accountId: string } {
      const state = load();
      const blobs = currentBlobs(state);
      const existing = state.accounts[profile.id];
      if (state.adding && existing) {
        state.adding = false;
        state.pendingBlobs = {};
        state.activeAccountId = existing.id;
        save(state);
        return { duplicate: true, accountId: existing.id };
      }
      const record: AccountRecord = {
        id: profile.id,
        email: profile.email ?? existing?.email ?? "",
        name: profile.name ?? existing?.name ?? profile.email ?? "Account",
        image: profile.image ?? existing?.image ?? null,
        activeWorkspaceId: profile.activeWorkspaceId ?? existing?.activeWorkspaceId ?? null,
        unreadTotal: profile.unreadTotal ?? existing?.unreadTotal ?? 0,
        mentionTotal: profile.mentionTotal ?? existing?.mentionTotal ?? 0,
        blobs: { ...(existing?.blobs ?? {}), ...blobs },
      };
      state.accounts[profile.id] = record;
      state.activeAccountId = profile.id;
      state.adding = false;
      state.pendingBlobs = {};
      save(state);
      backend.deleteLegacy(COOKIE_KEY);
      backend.deleteLegacy(CACHE_KEY);
      return { duplicate: false, accountId: profile.id };
    },
    setActive(id: string) {
      const state = load();
      if (!state.accounts[id]) throw new Error("Unknown account");
      state.activeAccountId = id;
      state.adding = false;
      state.pendingBlobs = {};
      save(state);
    },
    update(id: string, patch: Partial<AccountProfile>) {
      const state = load();
      const account = state.accounts[id];
      if (!account) return;
      if (patch.email != null) account.email = patch.email;
      if (patch.name != null) account.name = patch.name;
      if (patch.image !== undefined) account.image = patch.image;
      if (patch.activeWorkspaceId !== undefined) account.activeWorkspaceId = patch.activeWorkspaceId;
      if (patch.unreadTotal != null) account.unreadTotal = patch.unreadTotal;
      if (patch.mentionTotal != null) account.mentionTotal = patch.mentionTotal;
      save(state);
    },
    remove(id: string): string | null {
      const state = load();
      delete state.accounts[id];
      if (state.activeAccountId === id) {
        state.activeAccountId = Object.keys(state.accounts)[0] ?? null;
      }
      save(state);
      return state.activeAccountId;
    },
    ids(): string[] {
      return Object.keys(load().accounts);
    },
  };
}

export type AccountVault = ReturnType<typeof createAccountVault>;
