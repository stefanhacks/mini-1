import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snapToArtPixels } from "./art-grid.ts";

describe("snapToArtPixels", () => {
  it("keeps a whole position with a top-left anchor, and rounds a half one", () => {
    assert.equal(snapToArtPixels(310, 0, 32), 310);
    assert.equal(snapToArtPixels(309.4, 0, 32), 309);
  });

  it("puts the leading edge of a centre-anchored sprite on a whole pixel", () => {
    // 32 px boat: centre 309.5 has its top at 293.5; snapping moves it to 294 (centre 310).
    assert.equal(snapToArtPixels(309.5, 0.5, 32), 310);
    // 33 px sprite: a whole edge needs a half centre.
    assert.equal(snapToArtPixels(250, 0.5, 33), 250.5);
    assert.equal(snapToArtPixels(249.5, 0.5, 33), 249.5);
  });

  it("follows the drawn size of a scaled sprite", () => {
    // 500 px at 1.05 is 525 px: centred at 250 its edge is at −12.5, snapped to −12 (centre 250.5).
    assert.equal(snapToArtPixels(250, 0.5, 525), 250.5);
  });
});
