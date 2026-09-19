import { useRef, useState } from "react";
import type { Member } from "@relay/shared";
import { Avatar } from "./Avatar";
import { Close } from "./Icons";

export function ProfilePane({
  member,
  isSelf,
  onClose,
  onMessage,
  onSave,
  onUploadPhoto,
}: {
  member: Member;
  isSelf: boolean;
  onClose: () => void;
  onMessage: () => void;
  onSave?: (patch: {
    displayName?: string;
    title?: string | null;
    statusText?: string | null;
    statusEmoji?: string | null;
  }) => Promise<void>;
  onUploadPhoto?: (file: File) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(member.displayName);
  const [title, setTitle] = useState(member.title ?? "");
  const [statusText, setStatusText] = useState(member.statusText ?? "");
  const [statusEmoji, setStatusEmoji] = useState(member.statusEmoji ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const localTime = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const presenceLabel =
    member.presence === "active" ? "Active" : member.presence === "dnd" ? "Do not disturb" : "Away";

  return (
    <aside className="profile-pane">
      <div className="profile-pane-h">
        <h3>Profile</h3>
        <button className="icon-btn dark" type="button" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </div>
      <div className="profile-pane-body">
        <div className="profile-photo-wrap">
          <Avatar className="av profile-photo" name={member.name} image={member.image} />
          {isSelf && onUploadPhoto ? (
            <>
              <button type="button" className="profile-photo-edit" onClick={() => fileRef.current?.click()}>
                Edit photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void onUploadPhoto(file);
                }}
              />
            </>
          ) : null}
        </div>
        <div className="profile-name-row">
          <h2>{member.displayName}</h2>
          {isSelf ? (
            <button type="button" className="profile-link" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel" : "Edit"}
            </button>
          ) : null}
        </div>
        {member.title ? <div className="profile-title">{member.title}</div> : null}
        <div className="profile-presence">
          <i className={`presence-dot ${member.presence}`} />
          {presenceLabel}
        </div>
        <div className="profile-time">
          <span className="profile-time-icon">🕒</span>
          {localTime} local time
        </div>
        {member.statusText ? (
          <div className="profile-status">
            {member.statusEmoji} {member.statusText}
          </div>
        ) : null}
        <div className="profile-actions">
          {isSelf ? (
            <button type="button" onClick={() => setEditing(true)}>
              Set a status
            </button>
          ) : (
            <button type="button" className="primary" onClick={onMessage}>
              Message
            </button>
          )}
        </div>

        {editing && isSelf && onSave ? (
          <form
            className="profile-edit"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onSave({
                  displayName,
                  title: title || null,
                  statusText: statusText || null,
                  statusEmoji: statusEmoji || null,
                });
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Status
              <input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="What’s your status?" />
            </label>
            <label>
              Status emoji
              <input value={statusEmoji} onChange={(e) => setStatusEmoji(e.target.value)} placeholder="🙂" />
            </label>
            <button className="btn-primary" type="submit" disabled={busy}>
              Save
            </button>
          </form>
        ) : null}

        <section className="profile-section">
          <div className="profile-section-h">
            <h4>Contact information</h4>
          </div>
          {member.email ? (
            <a className="profile-contact" href={`mailto:${member.email}`}>
              <span>✉️</span>
              <span>
                <em>Email Address</em>
                {member.email}
              </span>
            </a>
          ) : (
            <div className="profile-muted">No contact details yet.</div>
          )}
        </section>
        <section className="profile-section">
          <div className="profile-section-h">
            <h4>About me</h4>
          </div>
          {member.title ? <div className="profile-muted">{member.title}</div> : <div className="profile-muted">No additional details.</div>}
        </section>
      </div>
    </aside>
  );
}
