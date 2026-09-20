import { useState } from "react";
import type { Channel, ChatMessage, Member } from "@relay/shared";
import { EMOJI_QUICK } from "@relay/shared";
import { formatDay, formatTime, renderBody, sameMinute } from "../lib/format";
import { Avatar } from "./Avatar";
import { Bookmark, Emoji, MoreIcon, Share, ThreadIcon } from "./Icons";

export function MessageList({
  messages,
  members,
  meId,
  channels,
  onThread,
  onReact,
  onProfile,
  onLater,
  onForward,
  onEdit,
  onDelete,
  hideThread,
}: {
  messages: ChatMessage[];
  members: Map<string, Member>;
  meId: string;
  channels: Channel[];
  onThread: (m: ChatMessage) => void;
  onReact: (id: string, emoji: string) => void;
  onProfile: (userId: string) => void;
  onLater: (m: ChatMessage) => void;
  onForward: (m: ChatMessage, channelId: string) => void;
  onEdit: (m: ChatMessage, body: string) => void;
  onDelete: (m: ChatMessage) => void;
  hideThread?: boolean;
}) {
  let lastDay = "";
  return (
    <>
      {messages.map((m, i) => {
        const day = formatDay(m.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const prev = messages[i - 1];
        const compact = Boolean(
          prev && prev.userId === m.userId && !m.parentId && sameMinute(prev.createdAt, m.createdAt) && !showDay,
        );
        return (
          <div key={m.id}>
            {showDay ? <div className="day-div">{day}</div> : null}
            <MessageItem
              m={m}
              compact={compact}
              meId={meId}
              member={members.get(m.userId)}
              members={members}
              channels={channels}
              onThread={onThread}
              onReact={onReact}
              onProfile={onProfile}
              onLater={onLater}
              onForward={onForward}
              onEdit={onEdit}
              onDelete={onDelete}
              hideThread={hideThread}
            />
          </div>
        );
      })}
    </>
  );
}

function MessageItem({
  m,
  compact,
  meId,
  member,
  members,
  channels,
  onThread,
  onReact,
  onProfile,
  onLater,
  onForward,
  onEdit,
  onDelete,
  hideThread,
}: {
  m: ChatMessage;
  compact: boolean;
  meId: string;
  member?: Member;
  members: Map<string, Member>;
  channels: Channel[];
  onThread: (m: ChatMessage) => void;
  onReact: (id: string, emoji: string) => void;
  onProfile: (userId: string) => void;
  onLater: (m: ChatMessage) => void;
  onForward: (m: ChatMessage, channelId: string) => void;
  onEdit: (m: ChatMessage, body: string) => void;
  onDelete: (m: ChatMessage) => void;
  hideThread?: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const [more, setMore] = useState(false);
  const [forward, setForward] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  return (
    <article className={`msg ${compact ? "compact" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
      <Avatar
        className="avatar"
        name={m.userName}
        image={m.userImage ?? member?.image}
        onClick={() => onProfile(m.userId)}
      />
      <div>
        {!compact && (
          <div className="byline">
            <span className="name" onClick={() => onProfile(m.userId)}>
              {m.userName}
              {m.userStatusEmoji ? ` ${m.userStatusEmoji}` : ""}
            </span>
            <span className="time">{formatTime(m.createdAt)}</span>
            {m.edited ? <span className="time">(edited)</span> : null}
            {m.pending ? <span className="time">Sending…</span> : null}
            {m.failed ? <span className="time">Failed</span> : null}
          </div>
        )}
        {editing ? (
          <form
            className="edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              onEdit(m, draft);
              setEditing(false);
            }}
          >
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div>
              <button type="submit">Save</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : m.deleted ? (
          <div className="body deleted">This message was deleted</div>
        ) : (
          <div className="body" dangerouslySetInnerHTML={{ __html: renderBody(m.body) }} />
        )}
        {!m.deleted && (m.fileUrl || m.fileName) ? (
          <a className="file-card" href={m.fileUrl ?? "#"} target="_blank" rel="noreferrer">
            <span className="file-icon">📄</span>
            <span>
              <strong>{m.fileName ?? "Attachment"}</strong>
              <em>{m.fileContentType ?? "file"}</em>
            </span>
          </a>
        ) : null}
        {m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`rxn ${r.userIds.includes(meId) ? "mine" : ""}`}
                onClick={() => onReact(m.id, r.emoji)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
            <button className="rxn" onClick={() => setPicker(true)}>
              +
            </button>
          </div>
        )}
        {!hideThread && m.replyCount > 0 && (
          <button className="thread-bar" onClick={() => onThread(m)}>
            <span className="tiny-avs">
              {m.replyUserIds.slice(0, 3).map((id) => {
                const reply = members.get(id);
                return (
                  <Avatar
                    key={id}
                    as="span"
                    name={reply?.name ?? id}
                    image={reply?.image}
                  />
                );
              })}
            </span>
            {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
            {m.latestReplyAt ? (
              <span style={{ color: "var(--text-2)", fontWeight: 400 }}>{formatTime(m.latestReplyAt)}</span>
            ) : null}
          </button>
        )}
      </div>
      <div className="msg-actions">
        {EMOJI_QUICK.slice(0, 3).map((e) => (
          <button key={e} onClick={() => onReact(m.id, e)}>
            {e}
          </button>
        ))}
        <button onClick={() => setPicker((v) => !v)} title="React">
          <Emoji size={15} />
        </button>
        {!hideThread && (
          <button onClick={() => onThread(m)} title="Reply in thread">
            <ThreadIcon />
          </button>
        )}
        <button title="Later" onClick={() => onLater(m)}>
          <Bookmark />
        </button>
        <button title="Forward" onClick={() => setForward((v) => !v)}>
          <Share />
        </button>
        <button title="More" onClick={() => setMore((v) => !v)}>
          <MoreIcon size={15} />
        </button>
      </div>
      {picker && (
        <div className="emoji-pop">
          {EMOJI_QUICK.map((e) => (
            <button
              key={e}
              onClick={() => {
                onReact(m.id, e);
                setPicker(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {forward && (
        <div className="mini-menu">
          {channels
            .filter((c) => !c.isDm)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onForward(m, c.id);
                  setForward(false);
                }}
              >
                #{c.name}
              </button>
            ))}
        </div>
      )}
      {more && (
        <div className="mini-menu">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(m.body);
              setMore(false);
            }}
          >
            Copy text
          </button>
          {m.userId === meId ? (
            <>
              <button
                onClick={() => {
                  setEditing(true);
                  setDraft(m.body);
                  setMore(false);
                }}
              >
                Edit message
              </button>
              <button
                onClick={() => {
                  onDelete(m);
                  setMore(false);
                }}
              >
                Delete message
              </button>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}
