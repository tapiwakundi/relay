export const TYPING_HOLD_MS = 4000;
export const TYPING_EMIT_MS = 2000;

export type TypingEntry = { name: string; parentId: string | null };

export function formatTyping(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

export function noteTyping(
  typers: Record<string, TypingEntry>,
  userId: string,
  name: string,
  parentId: string | null,
): Record<string, TypingEntry> {
  const parent = parentId ?? null;
  const current = typers[userId];
  if (current && current.name === name && current.parentId === parent) return typers;
  return { ...typers, [userId]: { name, parentId: parent } };
}

export function clearTyping(typers: Record<string, TypingEntry>, userId: string): Record<string, TypingEntry> {
  if (!(userId in typers)) return typers;
  const next = { ...typers };
  delete next[userId];
  return next;
}

export function typingLabel(typers: Record<string, TypingEntry>, parentId: string | null): string | null {
  const names = Object.values(typers)
    .filter((typer) => (typer.parentId ?? null) === parentId)
    .map((typer) => typer.name);
  return formatTyping(names);
}

export function nextTypingEmit(lastAt: number, now = Date.now()): number | null {
  if (now - lastAt < TYPING_EMIT_MS) return null;
  return now;
}
