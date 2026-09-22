export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export type BodyPart =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string }
  | { type: "strike"; value: string }
  | { type: "mention"; value: string }
  | { type: "link"; value: string; href: string };

export function parseBody(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  const re =
    /\[([^\]]+)\]\((https?:[^)\s]+)\)|`([^`]+)`|\*([^*]+)\*|(^|[\s(])_([^_]+)_|~([^~]+)~|(^|[\s(])@([A-Za-z][A-Za-z0-9._-]*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    if (match.index > last) parts.push({ type: "text", value: body.slice(last, match.index) });
    if (match[1] && match[2]) parts.push({ type: "link", value: match[1], href: match[2] });
    else if (match[3]) parts.push({ type: "code", value: match[3] });
    else if (match[4]) parts.push({ type: "strong", value: match[4] });
    else if (match[6]) {
      if (match[5]) parts.push({ type: "text", value: match[5] });
      parts.push({ type: "em", value: match[6] });
    } else if (match[7]) parts.push({ type: "strike", value: match[7] });
    else if (match[9]) {
      if (match[8]) parts.push({ type: "text", value: match[8] });
      parts.push({ type: "mention", value: `@${match[9]}` });
    }
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return parts.length ? parts : [{ type: "text", value: body }];
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

export function renderBody(body: string) {
  return parseBody(body)
    .map((part) => {
      if (part.type === "text") return escapeHtml(part.value).replaceAll("\n", "<br>");
      if (part.type === "strong") return `<strong>${escapeHtml(part.value)}</strong>`;
      if (part.type === "em") return `<em>${escapeHtml(part.value)}</em>`;
      if (part.type === "code") return `<code>${escapeHtml(part.value)}</code>`;
      if (part.type === "strike") return `<s>${escapeHtml(part.value)}</s>`;
      if (part.type === "mention") return `<span class="mention">${escapeHtml(part.value)}</span>`;
      return `<a href="${escapeAttr(part.href)}" target="_blank" rel="noreferrer">${escapeHtml(part.value)}</a>`;
    })
    .join("");
}
