import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteIceServers, rewriteIceUrl } from "../src/shared/livekit-ice";

const lookup = (host: string) => (host.endsWith(".livekit.cloud") ? "161.115.185.99" : null);

describe("livekit ice host rewrite", () => {
  it("replaces livekit stun and turn hosts with the resolved address", () => {
    assert.equal(
      rewriteIceUrl("stun:ip-161-115-185-99.host.livekit.cloud:3478", lookup),
      "stun:161.115.185.99:3478",
    );
    assert.equal(
      rewriteIceUrl("turn:ip-161-115-185-99.host.livekit.cloud:3478?transport=udp", lookup),
      "turn:161.115.185.99:3478?transport=udp",
    );
  });

  it("keeps tls turn on a plain socket so the certificate hostname is not required", () => {
    assert.equal(
      rewriteIceUrl("turns:relay-sqn34ht2.turn.livekit.cloud:443?transport=tcp", lookup),
      "turn:161.115.185.99:443?transport=tcp",
    );
  });

  it("leaves other hosts and existing addresses alone", () => {
    assert.equal(rewriteIceUrl("stun:stun.l.google.com:19302", lookup), "stun:stun.l.google.com:19302");
    assert.equal(rewriteIceUrl("stun:161.115.185.99:3478", lookup), "stun:161.115.185.99:3478");
  });

  it("rewrites every url on a server and keeps credentials", () => {
    const [server] = rewriteIceServers(
      [{ urls: ["stun:node.host.livekit.cloud:3478"], username: "u", credential: "c" }],
      lookup,
    )!;
    assert.deepEqual(server, {
      urls: ["stun:161.115.185.99:3478"],
      username: "u",
      credential: "c",
    });
  });
});
