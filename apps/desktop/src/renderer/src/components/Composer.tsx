import { useEffect, useId, useRef, useState } from "react";
import type { Member } from "@relay/shared";
import { nextTypingEmit } from "@relay/chat";
import { editorIsEmpty, escapeHtml, htmlToMarkdown, textBeforeCaret } from "../lib/format";
import { Avatar } from "./Avatar";
import { Bold, Code, Emoji, FormatText, Italic, Link, List, Mention, Plus, Send, Strike } from "./Icons";

type Marks = { bold: boolean; italic: boolean; strike: boolean; list: boolean; code: boolean };

export function Composer({
  placeholder,
  members,
  draftKey,
  onSend,
  onTyping,
}: {
  placeholder: string;
  members: Member[];
  draftKey?: string;
  onSend: (body: string, file?: File) => void;
  onTyping: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [formatOpen, setFormatOpen] = useState(true);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [empty, setEmpty] = useState(true);
  const [marks, setMarks] = useState<Marks>({
    bold: false,
    italic: false,
    strike: false,
    list: false,
    code: false,
  });
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const mentionListId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    lastTyping.current = 0;
    const saved = draftKey ? localStorage.getItem(`draft:${draftKey}`) : null;
    el.innerHTML = saved ?? "";
    setEmpty(editorIsEmpty(el));
  }, [draftKey]);

  function emitTyping() {
    const now = nextTypingEmit(lastTyping.current);
    if (now == null) return;
    lastTyping.current = now;
    onTyping();
  }

  function persist() {
    const el = ref.current;
    if (!el || !draftKey) return;
    const html = el.innerHTML;
    if (editorIsEmpty(el)) localStorage.removeItem(`draft:${draftKey}`);
    else localStorage.setItem(`draft:${draftKey}`, html);
  }

  function sync() {
    const el = ref.current;
    if (!el) return;
    setEmpty(editorIsEmpty(el));
    persist();
    const inCode = Boolean(closestTag("code"));
    setMarks({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      strike: document.queryCommandState("strikeThrough"),
      list: document.queryCommandState("insertUnorderedList"),
      code: inCode,
    });
    const before = textBeforeCaret(el);
    const at = /(?:^|[\s([{])@([^@\n\u00a0]{0,60})$/.exec(before);
    const nextQuery = at?.[1] ?? "";
    if (!at || nextQuery !== mentionQ) setMentionIndex(0);
    setMentionOpen(Boolean(at));
    setMentionQ(nextQuery);
  }

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, value);
    sync();
  }

  function closestTag(tag: string) {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const el = node instanceof HTMLElement ? node : node?.parentElement;
    return el?.closest(tag) ?? null;
  }

  function atBlockStart() {
    const el = ref.current;
    if (!el) return true;
    const before = textBeforeCaret(el);
    const line = before.split("\n").pop() ?? before;
    return line.trim().length === 0;
  }

  function toggleCode() {
    ref.current?.focus();
    const existing = closestTag("code");
    const sel = window.getSelection();
    if (existing && sel) {
      const text = existing.textContent ?? "";
      const range = document.createRange();
      range.selectNode(existing);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
      sync();
      return;
    }
    const picked = sel?.toString() || "code";
    document.execCommand("insertHTML", false, `<code>${escapeHtml(picked)}</code>`);
    sync();
  }

  function applyLink() {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const sel = window.getSelection();
    if (!sel?.toString()) document.execCommand("insertText", false, url);
    exec("createLink", url);
  }

  function insertText(value: string) {
    ref.current?.focus();
    document.execCommand("insertText", false, value);
    sync();
  }

  function showEmojiPanel() {
    ref.current?.focus();
    void window.relayDesktop.showEmojiPanel();
  }

  function insertMention(member: Member) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const before = textBeforeCaret(el);
      const match = /@([^@\n\u00a0]{0,60})$/.exec(before);
      if (match) {
        for (let i = 0; i < match[0].length; i++) document.execCommand("delete");
      }
    }
    document.execCommand(
      "insertHTML",
      false,
      `<span class="mention" data-user-id="${member.userId}">@${escapeHtml(member.displayName)}</span>&nbsp;`,
    );
    sync();
    setMentionOpen(false);
    setMentionQ("");
    setMentionIndex(0);
  }

  function send() {
    const el = ref.current;
    if (!el) return;
    const body = htmlToMarkdown(el).trim();
    if (!body && !file) return;
    onSend(body, file ?? undefined);
    setFile(null);
    el.innerHTML = "";
    setEmpty(true);
    setMarks({ bold: false, italic: false, strike: false, list: false, code: false });
    setMentionOpen(false);
    if (draftKey) localStorage.removeItem(`draft:${draftKey}`);
  }

  const normalizedMentionQ = mentionQ.trim().toLowerCase();
  const mentionHits = mentionOpen
    ? members
        .filter((member) => {
          if (!normalizedMentionQ) return true;
          return [member.displayName, member.name, member.email].some((value) =>
            value.toLowerCase().includes(normalizedMentionQ),
          );
        })
        .sort((a, b) => {
          const aName = a.displayName.toLowerCase();
          const bName = b.displayName.toLowerCase();
          const aPrefix = aName.startsWith(normalizedMentionQ) ? 0 : 1;
          const bPrefix = bName.startsWith(normalizedMentionQ) ? 0 : 1;
          if (aPrefix !== bPrefix) return aPrefix - bPrefix;
          const presenceOrder = { active: 0, away: 1, dnd: 2, offline: 3 };
          const presence = presenceOrder[a.presence] - presenceOrder[b.presence];
          return presence || a.displayName.localeCompare(b.displayName);
        })
        .slice(0, 8)
    : [];
  const activeMention = mentionHits[Math.min(mentionIndex, mentionHits.length - 1)] ?? null;

  useEffect(() => {
    if (!mentionOpen || !activeMention) return;
    document
      .getElementById(`${mentionListId}-${activeMention.userId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeMention, mentionListId, mentionOpen]);

  return (
    <div className="composer-wrap">
      <div className="composer">
        {file ? (
          <div className="composer-file">
            {file.name}
            <button type="button" onClick={() => setFile(null)}>
              ×
            </button>
          </div>
        ) : null}
        {formatOpen ? (
          <div className="composer-format" aria-label="Message formatting">
            <button
              className={`c-btn ${marks.bold ? "on" : ""}`}
              title="Bold ⌘B"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("bold")}
            >
              <Bold />
            </button>
            <button
              className={`c-btn ${marks.italic ? "on" : ""}`}
              title="Italic ⌘I"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("italic")}
            >
              <Italic />
            </button>
            <button
              className={`c-btn ${marks.strike ? "on" : ""}`}
              title="Strikethrough ⌘⇧X"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("strikeThrough")}
            >
              <Strike />
            </button>
            <span className="composer-divider" aria-hidden="true" />
            <button
              className="c-btn"
              title="Link ⌘⇧U"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyLink}
            >
              <Link />
            </button>
            <button
              className={`c-btn ${marks.list ? "on" : ""}`}
              title="Bulleted list ⌘⇧8"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("insertUnorderedList")}
            >
              <List />
            </button>
            <span className="composer-divider" aria-hidden="true" />
            <button
              className={`c-btn ${marks.code ? "on" : ""}`}
              title="Code ⌘⇧C"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleCode}
            >
              <Code />
            </button>
          </div>
        ) : null}
        <div
          ref={ref}
          className={`composer-input ${empty ? "is-empty" : ""}`}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-controls={mentionHits.length > 0 ? mentionListId : undefined}
          aria-activedescendant={activeMention ? `${mentionListId}-${activeMention.userId}` : undefined}
          data-placeholder={placeholder}
          suppressContentEditableWarning
          onInput={() => {
            emitTyping();
            sync();
          }}
          onKeyUp={(e) => {
            if (e.key !== "Escape") sync();
          }}
          onMouseUp={sync}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData("text/html");
            const text = e.clipboardData.getData("text/plain");
            if (html) document.execCommand("insertHTML", false, sanitizePaste(html));
            else document.execCommand("insertText", false, text);
            sync();
          }}
          onKeyDown={(e) => {
            const meta = e.metaKey || e.ctrlKey;
            const inList = Boolean(closestTag("li"));

            if (mentionOpen && !e.nativeEvent.isComposing) {
              if (e.key === "Escape") {
                e.preventDefault();
                setMentionOpen(false);
                return;
              }
              if (mentionHits.length > 0 && e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((index) => (index + 1) % mentionHits.length);
                return;
              }
              if (mentionHits.length > 0 && e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((index) => (index - 1 + mentionHits.length) % mentionHits.length);
                return;
              }
              if (mentionHits.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                e.preventDefault();
                insertMention(mentionHits[Math.min(mentionIndex, mentionHits.length - 1)]);
                return;
              }
            }

            if (meta && e.key.toLowerCase() === "b") {
              e.preventDefault();
              exec("bold");
              return;
            }
            if (meta && e.key.toLowerCase() === "i") {
              e.preventDefault();
              exec("italic");
              return;
            }
            if (meta && e.shiftKey && e.key.toLowerCase() === "x") {
              e.preventDefault();
              exec("strikeThrough");
              return;
            }
            if (meta && e.shiftKey && e.key.toLowerCase() === "u") {
              e.preventDefault();
              applyLink();
              return;
            }
            if (meta && e.shiftKey && e.key.toLowerCase() === "c") {
              e.preventDefault();
              toggleCode();
              return;
            }
            if (meta && e.shiftKey && (e.key === "8" || e.key === "*")) {
              e.preventDefault();
              exec("insertUnorderedList");
              return;
            }
            if (meta && e.shiftKey && e.key === "7") {
              e.preventDefault();
              exec("insertOrderedList");
              return;
            }
            if (meta && e.key.toLowerCase() === "u") {
              e.preventDefault();
              return;
            }

            if (e.key === "*" && !meta) {
              const sel = window.getSelection();
              if (sel && !sel.isCollapsed) {
                e.preventDefault();
                exec("bold");
                return;
              }
              if (inList || atBlockStart()) {
                e.preventDefault();
                if (!inList) exec("insertUnorderedList");
                else document.execCommand("insertParagraph");
                sync();
                return;
              }
            }

            if (e.key === " " && !meta) {
              const el = ref.current;
              if (!el) return;
              const line = (textBeforeCaret(el).split("\n").pop() ?? "").trim();
              if (line === "*" || line === "-" || line === "•") {
                e.preventDefault();
                for (let i = 0; i < line.length; i++) document.execCommand("delete");
                exec("insertUnorderedList");
                return;
              }
              if (/^\d+\.$/.test(line)) {
                e.preventDefault();
                for (let i = 0; i < line.length; i++) document.execCommand("delete");
                exec("insertOrderedList");
                return;
              }
            }

            if (e.key === "Enter" && !e.shiftKey) {
              if (inList) {
                const li = closestTag("li");
                if (li && !(li.textContent ?? "").trim()) {
                  e.preventDefault();
                  exec("insertUnorderedList");
                }
                return;
              }
              e.preventDefault();
              send();
            }
          }}
        />
        {mentionHits.length > 0 && (
          <div className="mention-pop" id={mentionListId} role="listbox" aria-label="Mention someone">
            {mentionHits.map((member, index) => {
              const selected = index === mentionIndex;
              const presenceLabel =
                member.statusText ??
                (member.presence === "active"
                  ? "Active"
                  : member.presence === "dnd"
                    ? "Do not disturb"
                    : member.presence[0].toUpperCase() + member.presence.slice(1));
              return (
                <button
                  key={member.userId}
                  id={`${mentionListId}-${member.userId}`}
                  className={`mention-option ${selected ? "selected" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setMentionIndex(index)}
                  onClick={() => insertMention(member)}
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
                    <span>{presenceLabel}</span>
                    {selected ? <kbd>Enter</kbd> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="composer-bar">
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const next = e.target.files?.[0];
              if (next) setFile(next);
              e.target.value = "";
            }}
          />
          <button className="c-btn attach" title="Attach" type="button" onClick={() => fileRef.current?.click()}>
            <Plus />
          </button>
          <button
            className={`c-btn format-toggle ${formatOpen ? "on" : ""}`}
            title={formatOpen ? "Hide formatting" : "Show formatting"}
            type="button"
            onClick={() => setFormatOpen((open) => !open)}
          >
            <FormatText />
          </button>
          <button
            className="c-btn"
            type="button"
            title="Emoji"
            onMouseDown={(event) => event.preventDefault()}
            onClick={showEmojiPanel}
          >
            <Emoji />
          </button>
          <button className="c-btn" type="button" title="Mention" onClick={() => insertText("@")}>
            <Mention />
          </button>
          <div className="grow" />
          <button className={`send ${!empty || file ? "on" : ""}`} onClick={send} disabled={empty && !file}>
            <Send />
          </button>
        </div>
      </div>
    </div>
  );
}

function sanitizePaste(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allow = new Set(["B", "STRONG", "I", "EM", "S", "STRIKE", "DEL", "CODE", "A", "UL", "OL", "LI", "BR", "P", "DIV", "SPAN"]);
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!allow.has(el.tagName)) {
          el.replaceWith(...el.childNodes);
        } else {
          [...el.attributes].forEach((attr) => {
            if (el.tagName === "A" && attr.name === "href" && /^https?:/i.test(attr.value)) return;
            el.removeAttribute(attr.name);
          });
          walk(el);
        }
      }
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
