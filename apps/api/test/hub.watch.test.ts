import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Hub } from "../src/hub.js";

class FakeSocket {
  readyState = WebSocket.OPEN;
  sent: unknown[] = [];
  private closeHandlers: Array<() => void> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  on(event: string, handler: () => void) {
    if (event === "close") this.closeHandlers.push(handler);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
    for (const handler of this.closeHandlers) handler();
  }
}

describe("hub watch vs view", () => {
  it("delivers channel events to watchers without treating them as viewing", () => {
    const hub = new Hub();
    const viewer = new FakeSocket();
    const watcher = new FakeSocket();
    const viewClient = hub.add(viewer as unknown as WebSocket, "viewer");
    const watchClient = hub.add(watcher as unknown as WebSocket, "watcher");
    hub.subscribe(viewClient, "ch-1");
    hub.watch(watchClient, "ch-1");

    hub.broadcastToChannel("ch-1", { type: "error", message: "hello" });

    expect(viewer.sent).toHaveLength(1);
    expect(watcher.sent).toHaveLength(1);
    expect(hub.isViewing("viewer", "ch-1")).toBe(true);
    expect(hub.isViewing("watcher", "ch-1")).toBe(false);
    expect(hub.isWatching("watcher", "ch-1")).toBe(true);
  });

  it("keeps watches when the user stops viewing a channel", () => {
    const hub = new Hub();
    const sock = new FakeSocket();
    const client = hub.add(sock as unknown as WebSocket, "u1");
    hub.subscribe(client, "ch-1");
    hub.unsubscribe(client, "ch-1");
    expect(hub.isViewing("u1", "ch-1")).toBe(false);
    expect(hub.isWatching("u1", "ch-1")).toBe(true);
  });

  it("does not clear watches when switching workspaces", () => {
    const hub = new Hub();
    const sock = new FakeSocket();
    const client = hub.add(sock as unknown as WebSocket, "u1", "ws-a");
    hub.watch(client, "ch-1");
    hub.setWorkspace(client, "ws-b");
    expect(hub.isWatching("u1", "ch-1")).toBe(true);
  });
});
