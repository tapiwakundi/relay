import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Channel, ChatMessage } from "@relay/shared";
import {
  applyWsEvent,
  clearChannelUnread,
  keys,
  queryClient,
  setViewedChannelId,
  type Bootstrap,
} from "../src/renderer/src/lib/query";

function channel(unreadCount: number, mentionCount = 0): Channel {
  return {
    id: "ch-1",
    workspaceId: "ws-1",
    name: "general",
    topic: null,
    description: null,
    isPrivate: false,
    isDm: false,
    isMpim: false,
    dmName: null,
    unreadCount,
    mentionCount,
    isMuted: false,
    isStarred: false,
    section: "channels",
    huddle: null,
    memberCount: 2,
  };
}

function message(id: string, userId = "someone"): ChatMessage {
  return {
    id,
    channelId: "ch-1",
    parentId: null,
    userId,
    userName: "Ada",
    userImage: null,
    userStatusEmoji: null,
    body: "hello",
    createdAt: new Date().toISOString(),
    updatedAt: null,
    edited: false,
    replyCount: 0,
    latestReplyAt: null,
    replyUserIds: [],
    reactions: [],
  };
}

function unread() {
  return queryClient.getQueryData<Bootstrap>(keys.bootstrap("ws-1"))?.channels[0];
}

describe("channel read state in the desktop cache", () => {
  it("keeps the server unread count instead of inventing one from a live message", () => {
    queryClient.clear();
    setViewedChannelId(null);
    queryClient.setQueryData<Bootstrap>(keys.bootstrap("ws-1"), {
      workspace: {
        id: "ws-1",
        name: "Relay",
        slug: "relay",
        iconColor: "#111",
        iconLetter: "R",
        iconUrl: null,
        plan: "free",
      },
      members: [],
      channels: [channel(4, 1)],
    });

    applyWsEvent({ type: "message.created", message: message("m-1") }, "me");

    assert.equal(unread()?.unreadCount, 4);
    assert.equal(unread()?.mentionCount, 1);
    assert.equal(queryClient.getQueryData(keys.messages("ch-1", null)), undefined);

    applyWsEvent({ type: "unread", channelId: "ch-1", workspaceId: "ws-1", unreadCount: 5, mentionCount: 1 }, "me");
    assert.equal(unread()?.unreadCount, 5);
    assert.equal(unread()?.mentionCount, 1);
  });

  it("clears the open channel even if a late unread event arrives", () => {
    queryClient.clear();
    setViewedChannelId("ch-1");
    queryClient.setQueryData<Bootstrap>(keys.bootstrap("ws-1"), {
      workspace: {
        id: "ws-1",
        name: "Relay",
        slug: "relay",
        iconColor: "#111",
        iconLetter: "R",
        iconUrl: null,
        plan: "free",
      },
      members: [],
      channels: [channel(4, 2)],
    });
    queryClient.setQueryData(keys.messages("ch-1", null), {
      messages: [message("m-0")],
      huddle: null,
    });

    clearChannelUnread("ch-1");
    assert.equal(unread()?.unreadCount, 0);
    assert.equal(unread()?.mentionCount, 0);

    applyWsEvent({ type: "message.created", message: message("m-2") }, "me");
    applyWsEvent({ type: "unread", channelId: "ch-1", workspaceId: "ws-1", unreadCount: 6, mentionCount: 2 }, "me");

    assert.equal(unread()?.unreadCount, 0);
    assert.equal(unread()?.mentionCount, 0);
    const page = queryClient.getQueryData<{ messages: ChatMessage[]; huddle: null }>(keys.messages("ch-1", null));
    assert.equal(page?.messages.length, 2);
    assert.equal(page?.huddle, null);
    setViewedChannelId(null);
  });
});
