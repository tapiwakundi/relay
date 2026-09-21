import { useState } from "react";
import type { InboxInvite } from "@relay/shared";
import logo from "../assets/logo.png";
import { api, signOut } from "../lib/auth";
import { WorkspaceGlyph } from "./WorkspaceGlyph";

export function AcceptInviteScreen({
  pendingInvites,
  onCreated,
  onCreateWorkspace,
}: {
  pendingInvites: InboxInvite[];
  onCreated: () => void;
  onCreateWorkspace: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const busy = pendingId !== null;
  const single = pendingInvites.length === 1 ? pendingInvites[0] : null;

  async function accept(inviteId: string) {
    setPendingId(inviteId);
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", body: JSON.stringify({ inviteId }) });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite isn’t valid");
    } finally {
      setPendingId(null);
    }
  }

  const title = single ? `Join ${single.workspace.name}` : "You’ve been invited";
  const sub = single
    ? single.invitedByName
      ? `${single.invitedByName} invited you to this workspace.`
      : "Accept this invite to join the team."
    : "Accept an invite to join a team.";

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src={logo} width={72} height={72} alt="Relay" />
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
        {error ? <div className="login-error">{error}</div> : null}
        <div className="invite-inbox">
          {pendingInvites.map((item) => (
            <div key={item.id} className="invite-inbox-item">
              <WorkspaceGlyph className="sm" workspace={item.workspace} />
              <div className="invite-inbox-meta">
                <div className="invite-inbox-name">{item.workspace.name}</div>
                <div className="invite-inbox-who">
                  {item.invitedByName ? `Invited by ${item.invitedByName}` : "Pending invite"}
                </div>
              </div>
            </div>
          ))}
        </div>
        {single ? (
          <button className="btn-demo" type="button" disabled={busy} onClick={() => void accept(single.id)}>
            {busy ? "Accepting…" : "Accept invitation"}
          </button>
        ) : (
          pendingInvites.map((item) => (
            <button
              key={item.id}
              className="btn-demo"
              type="button"
              disabled={busy}
              onClick={() => void accept(item.id)}
            >
              {pendingId === item.id ? "Accepting…" : `Accept ${item.workspace.name}`}
            </button>
          ))
        )}
        <div className="login-switch">
          or{" "}
          <a
            href="#create"
            onClick={(ev) => {
              ev.preventDefault();
              if (!busy) onCreateWorkspace();
            }}
          >
            create a workspace
          </a>
        </div>
        <div className="login-quiet">
          <button
            type="button"
            disabled={busy}
            onClick={() => void window.relayDesktop.startAddAccount()}
          >
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
