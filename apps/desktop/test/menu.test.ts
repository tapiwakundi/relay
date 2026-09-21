import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applicationMenuTemplate, CHECK_FOR_UPDATES_ID } from "../src/main/menu-template";

function labels(items: ReturnType<typeof applicationMenuTemplate>[number]["submenu"]) {
  return (items ?? []).map((item) => item.id ?? item.label ?? item.role ?? item.type);
}

describe("desktop application menu", () => {
  it("puts Check for Updates in the macOS Relay menu", () => {
    const template = applicationMenuTemplate("darwin", "Relay");
    assert.equal(template[0]?.label, "Relay");
    assert.deepEqual(labels(template[0]?.submenu).slice(0, 4), [
      "about",
      "separator",
      CHECK_FOR_UPDATES_ID,
      "separator",
    ]);
  });

  it("puts Check for Updates in the Help menu on Windows and Linux", () => {
    for (const platform of ["win32", "linux"] as const) {
      const help = applicationMenuTemplate(platform, "Relay").find((item) => item.role === "help");
      assert.ok(help?.submenu?.some((item) => item.id === CHECK_FOR_UPDATES_ID), platform);
    }
  });
});
