import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snapToArtPixels } from "./art-grid.ts";

describe("snapToArtPixels", () => {
  it("puts the sprite's leading edge on a whole pixel, for its anchor and drawn size", () => {
    const CASES: readonly (readonly [name: string, pos: number, anchor: number, size: number, snapped: number])[] = [
      ["whole, top-left anchor", 310, 0, 32, 310],
      ["fractional, top-left anchor", 309.4, 0, 32, 309],
      // 32 px boat: centre 309.5 has its top at 293.5; snapping moves it to 294 (centre 310).
      ["32 px boat, centred", 309.5, 0.5, 32, 310],
      // 33 px sprite: a whole edge needs a half centre.
      ["33 px, centred on a whole pixel", 250, 0.5, 33, 250.5],
      ["33 px, centred on a half pixel", 249.5, 0.5, 33, 249.5],
      // 500 px at 1.05 is 525 px: centred at 250 its edge is at −12.5, snapped to −12 (centre 250.5).
      ["scaled 525 px, centred", 250, 0.5, 525, 250.5],
    ];

    for (const [name, pos, anchor, size, snapped] of CASES) {
      assert.equal(snapToArtPixels(pos, anchor, size), snapped, name);
    }
  });
});
