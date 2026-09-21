import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LOCAL_API_URL,
  PROD_API_URL,
  assertDesktopApiUrl,
  desktopEnvFile,
  loadDesktopEnv,
  resolveDesktopAppEnv,
} from "../src/env";

describe("desktop env", () => {
  it("picks local for serve and prod for build", () => {
    const prev = process.env.APP_ENV;
    delete process.env.APP_ENV;
    try {
      assert.equal(resolveDesktopAppEnv("serve"), "local");
      assert.equal(resolveDesktopAppEnv("build"), "prod");
    } finally {
      if (prev === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prev;
    }
  });

  it("honors APP_ENV when set", () => {
    const prev = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "prod";
      assert.equal(resolveDesktopAppEnv("serve"), "prod");
      process.env.APP_ENV = "local";
      assert.equal(resolveDesktopAppEnv("build"), "local");
    } finally {
      if (prev === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prev;
    }
  });

  it("maps env files like mobile", () => {
    assert.equal(desktopEnvFile("local"), ".env.local");
    assert.equal(desktopEnvFile("prod"), ".env.prod");
  });

  it("rejects a public API during local runs", () => {
    assert.throws(() => assertDesktopApiUrl("local", PROD_API_URL), /Refusing APP_ENV=local/);
    assert.doesNotThrow(() => assertDesktopApiUrl("local", LOCAL_API_URL));
    assert.doesNotThrow(() => assertDesktopApiUrl("local", "http://192.168.1.82:3001"));
  });

  it("rejects localhost during packaged runs", () => {
    assert.throws(() => assertDesktopApiUrl("prod", LOCAL_API_URL), /Refusing APP_ENV=prod/);
    assert.doesNotThrow(() => assertDesktopApiUrl("prod", PROD_API_URL));
  });

  it("writes .env.local and loads RELAY_API_URL", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-desktop-env-"));
    const prev = process.env.RELAY_API_URL;
    process.env.RELAY_API_URL = PROD_API_URL;
    try {
      const loaded = loadDesktopEnv(root, "local");
      assert.equal(loaded.file, ".env.local");
      assert.equal(loaded.origin, LOCAL_API_URL);
      assert.equal(process.env.RELAY_API_URL, LOCAL_API_URL);
      assert.match(readFileSync(join(root, ".env.local"), "utf8"), /localhost:3001/);
    } finally {
      if (prev === undefined) delete process.env.RELAY_API_URL;
      else process.env.RELAY_API_URL = prev;
    }
  });

  it("requires .env.prod for production", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-desktop-env-"));
    assert.throws(() => loadDesktopEnv(root, "prod"), /Missing \.env\.prod/);
    writeFileSync(join(root, ".env.prod"), `RELAY_API_URL=${PROD_API_URL}\n`);
    const prev = process.env.RELAY_API_URL;
    try {
      const loaded = loadDesktopEnv(root, "prod");
      assert.equal(loaded.origin, PROD_API_URL);
    } finally {
      if (prev === undefined) delete process.env.RELAY_API_URL;
      else process.env.RELAY_API_URL = prev;
    }
  });
});
