import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@relay/shared";
import { Hub, type UnreadBump } from "../src/hub.js";
import { notifyUnreadPush } from "../src/push.js";

const message: ChatMessage = {
  id: "m1",
  channelId: "ch-1",
  parentId: null,
  userId: "author",
  userName: "Ada",
  userImage: null,
  userStatusEmoji: null,
  body: "hello from another account",
  createdAt: new Date().toISOString(),
  updatedAt: null,
  edited: false,
  replyCount: 0,
  latestReplyAt: null,
  replyUserIds: [],
  reactions: [],
};

function bumps(...userIds: string[]): UnreadBump[] {
  return userIds.map((userId) => ({
    userId,
    workspaceId: "ws-1",
    channelId: "ch-1",
    unreadCount: 1,
    mentionCount: 0,
  }));
}

describe("multi-account push delivery", () => {
  it("fans the same device token out to every offline unread recipient", async () => {
    const hub = new Hub();
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [
            { userId: "alice", token: "ExponentPushToken[shared]" },
            { userId: "bob", token: "ExponentPushToken[shared]" },
          ],
        }),
      }),
    };
    const send = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("push/send")) {
        const body = JSON.parse(String(init?.body)) as { to: string; data: { accountId: string } }[];
        return {
          ok: true,
          json: async () => ({ data: body.map(() => ({ status: "ok", id: "t1" })) }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const result = await notifyUnreadPush(db as never, hub, bumps("alice", "bob"), message, send as never);
    expect(result.sent).toBe(2);
    const first = send.mock.calls[0];
    const payload = JSON.parse(String((first?.[1] as RequestInit | undefined)?.body));
    expect(payload.map((item: { data: { accountId: string } }) => item.data.accountId).sort()).toEqual([
      "alice",
      "bob",
    ]);
    expect(payload.every((item: { to: string }) => item.to === "ExponentPushToken[shared]")).toBe(true);
  });

  it("still sends to websocket-online users who are not viewing the channel", async () => {
    const hub = new Hub();
    const online = { readyState: 1, send() {}, on() {} };
    hub.add(online as never, "alice");
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ userId: "alice", token: "ExponentPushToken[alice]" }],
        }),
      }),
    };
    const send = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("push/send")) {
        const body = JSON.parse(String(init?.body)) as { to: string }[];
        return {
          ok: true,
          json: async () => ({ data: body.map(() => ({ status: "ok", id: "t1" })) }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const result = await notifyUnreadPush(db as never, hub, bumps("alice"), message, send as never);
    expect(result.sent).toBe(1);
    expect(send.mock.calls[0]?.[0]).toContain("push/send");
  });

  it("skips users currently viewing the channel", async () => {
    const hub = new Hub();
    const ws = { readyState: 1, send() {}, on() {} };
    const client = hub.add(ws as never, "alice");
    hub.subscribe(client, "ch-1");
    const send = vi.fn();
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ userId: "alice", token: "ExponentPushToken[alice]" }],
        }),
      }),
    };

    const result = await notifyUnreadPush(db as never, hub, bumps("alice"), message, send as never);
    expect(result.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("removes unregistered tokens", async () => {
    const hub = new Hub();
    const deleted: string[][] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ userId: "bob", token: "ExponentPushToken[dead]" }],
        }),
      }),
      delete: () => ({
        where: async () => {
          deleted.push(["ExponentPushToken[dead]"]);
        },
      }),
    };
    const send = vi.fn(async (url: string) => {
      if (String(url).includes("push/send")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
          }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const result = await notifyUnreadPush(db as never, hub, bumps("alice", "bob"), message, send as never);
    expect(result.sent).toBe(1);
    expect(result.removed).toEqual(["ExponentPushToken[dead]"]);
    expect(deleted).toHaveLength(1);
  });
});
