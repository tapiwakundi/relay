const silenced = new Set<string>();

export function silenceHuddleRing(huddleId?: string | null) {
  if (huddleId) silenced.add(huddleId);
}

export function huddleRingSilenced(huddleId: string) {
  return silenced.has(huddleId);
}
