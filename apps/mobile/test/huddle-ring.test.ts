import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { huddleRingSilenced, silenceHuddleRing } from "../src/lib/huddle-ring";

describe("huddle ring", () => {
  it("stays quiet for a huddle after you join or decline it", () => {
    assert.equal(huddleRingSilenced("huddle-1"), false);
    silenceHuddleRing("huddle-1");
    assert.equal(huddleRingSilenced("huddle-1"), true);
    assert.equal(huddleRingSilenced("huddle-2"), false);
    silenceHuddleRing(null);
    silenceHuddleRing(undefined);
    assert.equal(huddleRingSilenced("huddle-2"), false);
  });
});
