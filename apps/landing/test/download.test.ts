import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectDesktopOs,
  downloadUrl,
  macChipFromArchitecture,
  macChipFromGpu,
  suggestDownload,
} from "../src/download.ts";

describe("desktop download suggestion", () => {
  it("sends Windows visitors to the 64-bit installer", () => {
    const os = detectDesktopOs({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0",
      platform: "Win32",
    });
    const target = suggestDownload({ os, macChip: "x64" });
    assert.equal(target.filename, "Relay-win-x64.exe");
    assert.equal(downloadUrl(target.filename), "https://github.com/tapiwakundi/relay/releases/latest/download/Relay-win-x64.exe");
  });

  it("sends Apple Silicon Macs to the arm64 disk image", () => {
    const os = detectDesktopOs({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    assert.equal(os, "mac");
    assert.equal(macChipFromArchitecture("arm"), "arm64");
    assert.equal(macChipFromGpu("Apple M3"), "arm64");
    const target = suggestDownload({ os, macChip: "arm64" });
    assert.equal(target.filename, "Relay-mac-arm64.dmg");
  });

  it("sends Intel Macs to the x64 disk image", () => {
    const os = detectDesktopOs({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0",
      platform: "MacIntel",
    });
    assert.equal(macChipFromArchitecture("x86"), "x64");
    assert.equal(macChipFromGpu("Intel Iris Plus Graphics"), "x64");
    const target = suggestDownload({ os, macChip: "x64" });
    assert.equal(target.filename, "Relay-mac-x64.dmg");
  });

  it("defaults unknown Macs and other devices to Apple Silicon", () => {
    const mac = detectDesktopOs({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
    });
    assert.equal(suggestDownload({ os: mac, macChip: null }).filename, "Relay-mac-arm64.dmg");
    assert.equal(suggestDownload({ os: "other", macChip: null }).filename, "Relay-mac-arm64.dmg");
  });

  it("does not treat phones or iPad desktop mode as a Mac download", () => {
    assert.equal(
      detectDesktopOs({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        platform: "iPhone",
      }),
      "other",
    );
    assert.equal(
      detectDesktopOs({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
      "other",
    );
  });
});
