import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pairKey } from "../src/domain.js";
import { extractMentions } from "../src/hub.js";

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/0000_clumsy_tempest.sql"),
  "utf8",
);

describe("v1 migration baseline", () => {
  it("uses native uuid domain keys and Better Auth text ids", () => {
    expect(sql).toContain('CREATE TABLE "workspace"');
    expect(sql).toMatch(/"id" uuid PRIMARY KEY/);
    expect(sql).toContain('CREATE TABLE "user"');
    expect(sql).toContain('"id" text PRIMARY KEY');
    expect(sql).toContain('"issuer" text DEFAULT \'\' NOT NULL');
    expect(sql).toContain("account_issuer_account_id_uidx");
  });

  it("encodes tenant isolation and thread rules", () => {
    expect(sql).toContain("channel_member_workspace_member_fk");
    expect(sql).toContain("message_channel_workspace_fk");
    expect(sql).toContain("channel_member_channel_workspace_fk");
    expect(sql).toContain("relay_assert_message_thread");
    expect(sql).toContain("huddle_one_open_per_channel_uidx");
    expect(sql).toContain("invite_pending_email_uidx");
    expect(sql).toContain("channel_dm_key_uidx");
    expect(sql).toContain("CREATE TABLE \"user_preference\"");
    expect(sql).toContain("CREATE TABLE \"attachment\"");
  });
});

describe("domain helpers", () => {
  it("canonicalizes DM keys", () => {
    expect(pairKey(["b", "a"])).toBe(pairKey(["a", "b"]));
  });

  it("extracts mentions including channel-wide", () => {
    const map = new Map([["ada", "u1"]]);
    expect(extractMentions("hi @Ada", map)).toEqual(["u1"]);
    expect(extractMentions("hello @channel", map)).toEqual(["*"]);
  });
});
