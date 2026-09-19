import { useState } from "react";
import { api, signOut } from "../lib/auth";
import { Avatar } from "./Avatar";

export function CreateWorkspaceScreen({
  defaultName,
  userName,
  image,
  onCreated,
}: {
  defaultName: string;
  userName: string;
  image: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [invite, setInvite] = useState(
    () =>
      sessionStorage.getItem("relay-invite") ??
      new URLSearchParams(window.location.search).get("invite") ??
      "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create workspace");
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const raw = invite.trim();
    const token = raw.includes("invite=") ? (raw.split("invite=")[1]?.split("&")[0] ?? raw) : raw;
    if (!token) {
      setError("Paste an invite link or token");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
      sessionStorage.removeItem("relay-invite");
      if (window.location.search.includes("invite=")) window.history.replaceState({}, "", "/");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite isn’t valid");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-top">
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await signOut();
            window.location.reload();
          }}
        >
          Sign out
        </button>
      </div>
      <div className="login-card" style={{ textAlign: "left" }}>
        <h1>Create a workspace</h1>
        <div className="signed-in-as">
          <Avatar className="av" name={userName} image={image} />
          <div className="sub" style={{ margin: 0 }}>
            Signed in as {userName}. You’re not in a workspace yet.
          </div>
        </div>
        {error ? <div className="login-error">{error}</div> : null}
        <form onSubmit={(e) => void create(e)}>
          <label className="login-field">
            Workspace name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme"
              required
              autoFocus
            />
          </label>
          <button className="btn-demo" disabled={busy || !name.trim()} type="submit">
            Create workspace
          </button>
        </form>
        <div className="or-row">OR</div>
        <form onSubmit={(e) => void join(e)}>
          <label className="login-field">
            Have an invite?
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="Paste invite link"
            />
          </label>
          <button className="btn-google" disabled={busy} type="submit">
            Join workspace
          </button>
        </form>
      </div>
    </div>
  );
}
