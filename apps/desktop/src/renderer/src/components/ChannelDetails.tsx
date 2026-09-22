import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, ChannelDetails, Member } from "@relay/shared";
import { channelMembers, channelTitle, formatCreatedOn, membersNotInChannel, sectionAfterStar } from "@relay/chat";
import { api } from "../lib/auth";
import { Avatar } from "./Avatar";
import { BellIcon, ChevronDown, Close, Copy, Headphones, Help, SearchIcon, Star, UserPlus } from "./Icons";

type Tab = "about" | "members";
type Field = "name" | "topic" | "description";

export function ChannelDetailsDialog({
  channel,
  members,
  meId,
  initialTab,
  onClose,
  onUpdated,
  onLeft,
  onHuddle,
  onOpenProfile,
}: {
  channel: Channel;
  members: Member[];
  meId: string;
  initialTab: Tab;
  onClose: () => void;
  onUpdated: (channel: Channel) => void;
  onLeft: () => void;
  onHuddle: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online">("all");
  const [copied, setCopied] = useState(false);

  const detailsQ = useQuery({
    queryKey: ["channel-details", channel.id],
    queryFn: () => api<ChannelDetails>(`/api/channels/${channel.id}/details`),
  });
  const details = detailsQ.data;
  const createdBy = details?.createdBy ?? null;
  const memberIds = details?.memberIds ?? [];
  const conversation = channel.isDm || channel.isMpim;
  const title = channelTitle(channel);

  const seenCount = useRef(channel.memberCount);
  useEffect(() => {
    if (seenCount.current === channel.memberCount) return;
    seenCount.current = channel.memberCount;
    void detailsQ.refetch();
  }, [channel.memberCount, detailsQ]);

  useEffect(() => {
    setTab(initialTab);
    setEditing(null);
    setAdding(false);
    setQuery("");
  }, [initialTab, channel.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const people = useMemo(
    () => channelMembers(members, memberIds, { query, onlineOnly: filter === "online" }),
    [members, memberIds, filter, query],
  );

  const outsiders = useMemo(() => membersNotInChannel(members, memberIds), [members, memberIds]);

  function applyDetails(next: ChannelDetails) {
    qc.setQueryData(["channel-details", channel.id], next);
    onUpdated(next.channel);
  }

  async function saveField() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<ChannelDetails>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [editing]: draft }),
      });
      applyDetails(next);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(field: Field, value: string) {
    setEditing(field);
    setDraft(value);
    setError(null);
  }

  async function toggleStar() {
    const res = await api<{ isStarred: boolean }>(`/api/channels/${channel.id}/star`, { method: "POST" });
    onUpdated({
      ...channel,
      isStarred: res.isStarred,
      section: sectionAfterStar(channel, res.isStarred),
    });
  }

  async function chooseMute(muted: boolean) {
    setNotesOpen(false);
    if (channel.isMuted === muted) return;
    const res = await api<{ channel: Channel }>(`/api/channels/${channel.id}/mute`, { method: "POST" });
    onUpdated(res.channel);
  }

  async function addPerson(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await api<ChannelDetails>(`/api/channels/${channel.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      applyDetails(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add them");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm(`Leave ${title}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/channels/${channel.id}/leave`, { method: "POST" });
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't leave");
      setBusy(false);
    }
  }

  async function copyId() {
    await navigator.clipboard.writeText(channel.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const createdLabel = details ? formatCreatedOn(details.createdAt) : "";

  return (
    <div className="modal-bg details-bg" onClick={onClose}>
      <div
        className="channel-details"
        role="dialog"
        aria-labelledby="channel-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="channel-details-head">
          <h2 id="channel-details-title">{title}</h2>
          <button type="button" className="details-close" aria-label="Close" onClick={onClose}>
            <Close size={18} />
          </button>
        </div>

        <div className="details-toolbar">
          <button type="button" className={`details-pill ${channel.isStarred ? "on" : ""}`} onClick={() => void toggleStar()}>
            <Star style={{ fill: channel.isStarred ? "var(--star)" : "none", color: channel.isStarred ? "var(--star)" : "currentColor" }} />
          </button>
          <div className="details-menu">
            <button type="button" className="details-pill" onClick={() => setNotesOpen((open) => !open)}>
              <BellIcon size={16} />
              {channel.isMuted ? "Nothing" : "All new posts"}
              <ChevronDown size={14} />
            </button>
            {notesOpen ? (
              <div className="details-pop" role="menu">
                <button type="button" onClick={() => void chooseMute(false)}>
                  All new posts
                </button>
                <button type="button" onClick={() => void chooseMute(true)}>
                  Nothing
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="details-pill" onClick={onHuddle}>
            <Headphones size={16} />
            Huddle
          </button>
        </div>

        <div className="details-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "about"} className={tab === "about" ? "on" : ""} onClick={() => setTab("about")}>
            About
          </button>
          <button type="button" role="tab" aria-selected={tab === "members"} className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>
            Members {details ? memberIds.length : channel.memberCount}
          </button>
        </div>

        <div className="channel-details-body">
          {error ? <div className="login-error">{error}</div> : null}
          {tab === "about" ? (
            <>
              <div className="details-card">
                <DetailRow
                  label="Channel name"
                  value={channel.isDm ? channel.name : `# ${channel.name}`}
                  editing={editing === "name"}
                  draft={draft}
                  busy={busy}
                  canEdit={!conversation}
                  onEdit={() => startEdit("name", channel.name)}
                  onDraft={setDraft}
                  onSave={() => void saveField()}
                  onCancel={() => setEditing(null)}
                />
                <DetailRow
                  label="Topic"
                  value={channel.topic || ""}
                  placeholder="Add a topic"
                  editing={editing === "topic"}
                  draft={draft}
                  busy={busy}
                  canEdit
                  onEdit={() => startEdit("topic", channel.topic || "")}
                  onDraft={setDraft}
                  onSave={() => void saveField()}
                  onCancel={() => setEditing(null)}
                />
                <DetailRow
                  label="Description"
                  value={channel.description || ""}
                  placeholder="Add a description"
                  editing={editing === "description"}
                  draft={draft}
                  busy={busy}
                  canEdit
                  multiline
                  onEdit={() => startEdit("description", channel.description || "")}
                  onDraft={setDraft}
                  onSave={() => void saveField()}
                  onCancel={() => setEditing(null)}
                />
                {createdBy ? (
                  <div className="details-row">
                    <div>
                      <div className="details-label">
                        Managed by <Help size={14} title="The person who created this channel" />
                      </div>
                      <button type="button" className="details-link" onClick={() => onOpenProfile(createdBy.userId)}>
                        {createdBy.name}
                      </button>
                    </div>
                  </div>
                ) : null}
                {createdBy ? (
                  <div className="details-row">
                    <div>
                      <div className="details-label">Created by</div>
                      <div className="details-value">
                        {createdBy.name} on {createdLabel}
                      </div>
                    </div>
                  </div>
                ) : null}
                {conversation ? null : (
                  <div className="details-row">
                    <button type="button" className="details-leave" onClick={() => void leave()} disabled={busy}>
                      Leave channel
                    </button>
                  </div>
                )}
              </div>
              <div className="details-id">
                Channel ID: {channel.id}{" "}
                <button type="button" className="details-id-copy" aria-label="Copy channel ID" onClick={() => void copyId()}>
                  <Copy />
                </button>
                {copied ? <span>Copied</span> : null}
              </div>
            </>
          ) : (
            <>
              <div className="details-find">
                <label className="details-search">
                  <SearchIcon size={16} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find people"
                    aria-label="Find people"
                  />
                </label>
                <select
                  className="details-filter"
                  value={filter}
                  aria-label="Filter members"
                  onChange={(e) => setFilter(e.target.value as "all" | "online")}
                >
                  <option value="all">All</option>
                  <option value="online">Online</option>
                </select>
              </div>
              {conversation ? null : (
                <button type="button" className="details-add" onClick={() => setAdding((open) => !open)}>
                  <span className="details-add-ico">
                    <UserPlus size={16} />
                  </span>
                  Add people
                </button>
              )}
              {adding ? (
                <div className="details-add-list">
                  {outsiders.length ? (
                    outsiders.map((m) => (
                      <button key={m.userId} type="button" className="details-person" onClick={() => void addPerson(m.userId)} disabled={busy}>
                        <Avatar name={m.displayName} image={m.image} className="av details-avatar" />
                        <span className="details-person-name">{m.displayName}</span>
                      </button>
                    ))
                  ) : (
                    <div className="details-empty">Everyone in the workspace is already here.</div>
                  )}
                </div>
              ) : null}
              <div className="details-people">
                {detailsQ.isPending ? <div className="details-empty">Loading members…</div> : null}
                {people.map((m) => (
                  <button key={m.userId} type="button" className="details-person" onClick={() => onOpenProfile(m.userId)}>
                    <Avatar name={m.displayName} image={m.image} className="av details-avatar" />
                    <span className="details-person-name">
                      {m.displayName}
                      {m.userId === meId ? <span className="details-you"> (you)</span> : null}
                      <PresenceDot presence={m.presence} />
                    </span>
                    {createdBy?.userId === m.userId ? <span className="details-badge">Channel Manager</span> : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  placeholder,
  editing,
  draft,
  busy,
  canEdit,
  multiline,
  onEdit,
  onDraft,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  placeholder?: string;
  editing: boolean;
  draft: string;
  busy: boolean;
  canEdit: boolean;
  multiline?: boolean;
  onEdit: () => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="details-row">
      <div>
        <div className="details-label">{label}</div>
        {editing ? (
          <form
            className="details-edit"
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            {multiline ? (
              <textarea value={draft} onChange={(e) => onDraft(e.target.value)} autoFocus />
            ) : (
              <input value={draft} onChange={(e) => onDraft(e.target.value)} autoFocus />
            )}
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </form>
        ) : (
          <div className={`details-value ${value ? "" : "placeholder"}`}>{value || placeholder}</div>
        )}
      </div>
      {canEdit && !editing ? (
        <button type="button" className="details-edit-btn" onClick={onEdit}>
          Edit
        </button>
      ) : null}
    </div>
  );
}

function PresenceDot({ presence }: { presence: Member["presence"] }) {
  return <span className={`details-presence ${presence}`} aria-label={presence} />;
}
