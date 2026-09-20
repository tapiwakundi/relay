import { and, eq, isNull } from "drizzle-orm";
import { requireChannelMember } from "./access.js";
import type { AppDb } from "./db/index.js";
import { huddle, huddleParticipant } from "./db/schema.js";
import { isUniqueViolation } from "./errors.js";
import { huddleEvent, type Hub } from "./hub.js";
import { mintLivekitToken } from "./livekit.js";
import { hydrateHuddle } from "./queries.js";

export async function joinHuddle(
  db: AppDb,
  hub: Hub,
  opts: { channelId: string; userId: string; userName: string },
) {
  const access = await requireChannelMember(db, opts.channelId, opts.userId);
  let [h] = await db
    .select()
    .from(huddle)
    .where(and(eq(huddle.channelId, opts.channelId), isNull(huddle.endedAt)))
    .limit(1);
  if (!h) {
    const created = {
      id: crypto.randomUUID(),
      channelId: opts.channelId,
      startedBy: opts.userId,
      livekitRoom: `huddle_${opts.channelId}`,
    };
    try {
      await db.insert(huddle).values(created);
      h = { ...created, startedAt: new Date(), endedAt: null };
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
  const token = await mintLivekitToken({
    room: h.livekitRoom,
    identity: opts.userId,
    name: opts.userName,
  });
  return { huddle: state, livekit: token };
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

export async function endHuddleIfEmpty(db: AppDb, huddleId: string) {
  const parts = await db.select().from(huddleParticipant).where(eq(huddleParticipant.huddleId, huddleId));
  if (parts.length === 0) {
    await db.update(huddle).set({ endedAt: new Date() }).where(eq(huddle.id, huddleId));
  }
}
