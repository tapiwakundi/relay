import { createContext, useContext, type ReactNode } from "react";
import type { AccountsSnapshot, DesktopAccount } from "../../../shared/ipc";

const AccountCtx = createContext<AccountsSnapshot | null>(null);

export function AccountProvider({
  snapshot,
  children,
}: {
  snapshot: AccountsSnapshot;
  children: ReactNode;
}) {
  return <AccountCtx.Provider value={snapshot}>{children}</AccountCtx.Provider>;
}

export function useAccounts() {
  const ctx = useContext(AccountCtx);
  if (!ctx) {
    return { accounts: [] as DesktopAccount[], activeAccountId: null as string | null, adding: false };
  }
  return ctx;
}

export function useActiveAccountId() {
  return useAccounts().activeAccountId;
}
