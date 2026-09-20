import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregatedUnread,
  navigationFromNotification,
  shouldSuppressDesktopNotification,
} from "../src/main/notification-logic";

describe("desktop account-tagged notifications", () => {
  it("suppresses only when the matching account is focused on that channel", () => {
    const view = { accountId: "u1", channelId: "ch-1", focused: true, minimized: false };
    assert.equal(
      shouldSuppressDesktopNotification(view, { meId: "u1", accountId: "u1" }, { userId: "u2", channelId: "ch-1" }),
      true,
    );
    assert.equal(
      shouldSuppressDesktopNotification(view, { meId: "u1", accountId: "u2" }, { userId: "u3", channelId: "ch-1" }),
      false,
    );
    assert.equal(
      shouldSuppressDesktopNotification(
        { ...view, focused: false },
        { meId: "u1", accountId: "u1" },
        { userId: "u2", channelId: "ch-1" },
      ),
      false,
    );
  });

  it("navigates to the payload account, workspace, and channel", () => {
    assert.deepEqual(navigationFromNotification({ accountId: "u2", workspaceId: "ws-9" }, "ch-4"), {
      accountId: "u2",
      workspaceId: "ws-9",
      channelId: "ch-4",
    });
  });

  it("aggregates unread badges across accounts", () => {
    assert.equal(aggregatedUnread([2, 0, 5]), 7);
  });
});
