import { and, eq, isNull } from "drizzle-orm";
import { HttpError, requireChannelMember } from "./access.js";
import type { AppDb } from "./db/index.js";
import { channelMember, huddle, huddleParticipant } from "./db/schema.js";
import { isUniqueViolation } from "./errors.js";
import { huddleEvent, type Hub } from "./hub.js";
import { mintLivekitToken } from "./livekit.js";
import { notifyHuddleCall } from "./push.js";
import { hydrateHuddle } from "./queries.js";

export async function joinHuddle(
  db: AppDb,
  hub: Hub,
  opts: { channelId: string; userId: string; userName: string; create?: boolean },
) {
  const access = await requireChannelMember(db, opts.channelId, opts.userId);
  let [h] = await db
    .select()
    .from(huddle)
    .where(and(eq(huddle.channelId, opts.channelId), isNull(huddle.endedAt)))
    .limit(1);
  let started = false;
  if (!h) {
    if (opts.create === false) {
      return { huddle: null, livekit: { url: null, token: null }, missed: true as const };
    }
    const id = crypto.randomUUID();
    const created = {
      id,
      channelId: opts.channelId,
      startedBy: opts.userId,
      livekitRoom: `huddle_${id}`,
    };
    try {
      await db.insert(huddle).values(created);
      h = { ...created, startedAt: new Date(), endedAt: null };
      started = true;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const [again] = await db
        .select()
        .from(huddle)
        .where(and(eq(huddle.channelId, opts.channelId), isNull(huddle.endedAt)))
        .limit(1);
      if (!again) throw err;
      h = again;
    }
  }
  await db.insert(huddleParticipant).values({ huddleId: h.id, userId: opts.userId }).onConflictDoNothing();
  const state = await hydrateHuddle(db, opts.channelId);
  hub.broadcastToChannel(opts.channelId, huddleEvent(opts.channelId, state, access.workspaceId));
  hub.broadcastToWorkspace(access.workspaceId, huddleEvent(opts.channelId, state, access.workspaceId));
  if (started) {
    try {
      await ringHuddle(db, {
        channelId: opts.channelId,
        callerId: opts.userId,
        callerName: opts.userName,
        workspaceId: access.workspaceId,
        huddleId: h.id,
        kind: access.channel.kind,
        channelName: access.channel.name,
      });
    } catch (err) {
      console.error("[huddle] call push failed", err);
    }
  }
  const token = await mintLivekitToken({
    room: h.livekitRoom,
    identity: opts.userId,
    name: opts.userName,
  });
  return { huddle: state, livekit: token, missed: false as const };
}

async function ringHuddle(
  db: AppDb,
  opts: {
    channelId: string;
    callerId: string;
    callerName: string;
    workspaceId: string;
    huddleId: string;
    kind: string;
    channelName: string;
  },
) {
  const members = await db
    .select({ userId: channelMember.userId })
    .from(channelMember)
    .where(and(eq(channelMember.channelId, opts.channelId), isNull(channelMember.leftAt)));
  const place =
    opts.kind === "public" || opts.kind === "private" ? `#${opts.channelName}` : "a direct message";
  await notifyHuddleCall(db, {
    callerName: opts.callerName,
    workspaceId: opts.workspaceId,
    channelId: opts.channelId,
    huddleId: opts.huddleId,
    place,
    recipientIds: members.map((member) => member.userId).filter((id) => id !== opts.callerId),
  });
}

export async function setHuddleMuted(
  db: AppDb,
  hub: Hub,
  opts: { channelId: string; userId: string; muted: boolean },
) {
  const access = await requireChannelMember(db, opts.channelId, opts.userId);
  const [h] = await db
    .select()
    .from(huddle)
    .where(and(eq(huddle.channelId, opts.channelId), isNull(huddle.endedAt)))
    .limit(1);
  if (!h) throw new HttpError(404, "No huddle");
  const [part] = await db
    .select()
    .from(huddleParticipant)
    .where(and(eq(huddleParticipant.huddleId, h.id), eq(huddleParticipant.userId, opts.userId)))
    .limit(1);
  if (!part) throw new HttpError(404, "Not in this huddle");
  await db
    .update(huddleParticipant)
    .set({ muted: opts.muted })
    .where(and(eq(huddleParticipant.huddleId, h.id), eq(huddleParticipant.userId, opts.userId)));
  const state = await hydrateHuddle(db, opts.channelId);
  const event = huddleEvent(opts.channelId, state, access.workspaceId);
  hub.broadcastToChannel(opts.channelId, event);
  hub.broadcastToWorkspace(access.workspaceId, event);
  return { huddle: state };
}

export async function leaveHuddle(db: AppDb, hub: Hub, opts: { channelId: string; userId: string }) {
  const access = await requireChannelMember(db, opts.channelId, opts.userId);
  const [h] = await db
    .select()
    .from(huddle)
    .where(and(eq(huddle.channelId, opts.channelId), isNull(huddle.endedAt)))
    .limit(1);
  if (h) {
    await db
      .delete(huddleParticipant)
      .where(and(eq(huddleParticipant.huddleId, h.id), eq(huddleParticipant.userId, opts.userId)));
    await endHuddleIfEmpty(db, h.id);
  }
  const state = await hydrateHuddle(db, opts.channelId);
  hub.broadcastToWorkspace(access.workspaceId, huddleEvent(opts.channelId, state, access.workspaceId));
  return { huddle: state };
}

export async function leaveOpenHuddles(db: AppDb, hub: Hub, userId: string) {
  const rows = await db
    .select({ channelId: huddle.channelId })
    .from(huddleParticipant)
    .innerJoin(huddle, eq(huddleParticipant.huddleId, huddle.id))
    .where(and(eq(huddleParticipant.userId, userId), isNull(huddle.endedAt)));
  const channelIds = [...new Set(rows.map((row) => row.channelId))];
  let left = 0;
  for (const channelId of channelIds) {
    try {
      await leaveHuddle(db, hub, { channelId, userId });
      left += 1;
    } catch (err) {
      console.error("[huddle] cleanup leave failed", err);
    }
  }
  return left;
}

export async function endHuddleIfEmpty(db: AppDb, huddleId: string) {
  const parts = await db.select().from(huddleParticipant).where(eq(huddleParticipant.huddleId, huddleId));
  if (parts.length === 0) {
    await db.update(huddle).set({ endedAt: new Date() }).where(eq(huddle.id, huddleId));
  }
}
