import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, PLAYFIELD_SIZE, type Rect, rectToScreen, ZERO_INSETS } from "../core/layout.ts";
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

  it("keeps the text rect inside the art, and the art inside the playfield", () => {
    assert.ok(contains(TEXT_BOX_RECT, TEXT_AREA));
    assert.ok(contains({ x: 0, y: 0, width: PLAYFIELD_SIZE, height: PLAYFIELD_SIZE }, TEXT_BOX_RECT));
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

  it("fills the 95 art px from the text top to the box bottom", () => {
    assert.equal(TEXT_PAGE_HEIGHT, 95);
  });

  it("keeps a full page inside the box art when it is centred on y 410", () => {
    const centre = TEXT_AREA.y + TEXT_AREA.height / 2;

    assert.equal(centre, TEXT_BOX_CENTER.y);
    assert.ok(centre - TEXT_PAGE_HEIGHT / 2 >= TEXT_BOX_RECT.y);
    assert.ok(centre + TEXT_PAGE_HEIGHT / 2 <= TEXT_BOX_RECT.y + TEXT_BOX_RECT.height);
  });

  it("fits floor(95 × scale / line height) lines, never spilling out of the box", () => {
    // 1280×720: a 720 px square, scale 1.44; font 28.8 px, line 36 px; 136.8 px of page.
    assert.equal(storyLinesPerPage(layoutOf(1280, 720)), 3);
    // 412×915 at 2.625: scale 0.824, font 16.5 px, line 20.6 px; 78.2 px of page.
    assert.equal(storyLinesPerPage(layoutOf(412, 915, 2.625)), 3);
    // 664×390 with 47 px side insets: a 170 px square, scale 0.34, so the 16 px floor applies; line 20 px; 32.3 px
    // of page.
    const insets = { top: 0, right: 47, bottom: 0, left: 47 };
    const small = computeLayout({ width: 664, height: 390, insets, dpr: 3 });

    assert.equal(storyLinesPerPage(small), 1);

    for (const layout of [layoutOf(1280, 720), layoutOf(412, 915, 2.625), layoutOf(915, 412, 2.625), small]) {
      const lines = storyLinesPerPage(layout);

      assert.ok(lines * placeStoryText(layout).lineHeight <= TEXT_PAGE_HEIGHT * layout.scale + 1e-9);
    }
  });

  it("is at least 1, even on an empty square", () => {
    assert.equal(storyLinesPerPage(layoutOf(0, 0)), 1);
    assert.equal(storyLinesPerPage(layoutOf(300, 300)), 1);
  });
});
