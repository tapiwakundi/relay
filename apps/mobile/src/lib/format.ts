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
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 5 * 60_000;
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

export const ICON_COLORS = ["#4A154B", "#1264A3", "#007A5A", "#E01E5A", "#3F0E40", "#1164A3", "#ECB22E", "#E51670"];

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
    /\[([^\]]+)\]\((https?:[^)\s]+)\)|`([^`]+)`|\*([^*]+)\*|_([^_]+)_|~([^~]+)~|@([A-Za-z][A-Za-z0-9._-]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push({ type: "text", value: body.slice(last, m.index) });
    if (m[1] && m[2]) parts.push({ type: "link", value: m[1], href: m[2] });
    else if (m[3]) parts.push({ type: "code", value: m[3] });
    else if (m[4]) parts.push({ type: "strong", value: m[4] });
    else if (m[5]) parts.push({ type: "em", value: m[5] });
    else if (m[6]) parts.push({ type: "strike", value: m[6] });
    else if (m[7]) parts.push({ type: "mention", value: `@${m[7]}` });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return parts.length ? parts : [{ type: "text", value: body }];
}
