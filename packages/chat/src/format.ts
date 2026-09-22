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

export function formatStamp(iso: string) {
  return `${formatDay(iso)} at ${formatTime(iso)}`;
}

export function formatCreatedOn(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
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
