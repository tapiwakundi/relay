import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceApp } from "./App";
import { LoginScreen } from "./components/LoginScreen";
import { AccountProvider } from "./lib/accounts";
import { queryClient, setActiveAccountId } from "./lib/query";
import type { AccountsSnapshot, NavigatePayload } from "../../shared/ipc";
import "./styles/slack.css";

function storeInvite(token: string) {
  sessionStorage.setItem("relay-invite", token);
  window.dispatchEvent(new Event("relay-invite"));
}

function Root() {
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<AccountsSnapshot>({
    accounts: [],
    activeAccountId: null,
    adding: false,
  });
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const prevActive = useRef<string | null>(null);
  setActiveAccountId(snapshot.activeAccountId);

  useEffect(() => {
    const desktop = window.relayDesktop;
    if (!desktop) {
      setReady(true);
      return;
    }
    let cancel = false;
    const stopAuth = desktop.onAuthenticated(() => {
      void desktop.completeAuth();
    });
    const stopAuthError = desktop.onAuthError(() => {
      void desktop.cancelAddAccount();
    });
    const stopAccounts = desktop.onAccountsChanged((next) => {
      if (!cancel) setSnapshot(next);
    });
    const stopInvite = desktop.onInvite(storeInvite);
    const stopNav = desktop.onNavigate((payload: NavigatePayload) => {
      sessionStorage.setItem("relay-nav", JSON.stringify(payload));
      const active = snapshotRef.current.activeAccountId;
      if (payload.accountId && payload.accountId !== active) {
        void desktop.switchAccount(payload.accountId);
      } else {
        window.dispatchEvent(new Event("relay-nav"));
      }
    });
    const queryInvite = new URLSearchParams(window.location.search).get("invite");
    if (queryInvite) sessionStorage.setItem("relay-invite", queryInvite);

    void Promise.all([desktop.listAccounts().catch(() => null), desktop.pendingInvites().catch(() => [])])
      .then(([accounts, invites]) => {
        if (cancel) return;
        for (const token of invites) sessionStorage.setItem("relay-invite", token);
        if (accounts) setSnapshot(accounts);
        setReady(true);
      })
      .catch(() => {
        if (!cancel) setReady(true);
      });

    return () => {
      cancel = true;
      stopAuth();
      stopAuthError();
      stopAccounts();
      stopInvite();
      stopNav();
    };
  }, []);

  useEffect(() => {
    setActiveAccountId(snapshot.activeAccountId);
    if (prevActive.current && snapshot.activeAccountId && prevActive.current !== snapshot.activeAccountId) {
      queryClient.clear();
      window.dispatchEvent(new Event("relay-nav"));
    }
    prevActive.current = snapshot.activeAccountId;
  }, [snapshot.activeAccountId]);

  if (!ready) return <div style={{ height: "100%", background: "#1A5FB4" }} />;
  if (!window.relayDesktop) {
    return (
      <div style={{ height: "100%", background: "#1A5FB4", color: "#fff", padding: 32, fontFamily: "sans-serif" }}>
        Relay couldn’t reach the desktop app. Quit this window and run pnpm dev again.
      </div>
    );
  }
  if (snapshot.adding) {
    return <LoginScreen add onCancel={() => void window.relayDesktop.cancelAddAccount()} />;
  }
  if (!snapshot.activeAccountId) return <LoginScreen />;
  return (
    <AccountProvider snapshot={snapshot}>
      <WorkspaceApp key={snapshot.activeAccountId} />
    </AccountProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
