import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountAuthHeaders } from "../src/lib/account-headers";
import { navFromPush, openPendingIfReady, peekPendingNav, setPendingChannelOpener, setPendingNav, takePendingNav } from "../src/lib/pending-nav";
import { notifyAccountExpired, onAccountExpired } from "../src/lib/session";

describe("mobile account routing", () => {
  it("attaches only the selected account's credentials", () => {
    assert.deepEqual(accountAuthHeaders({ token: "tok-a", cookie: "cookie-a" }), {
      Authorization: "Bearer tok-a",
      Cookie: "cookie-a",
    });
    assert.deepEqual(accountAuthHeaders({ token: "tok-b" }), {
      Authorization: "Bearer tok-b",
    });
    assert.deepEqual(accountAuthHeaders({ token: "", cookie: "" }), {});
  });

  it("switches accounts before opening a notification channel", () => {
    const payload = { accountId: "u2", workspaceId: "ws-2", channelId: "ch-9" };
    assert.deepEqual(navFromPush(payload, "u1"), {
      accountId: "u2",
      workspaceId: "ws-2",
      channelId: "ch-9",
      switchAccount: true,
    });
    assert.equal(navFromPush(payload, "u2")?.switchAccount, false);
    assert.equal(navFromPush({ channelId: "ch-9" }, "u1"), null);
    setPendingNav(payload);
    assert.deepEqual(takePendingNav(), payload);
    assert.equal(takePendingNav(), null);

    setPendingNav(payload);
    assert.equal(openPendingIfReady("u1", "ws-2"), false);
    assert.equal(openPendingIfReady("u2", "ws-1"), false);
    let opened: string | null = null;
    setPendingChannelOpener((channelId) => {
      opened = channelId;
    });
    assert.equal(openPendingIfReady("u2", "ws-2"), true);
    assert.equal(opened, "ch-9");
    assert.equal(peekPendingNav(), null);
  });

  it("scoped 401 notifies only the expired account id", () => {
    const seen: Array<string | null> = [];
    const stop = onAccountExpired((id) => seen.push(id));
    notifyAccountExpired("u2");
    stop();
    notifyAccountExpired("u1");
    assert.deepEqual(seen, ["u2"]);
  });
});
