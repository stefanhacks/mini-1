import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, PLAYFIELD_SIZE, ZERO_INSETS } from "./layout.ts";
import { MAX_RENDER_SCALE, renderTextureScale } from "./render-scale.ts";

describe("renderTextureScale", () => {
  it("is the largest integer whose PLAYFIELD_SIZE·k texture fits the side", () => {
    assert.equal(renderTextureScale(PLAYFIELD_SIZE), 1);
    assert.equal(renderTextureScale(2 * PLAYFIELD_SIZE - 1), 1);
    assert.equal(renderTextureScale(2 * PLAYFIELD_SIZE), 2);
    assert.equal(renderTextureScale(1081), 2);
    assert.equal(renderTextureScale(1500), 3);
    assert.equal(renderTextureScale(2159), 4);
  });

  it("is capped at MAX_RENDER_SCALE, a 3000² texture", () => {
    assert.equal(MAX_RENDER_SCALE, 6);
    assert.equal(renderTextureScale(3000), 6);
    assert.equal(renderTextureScale(3499), 6);
    assert.equal(renderTextureScale(3500), 6);
    assert.equal(renderTextureScale(7680), 6);
  });

  it("is at least 1, on small, empty and unusable sides", () => {
    for (const side of [499, 267, 1, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(renderTextureScale(side), 1, `side ${side}`);
    }
  });

  it("never makes the texture larger than the square's device pixels once the square reaches PLAYFIELD_SIZE", () => {
    const screens = [
      { width: 390, height: 844, dpr: 3 },
      { width: 412, height: 915, dpr: 2.625 },
      { width: 915, height: 412, dpr: 2.625 },
      { width: 1280, height: 720, dpr: 1 },
      { width: 1024, height: 768, dpr: 2 },
    ];

    for (const screen of screens) {
      const { sideDevicePx } = computeLayout({ ...screen, insets: ZERO_INSETS });
      const k = renderTextureScale(sideDevicePx);

      assert.ok(PLAYFIELD_SIZE * k <= sideDevicePx, `${screen.width}×${screen.height}@${screen.dpr}`);
      assert.ok(PLAYFIELD_SIZE * (k + 1) > sideDevicePx, `${screen.width}×${screen.height}@${screen.dpr}`);
    }
  });
});
