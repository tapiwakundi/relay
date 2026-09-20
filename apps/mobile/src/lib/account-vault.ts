import type { RelayAccountSummary } from "@relay/shared";

export const INDEX_KEY = "relay.accounts.index.v1";
export const CRED_PREFIX = "relay.account.cred.";
export const CHUNK_SIZE = 1800;

export type AccountCredentials = {
  token: string;
  cookie: string;
};

export type StoredAccount = RelayAccountSummary & AccountCredentials;

export type AccountIndex = {
  version: 1;
  accounts: Record<string, RelayAccountSummary>;
  activeAccountId: string | null;
};

export type KvStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

function emptyIndex(): AccountIndex {
  return { version: 1, accounts: {}, activeAccountId: null };
}

export function splitChunks(value: string, size = CHUNK_SIZE): string[] {
  if (!value) return [];
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts;
}

export function joinChunks(parts: string[]): string {
  return parts.join("");
}

function credKey(id: string) {
  return `${CRED_PREFIX}${id}`;
}

async function writeChunks(store: KvStore, key: string, value: string) {
  const parts = splitChunks(value);
  const prev = Number((await store.getItem(`${key}.n`)) ?? "0");
  await store.setItem(`${key}.n`, String(parts.length));
  await Promise.all(parts.map((part, index) => store.setItem(`${key}.${index}`, part)));
  for (let i = parts.length; i < prev; i += 1) await store.deleteItem(`${key}.${i}`);
}

async function readChunks(store: KvStore, key: string): Promise<string | null> {
  const count = Number((await store.getItem(`${key}.n`)) ?? "0");
  if (!count) {
    const legacy = await store.getItem(key);
    return legacy;
  }
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    parts.push((await store.getItem(`${key}.${i}`)) ?? "");
  }
  return joinChunks(parts);
}

async function deleteChunks(store: KvStore, key: string) {
  const count = Number((await store.getItem(`${key}.n`)) ?? "0");
  await store.deleteItem(`${key}.n`);
  await store.deleteItem(key);
  for (let i = 0; i < Math.max(count, 1); i += 1) await store.deleteItem(`${key}.${i}`);
}

function asIndex(value: string | null): AccountIndex {
  if (!value) return emptyIndex();
  try {
    const parsed = JSON.parse(value) as AccountIndex;
    if (parsed.version !== 1 || !parsed.accounts) return emptyIndex();
    return parsed;
  } catch {
    return emptyIndex();
  }
}

export function createMobileAccountVault(store: KvStore) {
  const load = async () => asIndex(await store.getItem(INDEX_KEY));
  const save = async (index: AccountIndex) => store.setItem(INDEX_KEY, JSON.stringify(index));

  return {
    async list(): Promise<RelayAccountSummary[]> {
      return Object.values((await load()).accounts);
    },
    async snapshot(): Promise<AccountIndex> {
      return load();
    },
    async activeId(): Promise<string | null> {
      return (await load()).activeAccountId;
    },
    async credentials(id: string): Promise<AccountCredentials | null> {
      const raw = await readChunks(store, credKey(id));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as AccountCredentials;
        if (!parsed.token && !parsed.cookie) return null;
        return { token: parsed.token ?? "", cookie: parsed.cookie ?? "" };
      } catch {
        return null;
      }
    },
    async upsert(account: StoredAccount) {
      const index = await load();
      const { token, cookie, ...summary } = account;
      const prev = index.accounts[account.id];
      index.accounts[account.id] = {
        id: account.id,
        email: summary.email,
        name: summary.name,
        image: summary.image,
        activeWorkspaceId: summary.activeWorkspaceId,
        unreadTotal: summary.unreadTotal ?? prev?.unreadTotal ?? 0,
        mentionTotal: summary.mentionTotal ?? prev?.mentionTotal ?? 0,
        workspace: summary.workspace ?? prev?.workspace ?? null,
      };
      if (!index.activeAccountId) index.activeAccountId = account.id;
      await save(index);
      await writeChunks(store, credKey(account.id), JSON.stringify({ token, cookie }));
    },
    async setActive(id: string) {
      const index = await load();
      if (!index.accounts[id]) throw new Error("Unknown account");
      index.activeAccountId = id;
      await save(index);
    },
    async update(id: string, patch: Partial<RelayAccountSummary>) {
      const index = await load();
      const current = index.accounts[id];
      if (!current) return;
      index.accounts[id] = { ...current, ...patch, id };
      await save(index);
    },
    async migrateIfEmpty(session: StoredAccount | null) {
      if (!session) return false;
      const index = await load();
      if (Object.keys(index.accounts).length) return false;
      await save({
        version: 1,
        accounts: {
          [session.id]: {
            id: session.id,
            email: session.email,
            name: session.name,
            image: session.image,
            activeWorkspaceId: session.activeWorkspaceId,
            unreadTotal: session.unreadTotal,
            mentionTotal: session.mentionTotal,
            workspace: session.workspace ?? null,
          },
        },
        activeAccountId: session.id,
      });
      await writeChunks(store, credKey(session.id), JSON.stringify({ token: session.token, cookie: session.cookie }));
      return true;
    },
    async remove(id: string): Promise<string | null> {
      const index = await load();
      delete index.accounts[id];
      if (index.activeAccountId === id) {
        index.activeAccountId = Object.keys(index.accounts)[0] ?? null;
      }
      await save(index);
      await deleteChunks(store, credKey(id));
      return index.activeAccountId;
    },
  };
}

export type MobileAccountVault = ReturnType<typeof createMobileAccountVault>;
