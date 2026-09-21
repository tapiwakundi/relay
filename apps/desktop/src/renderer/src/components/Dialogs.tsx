import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Channel, InboxInvite, Invite, Member, Workspace } from "@relay/shared";
import type { UpdateState } from "../../../shared/ipc";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Close, Hash, Lock, Plus, SearchIcon, UserPlus, Users } from "./Icons";
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
      <p className="dialog-copy">They’ll see this invite after they create a Relay account with this email.</p>
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

type NewMessageHit =
  | { kind: "member"; key: string; member: Member; score: number }
  | { kind: "channel"; key: string; channel: Channel; score: number };

function queryScore(value: string, q: string) {
  const hay = value.toLowerCase();
  if (!q) return 2;
  if (hay === q) return 0;
  if (hay.startsWith(q)) return 1;
  if (hay.includes(q)) return 2;
  return -1;
}

function newMessageHits(qRaw: string, members: Member[], channels: Channel[], meId: string): NewMessageHit[] {
  const trimmed = qRaw.trim();
  const onlyMembers = trimmed.startsWith("@");
  const onlyChannels = trimmed.startsWith("#");
  const q = trimmed.replace(/^[@#]/, "").trim().toLowerCase();

  const people: NewMessageHit[] = [];
  if (!onlyChannels) {
    for (const member of members) {
      if (member.userId === meId) continue;
      const scores = [member.displayName, member.name, member.email]
        .map((value) => queryScore(value, q))
        .filter((score) => score >= 0);
      if (!scores.length) continue;
      people.push({ kind: "member", key: `m-${member.userId}`, member, score: Math.min(...scores) });
    }
    people.sort((a, b) => {
      if (a.kind !== "member" || b.kind !== "member") return 0;
      return a.score - b.score || a.member.displayName.localeCompare(b.member.displayName);
    });
  }

  const chans: NewMessageHit[] = [];
  if (!onlyMembers) {
    for (const channel of channels) {
      if (channel.isDm) continue;
      const score = queryScore(channel.name, q);
      if (score < 0) continue;
      chans.push({ kind: "channel", key: `c-${channel.id}`, channel, score });
    }
    chans.sort((a, b) => {
      if (a.kind !== "channel" || b.kind !== "channel") return 0;
      return a.score - b.score || a.channel.name.localeCompare(b.channel.name);
    });
  }

  return [...people, ...chans].slice(0, 40);
}

function presenceLabel(member: Member) {
  if (member.statusText) return member.statusText;
  if (member.presence === "active") return "Active";
  if (member.presence === "dnd") return "Do not disturb";
  return member.presence[0].toUpperCase() + member.presence.slice(1);
}

export function NewMessagePane({
  members,
  channels,
  meId,
  onPickMember,
  onPickChannel,
}: {
  members: Member[];
  channels: Channel[];
  meId: string;
  onPickMember: (userId: string, body?: string, file?: File) => void;
  onPickChannel: (channelId: string, body?: string, file?: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const hits = useMemo(() => newMessageHits(q, members, channels, meId), [q, members, channels, meId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  useEffect(() => {
    setIdx((current) => Math.min(current, Math.max(0, hits.length - 1)));
  }, [hits.length]);

  useEffect(() => {
    const selected = listRef.current?.querySelector("[aria-selected='true']");
    selected?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  function pick(index = idx, body?: string, file?: File) {
    const hit = hits[index];
    if (!hit) return;
    if (hit.kind === "member") onPickMember(hit.member.userId, body, file);
    else onPickChannel(hit.channel.id, body, file);
  }

  return (
    <div className="new-msg-pane">
      <div className="ch-header">
        <div className="ch-title">New message</div>
      </div>
      <div className="new-msg-to">
        <label htmlFor="new-msg-to">To:</label>
        <input
          id="new-msg-to"
          ref={inputRef}
          autoFocus
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hits.length > 0}
          aria-controls="new-msg-suggest"
          aria-activedescendant={hits[idx] ? `new-msg-${hits[idx].key}` : undefined}
          placeholder="#a-channel, @somebody, or somebody@example.com"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(hits.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              pick();
            }
          }}
        />
      </div>
      <div className="new-msg-suggest" id="new-msg-suggest" ref={listRef} role="listbox" aria-label="People and channels">
        {hits.map((hit, index) => {
          const selected = index === idx;
          if (hit.kind === "member") {
            const member = hit.member;
            return (
              <button
                key={hit.key}
                id={`new-msg-${hit.key}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={`mention-option ${selected ? "selected" : ""}`}
                onMouseEnter={() => setIdx(index)}
                onClick={() => pick(index)}
              >
                <Avatar as="span" className="mention-avatar" name={member.displayName} image={member.image}>
                  <i className={`mention-presence ${member.presence}`} />
                </Avatar>
                <span className="mention-person">
                  <span className="mention-name">
                    {member.displayName}
                    {member.statusEmoji ? ` ${member.statusEmoji}` : ""}
                  </span>
                  {member.title ? <span className="mention-title">{member.title}</span> : null}
                </span>
                <span className="mention-trailing">
                  <span>{presenceLabel(member)}</span>
                  {selected ? <kbd>Enter</kbd> : null}
                </span>
              </button>
            );
          }
          const channel = hit.channel;
          return (
            <button
              key={hit.key}
              id={`new-msg-${hit.key}`}
              type="button"
              role="option"
              aria-selected={selected}
              className={`mention-option ${selected ? "selected" : ""}`}
              onMouseEnter={() => setIdx(index)}
              onClick={() => pick(index)}
            >
              <span className="new-msg-glyph">
                {channel.isMpim ? <Users size={18} /> : channel.isPrivate ? <Lock size={18} /> : <Hash size={18} />}
              </span>
              <span className="mention-person">
                <span className="mention-name">{channel.name}</span>
                <span className="mention-title">{channel.isMpim ? "Group message" : channel.isPrivate ? "Private channel" : "Channel"}</span>
              </span>
              <span className="mention-trailing">{selected ? <kbd>Enter</kbd> : null}</span>
            </button>
          );
        })}
        {!hits.length ? <div className="new-msg-empty">No matching people or channels.</div> : null}
      </div>
      <Composer
        placeholder="Start a new message"
        members={members}
        onTyping={() => {}}
        onSend={(body, file) => {
          if (!hits[idx]) {
            inputRef.current?.focus();
            return;
          }
          pick(idx, body, file);
        }}
      />
    </div>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [update, setUpdate] = useState<UpdateState | null>(null);

  useEffect(() => {
    let active = true;
    void window.relayDesktop.getUpdateState().then((next) => {
      if (active) setUpdate(next);
    });
    const stop = window.relayDesktop.onUpdateState(setUpdate);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      stop();
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function updateAction() {
    if (!update) return;
    if (update.status === "available") {
      await window.relayDesktop.downloadUpdate();
      return;
    }
    if (update.status === "downloaded") {
      await window.relayDesktop.installUpdate();
      return;
    }
    setUpdate(await window.relayDesktop.checkForUpdates());
  }

  const checking = update?.status === "checking";
  const downloading = update?.status === "downloading";
  const disabled = !update || update.status === "disabled" || checking || downloading;

  return (
    <FormDialog title="Help & updates" onClose={onClose}>
      <section className="help-update">
        <div>
          <h4>Relay updates</h4>
          <p>{updateMessage(update)}</p>
        </div>
        <button className="btn-primary update-action" type="button" disabled={disabled} onClick={() => void updateAction()}>
          {updateButtonLabel(update)}
        </button>
        {downloading ? (
          <div
            className="update-progress"
            role="progressbar"
            aria-label="Downloading update"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(update.percent ?? 0)}
          >
            <span style={{ width: `${update.percent ?? 0}%` }} />
          </div>
        ) : null}
      </section>
      <h4 className="help-subhead">Keyboard shortcuts</h4>
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

function updateMessage(update: UpdateState | null) {
  if (!update) return "Loading version information…";
  switch (update.status) {
    case "checking":
      return `Checking for updates from Relay ${update.currentVersion}…`;
    case "up-to-date":
      return `Relay ${update.currentVersion} is up to date.`;
    case "available":
      return `Relay ${update.version} is ready to download. You’re using ${update.currentVersion}.`;
    case "downloading":
      return `Downloading Relay ${update.version}… ${Math.round(update.percent ?? 0)}%`;
    case "downloaded":
      return `Relay ${update.version} is ready. Restart Relay to finish updating.`;
    case "error":
      return update.message || "Couldn’t check for updates. Try again.";
    case "disabled":
      return update.message || `Relay ${update.currentVersion}`;
    default:
      return `You’re using Relay ${update.currentVersion}.`;
  }
}

function updateButtonLabel(update: UpdateState | null) {
  if (!update) return "Loading…";
  switch (update.status) {
    case "checking":
      return "Checking…";
    case "available":
      return `Download ${update.version}`;
    case "downloading":
      return `Downloading ${Math.round(update.percent ?? 0)}%`;
    case "downloaded":
      return "Restart and update";
    case "disabled":
      return "Installed app only";
    default:
      return "Check for updates";
  }
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

const ICON_COLORS = ["#1A5FB4", "#1264A3", "#007A5A", "#E01E5A", "#0E3C74", "#1164A3", "#ECB22E", "#E51670"];

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

export function AddWorkspaceDialog({
  workspaces,
  pendingInvites,
  currentWorkspaceId,
  onSignInOther,
  onSelectWorkspace,
  onCreate,
  onJoinInvite,
  onAcceptInboxInvite,
  onClose,
}: {
  workspaces: Workspace[];
  pendingInvites: InboxInvite[];
  currentWorkspaceId: string;
  onSignInOther: () => void;
  onSelectWorkspace: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onJoinInvite: (token: string) => Promise<void>;
  onAcceptInboxInvite: (inviteId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [view, setView] = useState<"choose" | "find" | "create">("choose");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = view === "find" ? "Find workspaces" : view === "create" ? "Create a new workspace" : "Add a workspace";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="modal-bg add-ws-bg" onClick={onClose}>
      <div className="add-ws-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="add-ws-title">
        <div className="add-ws-head">
          <h3 id="add-ws-title">{title}</h3>
          <button type="button" className="add-ws-close" aria-label="Close" onClick={onClose}>
            <Close size={20} />
          </button>
        </div>
        {view === "choose" ? (
          <div className="add-ws-list">
            {pendingInvites.length ? (
              <button type="button" className="add-ws-row" onClick={() => setView("find")}>
                <span className="add-ws-ico">✉</span>
                {pendingInvites.length === 1 ? "1 pending invite" : `${pendingInvites.length} pending invites`}
              </button>
            ) : null}
            <button type="button" className="add-ws-row" onClick={onSignInOther}>
              <span className="add-ws-ico">
                <UserPlus />
              </span>
              Sign in to another workspace
            </button>
            <button type="button" className="add-ws-row" onClick={() => setView("find")}>
              <span className="add-ws-ico">
                <SearchIcon />
              </span>
              Find workspaces
            </button>
            <button type="button" className="add-ws-row" onClick={() => setView("create")}>
              <span className="add-ws-ico">
                <Plus size={20} />
              </span>
              Create a new workspace
            </button>
          </div>
        ) : (
          <div className="add-ws-body">
            {error ? <div className="add-ws-error">{error}</div> : null}
            {view === "find" ? (
              <>
                {pendingInvites.length ? (
                  <div className="add-ws-list">
                    {pendingInvites.map((item) => (
                      <div key={item.id} className="add-ws-row add-ws-invite">
                        <WorkspaceGlyph className="sm" workspace={item.workspace} />
                        <span>
                          {item.workspace.name}
                          <span className="add-ws-invite-who">
                            {item.invitedByName ? `Invited by ${item.invitedByName}` : "Pending invite"}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="add-ws-submit"
                          disabled={busy}
                          onClick={() => void run(async () => onAcceptInboxInvite(item.id))}
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {workspaces.length ? (
                  <div className="add-ws-list">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        className="add-ws-row"
                        disabled={busy || ws.id === currentWorkspaceId}
                        onClick={() => void run(async () => onSelectWorkspace(ws.id))}
                      >
                        <WorkspaceGlyph className="sm" workspace={ws} />
                        <span>
                          {ws.name}
                          {ws.id === currentWorkspaceId ? " · current" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <form
                  className="add-ws-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const raw = invite.trim();
                    const token = raw.includes("invite=")
                      ? (raw.split("invite=")[1]?.split("&")[0] ?? raw)
                      : raw;
                    if (!token) {
                      setError("Paste an invite link or token");
                      return;
                    }
                    void run(async () => onJoinInvite(token));
                  }}
                >
                  <label>
                    Join with an invite
                    <input
                      value={invite}
                      onChange={(e) => setInvite(e.target.value)}
                      placeholder="Paste invite link"
                      autoFocus
                    />
                  </label>
                  <button type="submit" className="add-ws-submit" disabled={busy || !invite.trim()}>
                    Join workspace
                  </button>
                </form>
              </>
            ) : (
              <form
                className="add-ws-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!name.trim()) return;
                  void run(async () => onCreate(name.trim()));
                }}
              >
                <label>
                  Workspace name
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme"
                    required
                  />
                </label>
                <button type="submit" className="add-ws-submit" disabled={busy || !name.trim()}>
                  Create
                </button>
              </form>
            )}
            <button
              type="button"
              className="add-ws-back"
              onClick={() => {
                setView("choose");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
