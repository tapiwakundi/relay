export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 42% 38%)`;
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export function sameMinute(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs(da.getTime() - db.getTime()) < 5 * 60_000;
}

export function renderBody(body: string) {
  let html = body
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])_([^_]+)_/g, "$1<em>$2</em>");
  html = html.replace(/~([^~]+)~/g, "<s>$1</s>");
  html = html.replace(/(^|[\s(])@([A-Za-z][A-Za-z0-9._-]*)/g, '$1<span class="mention">@$2</span>');
  html = html.replace(/\n/g, "<br>");
  return html;
}

export function wrapSelection(text: string, start: number, end: number, before: string, after = before) {
  const selected = text.slice(start, end) || "text";
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  return {
    text: next,
    from: start + before.length,
    to: start + before.length + selected.length,
  };
}

export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function htmlToMarkdown(root: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName;
    const inner = [...el.childNodes].map(walk).join("");
    if (tag === "BR") return "\n";
    if (tag === "STRONG" || tag === "B") return inner ? `*${inner}*` : "";
    if (tag === "EM" || tag === "I") return inner ? `_${inner}_` : "";
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") return inner ? `~${inner}~` : "";
    if (tag === "CODE") return inner ? `\`${inner}\`` : "";
    if (tag === "A") {
      const href = el.getAttribute("href") ?? "";
      return href ? `[${inner}](${href})` : inner;
    }
    if (tag === "LI") {
      const parent = el.parentElement?.tagName;
      const text = inner.replace(/\n+$/, "");
      if (parent === "OL") {
        const idx = [...el.parentElement!.children].filter((c) => c.tagName === "LI").indexOf(el) + 1;
        return `${idx}. ${text}\n`;
      }
      return `• ${text}\n`;
    }
    if (tag === "UL" || tag === "OL") return inner;
    if (tag === "BLOCKQUOTE") {
      return inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : line))
        .join("\n");
    }
    if (tag === "DIV" || tag === "P") {
      const next = inner.replace(/\n+$/, "");
      return next ? `${next}\n` : "";
    }
    return inner;
  };
  return walk(root).replace(/\n+$/, "").replace(/^\n+/, "").trimEnd();
}

export function textBeforeCaret(root: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return root.innerText;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(sel.anchorNode ?? root, sel.anchorOffset);
  return range.toString();
}

export function editorIsEmpty(el: HTMLElement) {
  if (el.querySelector("ul, ol, img")) return false;
  return el.innerText.replace(/\u200B|\n/g, "").trim().length === 0;
}
