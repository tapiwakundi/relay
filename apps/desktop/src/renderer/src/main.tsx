import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceApp } from "./App";
import { LoginScreen } from "./components/LoginScreen";
import { getSession } from "./lib/auth";
import { queryClient } from "./lib/query";
import "./styles/slack.css";

function storeInvite(token: string) {
  sessionStorage.setItem("relay-invite", token);
  window.dispatchEvent(new Event("relay-invite"));
}

function Root() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const desktop = window.relayDesktop;
    if (!desktop) {
      setReady(true);
      return;
    }
    let cancel = false;
    const stopAuth = desktop.onAuthenticated(() => {
      if (!cancel) setSignedIn(true);
    });
    const stopInvite = desktop.onInvite(storeInvite);
    const queryInvite = new URLSearchParams(window.location.search).get("invite");
    if (queryInvite) sessionStorage.setItem("relay-invite", queryInvite);

    void Promise.all([getSession().catch(() => null), desktop.pendingInvites().catch(() => [])])
      .then(([session, invites]) => {
        if (cancel) return;
        for (const token of invites) sessionStorage.setItem("relay-invite", token);
        setSignedIn(Boolean(session?.user));
        setReady(true);
      })
      .catch(() => {
        if (!cancel) setReady(true);
      });

    return () => {
      cancel = true;
      stopAuth();
      stopInvite();
    };
  }, []);

  if (!ready) return <div style={{ height: "100%", background: "#3F0E40" }} />;
  if (!window.relayDesktop) {
    return (
      <div style={{ height: "100%", background: "#3F0E40", color: "#fff", padding: 32, fontFamily: "sans-serif" }}>
        Relay couldn’t reach the desktop app. Quit this window and run pnpm dev again.
      </div>
    );
  }
  return signedIn ? <WorkspaceApp /> : <LoginScreen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
