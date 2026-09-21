import { useState } from "react";
import logo from "../assets/logo.png";
import { api, signOut } from "../lib/auth";

function inviteToken(raw: string) {
  const value = raw.trim();
  if (!value.includes("invite=")) return value;
  return value.split("invite=")[1]?.split("&")[0] ?? value;
}

export function CreateWorkspaceScreen({
  defaultName,
  onCreated,
  onBackToInvites,
}: {
  defaultName: string;
  onCreated: () => void;
  onBackToInvites?: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [invite, setInvite] = useState(
    () =>
      sessionStorage.getItem("relay-invite") ??
      new URLSearchParams(window.location.search).get("invite") ??
      "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"create" | "join" | null>(null);
  const busy = pending !== null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setPending("create");
    setError(null);
    try {
      await api("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      sessionStorage.removeItem("relay-invite");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create workspace");
      setPending(null);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const token = inviteToken(invite);
    if (!token) {
      setError("Paste an invite link or token");
      return;
    }
    setPending("join");
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
      sessionStorage.removeItem("relay-invite");
      if (window.location.search.includes("invite=")) window.history.replaceState({}, "", "/");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite isn’t valid");
      setPending(null);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src={logo} width={72} height={72} alt="Relay" />
        <h1>Create a workspace</h1>
        <div className="sub">Name your team to get started.</div>
        {error ? <div className="login-error">{error}</div> : null}
        <form onSubmit={(e) => void create(e)} style={{ textAlign: "left" }}>
          <label className="login-field">
            Workspace name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme"
              required
              autoFocus={!onBackToInvites}
            />
          </label>
          <button className="btn-demo" disabled={busy || !name.trim()} type="submit">
            {pending === "create" ? "Creating…" : "Create workspace"}
          </button>
        </form>
        {onBackToInvites ? (
          <div className="login-switch">
            or{" "}
            <a
              href="#invite"
              onClick={(ev) => {
                ev.preventDefault();
                if (!busy) onBackToInvites();
              }}
            >
              accept an invitation
            </a>
          </div>
        ) : (
          <>
            <div className="or-row">OR</div>
            <form onSubmit={(e) => void join(e)} style={{ textAlign: "left" }}>
              <label className="login-field">
                Have an invite?
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="Paste invite link"
                  autoCapitalize="off"
                />
              </label>
              <button className="btn-google" disabled={busy || !invite.trim()} type="submit">
                {pending === "join" ? "Joining…" : "Join with invite"}
              </button>
            </form>
          </>
        )}
        <div className="login-quiet">
          <button type="button" disabled={busy} onClick={() => void window.relayDesktop.startAddAccount()}>
            Sign in with another account
          </button>
          <button type="button" disabled={busy} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
