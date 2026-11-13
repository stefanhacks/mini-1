import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, type Layout, PLAYFIELD_SIZE, type Rect, rectToScreen, ZERO_INSETS } from "../core/layout.ts";
import {
  MIN_TEXT_FONT_SIZE,
  placeStoryText,
  storyLinesPerPage,
  TEXT_AREA,
  TEXT_BOX_CENTER,
  TEXT_BOX_RECT,
  TEXT_FONT_SIZE,
  TEXT_LINE_HEIGHT,
  TEXT_PAGE_HEIGHT,
} from "./text-box.ts";

const EPSILON = 1e-9;

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - EPSILON
  && inner.y >= outer.y - EPSILON
  && inner.x + inner.width <= outer.x + outer.width + EPSILON
  && inner.y + inner.height <= outer.y + outer.height + EPSILON;

describe("text box geometry", () => {
  it("sits at Main.unity's y −160, converted to playfield px", () => {
    assert.deepEqual(TEXT_BOX_CENTER, { x: 250, y: 410 });
    assert.deepEqual(TEXT_BOX_RECT, { x: 31, y: 355, width: 438, height: 110 });
    assert.deepEqual(TEXT_AREA, { x: 55, y: 370, width: 390, height: 80 });
  });

  it("nests the text rect in the art and the art in the playfield; a full page centred on y 410 fits the art", () => {
    assert.ok(contains(TEXT_BOX_RECT, TEXT_AREA), "text rect in the art");
    const playfield: Rect = { x: 0, y: 0, width: PLAYFIELD_SIZE, height: PLAYFIELD_SIZE };

    assert.ok(contains(playfield, TEXT_BOX_RECT), "art in the playfield");

    const centre = TEXT_AREA.y + TEXT_AREA.height / 2;

    assert.equal(centre, TEXT_BOX_CENTER.y, "page centre");
    assert.ok(centre - TEXT_PAGE_HEIGHT / 2 >= TEXT_BOX_RECT.y, "page top in the art");
    assert.ok(centre + TEXT_PAGE_HEIGHT / 2 <= TEXT_BOX_RECT.y + TEXT_BOX_RECT.height, "page bottom in the art");
  });
});

describe("placeStoryText", () => {
  it("centres the text block on the text rect (y 410, as the original), on whole device pixels", () => {
    for (const dpr of [1, 2, 2.625, 3]) {
      const layout = computeLayout({ width: 412, height: 915, insets: ZERO_INSETS, dpr });
      const area = rectToScreen(layout, TEXT_AREA);
      const { anchor, wrapWidth } = placeStoryText(layout);

      assert.ok(Math.abs(anchor.x - (area.x + area.width / 2)) <= 0.5 / dpr + EPSILON, `dpr ${dpr}`);
      assert.ok(Math.abs(anchor.y - (area.y + area.height / 2)) <= 0.5 / dpr + EPSILON, `dpr ${dpr}`);
      assert.ok(Math.abs(anchor.x * dpr - Math.round(anchor.x * dpr)) < 1e-6, `dpr ${dpr}`);
      assert.ok(Math.abs(anchor.y * dpr - Math.round(anchor.y * dpr)) < 1e-6, `dpr ${dpr}`);
      assert.equal(wrapWidth, area.width);
    }
  });

  it("scales the original font size with the square, but never under the floor", () => {
    const big = computeLayout({ width: 1280, height: 720, insets: ZERO_INSETS, dpr: 1 });
    const small = computeLayout({ width: 375, height: 667, insets: ZERO_INSETS, dpr: 2 });

    assert.ok(big.scale > 1);
    assert.equal(placeStoryText(big).fontSize, TEXT_FONT_SIZE * big.scale);
    assert.ok(TEXT_FONT_SIZE * small.scale < MIN_TEXT_FONT_SIZE);
    assert.equal(placeStoryText(small).fontSize, MIN_TEXT_FONT_SIZE);
    assert.equal(placeStoryText(small).lineHeight, MIN_TEXT_FONT_SIZE * TEXT_LINE_HEIGHT);
  });
});

describe("storyLinesPerPage", () => {
  const layoutOf = (width: number, height: number, dpr = 1) =>
    computeLayout({ width, height, insets: ZERO_INSETS, dpr });

  it("fits floor(95 × scale / line height) lines, at least 1, never spilling out of the box", () => {
    // 664×390 with 47 px side insets: a 170 px square, scale 0.34, so the 16 px floor applies; line 20 px; 32.3 px
    // of page.
    const insets = { top: 0, right: 47, bottom: 0, left: 47 };
    const small = computeLayout({ width: 664, height: 390, insets, dpr: 3 });
    // `checkFit` checks the page fits the box; the 1-line minimum may overflow a tiny square.
    const CASES: readonly (readonly [name: string, layout: Layout, lines: number | null, checkFit: boolean])[] = [
      // A 720 px square, scale 1.44; font 28.8 px, line 36 px; 136.8 px of page.
      ["1280×720", layoutOf(1280, 720), 3, true],
      // Scale 0.824, font 16.5 px, line 20.6 px; 78.2 px of page.
      ["412×915 at 2.625", layoutOf(412, 915, 2.625), 3, true],
      ["915×412 at 2.625", layoutOf(915, 412, 2.625), null, true],
      ["664×390 with side insets", small, 1, true],
      // At least 1, even on an empty square.
      ["0×0", layoutOf(0, 0), 1, false],
      ["300×300", layoutOf(300, 300), 1, false],
    ];

    for (const [name, layout, expected, checkFit] of CASES) {
      const lines = storyLinesPerPage(layout);

      if (expected !== null) {
        assert.equal(lines, expected, name);
      }

      if (checkFit) {
        const height = lines * placeStoryText(layout).lineHeight;

        assert.ok(height <= TEXT_PAGE_HEIGHT * layout.scale + 1e-9, `${name}: ${height} px spills out of the box`);
      }
    }
  });
});
