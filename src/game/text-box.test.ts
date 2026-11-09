import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, PLAYFIELD_SIZE, type Rect, ZERO_INSETS } from "../core/layout.ts";
import {
  MIN_TEXT_FONT_SIZE,
  placeStoryText,
  rectToScreen,
  TEXT_AREA,
  TEXT_BOX_CENTER,
  TEXT_BOX_RECT,
  TEXT_FONT_SIZE,
  TEXT_LINE_HEIGHT,
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

describe("rectToScreen", () => {
  it("maps a playfield rect through the layout's square", () => {
    const layout = computeLayout({ width: 1280, height: 720, insets: ZERO_INSETS, dpr: 1 });
    const rect = rectToScreen(layout, TEXT_AREA);

    assert.ok(Math.abs(rect.x - (layout.square.x + TEXT_AREA.x * layout.scale)) < EPSILON);
    assert.ok(Math.abs(rect.y - (layout.square.y + TEXT_AREA.y * layout.scale)) < EPSILON);
    assert.ok(Math.abs(rect.width - TEXT_AREA.width * layout.scale) < EPSILON);
    assert.ok(Math.abs(rect.height - TEXT_AREA.height * layout.scale) < EPSILON);
  });
});

describe("placeStoryText", () => {
  it("anchors the text top-centre in the text rect, on whole device pixels", () => {
    for (const dpr of [1, 2, 2.625, 3]) {
      const layout = computeLayout({ width: 412, height: 915, insets: ZERO_INSETS, dpr });
      const area = rectToScreen(layout, TEXT_AREA);
      const { anchor, wrapWidth } = placeStoryText(layout);

      assert.ok(Math.abs(anchor.x - (area.x + area.width / 2)) <= 0.5 / dpr + EPSILON, `dpr ${dpr}`);
      assert.ok(Math.abs(anchor.y - area.y) <= 0.5 / dpr + EPSILON, `dpr ${dpr}`);
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
