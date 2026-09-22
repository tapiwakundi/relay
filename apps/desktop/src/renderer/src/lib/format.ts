export { escapeHtml } from "@relay/chat";

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
