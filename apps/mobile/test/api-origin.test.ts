import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCTION_API_ORIGIN, resolveApiOrigin } from "../src/lib/api-origin";

describe("mobile api origin", () => {
  it("uses the LAN env while Metro is attached", () => {
    assert.equal(
      resolveApiOrigin({
        env: "http://192.168.1.82:3001",
        dev: true,
        hostUri: "192.168.1.82:8081",
      }),
      "http://192.168.1.82:3001",
    );
  });

  it("ignores LAN env in TestFlight and other installs without Metro", () => {
    assert.equal(
      resolveApiOrigin({ env: "http://192.168.1.82:3001", dev: false }),
      PRODUCTION_API_ORIGIN,
    );
    assert.equal(
      resolveApiOrigin({ env: "http://192.168.1.82:3001", dev: true, hostUri: "" }),
      PRODUCTION_API_ORIGIN,
    );
    assert.equal(resolveApiOrigin({ env: "http://localhost:3001", dev: false }), PRODUCTION_API_ORIGIN);
  });

  it("allows an explicit https production override in release", () => {
    assert.equal(
      resolveApiOrigin({ env: "https://relay.example.com/", dev: false }),
      "https://relay.example.com",
    );
  });
});
