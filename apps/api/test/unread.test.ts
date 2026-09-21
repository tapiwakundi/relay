import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { broadcastUnread, Hub, selectUnreadTargets } from "../src/hub.js";

class FakeSocket {
  readyState = WebSocket.OPEN;
  sent: unknown[] = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  on() {}
}

describe("unread recipients", () => {
  it("badges everyone except the author and whoever is looking at the channel", () => {
    const picked = selectUnreadTargets({
      memberIds: ["author", "viewer", "bob"],
      authorId: "author",
      viewingIds: ["viewer"],
      mentionedUserIds: [],
    });
    expect(picked).toEqual({ mention: [], other: ["bob"] });
  });

  it("counts mentions separately, including @channel", () => {
    const picked = selectUnreadTargets({
      memberIds: ["author", "ada", "bob"],
      authorId: "author",
      viewingIds: [],
      mentionedUserIds: ["ada", "*"],
    });
    expect(picked.mention.sort()).toEqual(["ada", "bob"]);
    expect(picked.other).toEqual([]);
  });

  it("does not badge a thread reply unless it mentions you", () => {
    const picked = selectUnreadTargets({
      memberIds: ["author", "ada", "bob"],
      authorId: "author",
      viewingIds: [],
      mentionedUserIds: ["ada"],
      threadReply: true,
    });
    expect(picked).toEqual({ mention: ["ada"], other: [] });
  });
});

describe("unread broadcast", () => {
  it("tells every socket for that user the channel is read", () => {
    const hub = new Hub();
    const desktop = new FakeSocket();
    const phone = new FakeSocket();
    hub.add(desktop as unknown as WebSocket, "ada");
    hub.add(phone as unknown as WebSocket, "ada");
    broadcastUnread(hub, {
      userId: "ada",
      workspaceId: "ws-1",
      channelId: "ch-1",
      unreadCount: 0,
      mentionCount: 0,
    });
    const event = {
      type: "unread",
      channelId: "ch-1",
      workspaceId: "ws-1",
      unreadCount: 0,
      mentionCount: 0,
    };
    expect(desktop.sent).toEqual([event]);
    expect(phone.sent).toEqual([event]);
  });
});
