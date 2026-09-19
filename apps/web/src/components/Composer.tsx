import { useEffect, useRef, useState } from "react";
import type { Member } from "@relay/shared";
import { EMOJI_QUICK } from "@relay/shared";
import { editorIsEmpty, escapeHtml, htmlToMarkdown, textBeforeCaret } from "../lib/format";
import { Code, Emoji, Italic, Link, List, Mention, Plus, Send, Strike } from "./Icons";

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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = draftKey ? localStorage.getItem(`draft:${draftKey}`) : null;
    el.innerHTML = saved ?? "";
    setEmpty(editorIsEmpty(el));
  }, [draftKey]);

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
    const at = /(?:^|\s)@([A-Za-z0-9._-]*)$/.exec(before);
    setMentionOpen(Boolean(at));
    setMentionQ(at?.[1] ?? "");
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

  function insertMention(name: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const before = textBeforeCaret(el);
      const match = /@([A-Za-z0-9._-]*)$/.exec(before);
      if (match) {
        for (let i = 0; i < match[0].length; i++) document.execCommand("delete");
      }
    }
    document.execCommand("insertHTML", false, `<span class="mention">@${escapeHtml(name)}</span>&nbsp;`);
    setMentionOpen(false);
    sync();
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

  const mentionHits = mentionOpen
    ? members.filter((m) => m.displayName.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 6)
    : [];

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
        <div
          ref={ref}
          className={`composer-input ${empty ? "is-empty" : ""}`}
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          suppressContentEditableWarning
          onInput={() => {
            onTyping();
            sync();
          }}
          onKeyUp={sync}
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
          <div className="mention-pop">
            {mentionHits.map((m) => (
              <button key={m.userId} type="button" onClick={() => insertMention(m.displayName)}>
                {m.displayName}
              </button>
            ))}
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
          <button className="c-btn" title="Attach" type="button" onClick={() => fileRef.current?.click()}>
            <Plus />
          </button>
          <button
            className={`c-btn fmt ${marks.bold ? "on" : ""}`}
            title="Bold ⌘B"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("bold")}
          >
            B
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
          <button
            className={`c-btn ${marks.code ? "on" : ""}`}
            title="Code ⌘⇧C"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleCode}
          >
            <Code />
          </button>
          <div className="grow" />
          <div className="pop-wrap">
            <button className="c-btn" type="button" title="Emoji" onClick={() => setEmojiOpen((v) => !v)}>
              <Emoji />
            </button>
            {emojiOpen ? (
              <div className="emoji-pop">
                {EMOJI_QUICK.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      insertText(em);
                      setEmojiOpen(false);
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="c-btn" type="button" title="Mention" onClick={() => insertText("@")}>
            <Mention />
          </button>
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
