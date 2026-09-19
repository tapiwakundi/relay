import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceApp } from "./App";
import { LoginScreen } from "./components/LoginScreen";
import { getSession } from "./lib/auth";
import { queryClient } from "./lib/query";
import "./styles/slack.css";

function Root() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) sessionStorage.setItem("relay-invite", invite);
    getSession()
      .then((data) => {
        setSignedIn(Boolean(data?.user));
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) return <div style={{ height: "100%", background: "#3F0E40" }} />;
  return signedIn ? <WorkspaceApp /> : <LoginScreen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
