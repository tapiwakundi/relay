import type { Channel, Member } from "@relay/shared";

export function channelTitle(channel: Pick<Channel, "name" | "isDm">) {
  return channel.isDm ? channel.name : `# ${channel.name}`;
}

export function dmPeer(members: readonly Member[], channel: Pick<Channel, "name" | "dmName">, meId: string) {
  const label = channel.dmName ?? channel.name;
  const first = label.split(",")[0]?.trim();
  const me = members.find((member) => member.userId === meId);
  if (me && (me.displayName === label || me.name === label)) return me;
  return members.find(
    (member) =>
      member.userId !== meId &&
      (member.displayName === label || member.name === label || member.displayName === first || member.name === first),
  );
}

export function sectionAfterStar(channel: Pick<Channel, "isDm">, isStarred: boolean): Channel["section"] {
  if (isStarred) return "starred";
  return channel.isDm ? "direct" : "channels";
}

function matchesQuery(member: Member, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    member.displayName.toLowerCase().includes(q) ||
    member.name.toLowerCase().includes(q) ||
    member.email.toLowerCase().includes(q)
  );
}

export function channelMembers(
  members: Member[],
  memberIds: Iterable<string>,
  opts: { query?: string; onlineOnly?: boolean } = {},
) {
  const ids = new Set(memberIds);
  return members
    .filter((member) => ids.has(member.userId))
    .filter((member) => (opts.onlineOnly ? member.presence === "active" : true))
    .filter((member) => matchesQuery(member, opts.query ?? ""))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function membersNotInChannel(members: Member[], memberIds: Iterable<string>) {
  const ids = new Set(memberIds);
  return members.filter((member) => !ids.has(member.userId)).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
