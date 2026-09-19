import { useRef, useState, type ReactNode } from "react";
import type { Channel, Invite, Member, Workspace } from "@relay/shared";
import { WorkspaceGlyph } from "./WorkspaceGlyph";

export function FormDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function InviteDialog({
  invites,
  onInvite,
  onClose,
}: {
  invites: Invite[];
  onInvite: (email: string) => Promise<{ url: string }>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <FormDialog title="Invite teammates" onClose={onClose}>
      <p className="dialog-copy">They’ll join this workspace after they create a Relay account with this email.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const res = await onInvite(email);
            setUrl(res.url);
            setEmail("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn’t invite");
          }
        }}
      >
        <input
          type="email"
          required
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Send invite
        </button>
      </form>
      {error ? <div className="login-error">{error}</div> : null}
      {url ? (
        <div className="invite-url">
          <code>{url}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(url)}>
            Copy link
          </button>
        </div>
      ) : null}
      {invites.length > 0 ? (
        <ul className="invite-list">
          {invites.map((i) => (
            <li key={i.id}>
              {i.email} · pending
            </li>
          ))}
        </ul>
      ) : null}
    </FormDialog>
  );
}

export function ChannelDialog({
  onCreate,
  onClose,
}: {
  onCreate: (name: string, isPrivate: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  return (
    <FormDialog title="Create a channel" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onCreate(name, isPrivate);
        }}
      >
        <input required placeholder="e.g. design" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
          Private
        </label>
        <button type="submit" className="btn-primary">
          Create
        </button>
      </form>
    </FormDialog>
  );
}

export function NewMessageDialog({
  members,
  meId,
  onPick,
  onClose,
}: {
  members: Member[];
  meId: string;
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = members.filter(
    (m) => m.userId !== meId && m.displayName.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <FormDialog title="New message" onClose={onClose}>
      <input placeholder="Search teammates" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="switcher-list">
        {list.map((m) => (
          <button key={m.userId} className="switcher-row" onClick={() => onPick(m.userId)}>
            {m.displayName}
            {m.title ? ` · ${m.title}` : ""}
          </button>
        ))}
      </div>
    </FormDialog>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <FormDialog title="Keyboard shortcuts" onClose={onClose}>
      <ul className="help-list">
        <li>
          <kbd>⌘</kbd>
          <kbd>K</kbd> Jump to a channel or search
        </li>
        <li>
          <kbd>⌘</kbd>
          <kbd>B</kbd> Bold · <kbd>⌘</kbd>
          <kbd>I</kbd> Italic · <kbd>⌘</kbd>
          <kbd>⇧</kbd>
          <kbd>X</kbd> Strike
        </li>
        <li>
          <kbd>⌘</kbd>
          <kbd>⇧</kbd>
          <kbd>8</kbd> or <kbd>*</kbd> on an empty line for a bulleted list
        </li>
        <li>
          <kbd>Enter</kbd> Send · in a list, new bullet · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line
        </li>
        <li>
          <kbd>Esc</kbd> Close panes
        </li>
      </ul>
    </FormDialog>
  );
}

export function MembersDialog({
  members,
  onClose,
}: {
  members: Member[];
  onClose: () => void;
}) {
  return (
    <FormDialog title={`${members.length} members`} onClose={onClose}>
      <div className="switcher-list">
        {members.map((m) => (
          <div key={m.userId} className="switcher-row">
            {m.displayName} · {m.presence}
          </div>
        ))}
      </div>
    </FormDialog>
  );
}

export function ChannelInfoDialog({
  channel,
  starred,
  onStar,
  onClose,
}: {
  channel: Channel;
  starred: boolean;
  onStar: () => void;
  onClose: () => void;
}) {
  return (
    <FormDialog title={channel.isDm ? channel.name : `#${channel.name}`} onClose={onClose}>
      <p className="dialog-copy">{channel.topic || channel.description || "No topic yet."}</p>
      {!channel.isDm ? (
        <button className="btn-primary" type="button" onClick={onStar}>
          {starred ? "Unstar channel" : "Star channel"}
        </button>
      ) : null}
    </FormDialog>
  );
}

const ICON_COLORS = ["#4A154B", "#1264A3", "#007A5A", "#E01E5A", "#3F0E40", "#1164A3", "#ECB22E", "#E51670"];

export function WorkspaceSettingsDialog({
  workspace,
  canEdit,
  onSave,
  onUploadIcon,
  onClose,
}: {
  workspace: Workspace;
  canEdit: boolean;
  onSave: (patch: { name: string; iconColor: string; iconLetter: string }) => Promise<void>;
  onUploadIcon: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [iconColor, setIconColor] = useState(workspace.iconColor);
  const [iconLetter, setIconLetter] = useState(workspace.iconLetter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = { ...workspace, name, iconColor, iconLetter };

  return (
    <FormDialog title="Workspace settings" onClose={onClose}>
      <div className="ws-settings-preview">
        <WorkspaceGlyph workspace={preview} />
      </div>
      {error ? <div className="login-error">{error}</div> : null}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canEdit) return;
          setBusy(true);
          setError(null);
          try {
            await onSave({ name, iconColor, iconLetter });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn’t save");
            setBusy(false);
          }
        }}
      >
        <label className="login-field">
          Workspace name
          <input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canEdit} />
        </label>
        <label className="login-field">
          Icon letter
          <input
            value={iconLetter}
            maxLength={2}
            onChange={(e) => setIconLetter(e.target.value.toUpperCase())}
            disabled={!canEdit}
          />
        </label>
        <div className="login-field">
          Icon color
          <div className="ws-swatches">
            {ICON_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`ws-swatch ${iconColor === color ? "on" : ""}`}
                style={{ background: color }}
                disabled={!canEdit}
                onClick={() => setIconColor(color)}
                aria-label={color}
              />
            ))}
          </div>
        </div>
        {canEdit ? (
          <>
            <button type="button" className="btn-google" onClick={() => fileRef.current?.click()} disabled={busy}>
              Upload workspace icon
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError(null);
                void onUploadIcon(file).catch((err) => {
                  setError(err instanceof Error ? err.message : "Couldn’t upload");
                  setBusy(false);
                });
              }}
            />
            <button className="btn-primary" type="submit" disabled={busy || !name.trim()}>
              Save
            </button>
          </>
        ) : (
          <p className="dialog-copy">Only workspace admins can change these settings.</p>
        )}
      </form>
    </FormDialog>
  );
}
