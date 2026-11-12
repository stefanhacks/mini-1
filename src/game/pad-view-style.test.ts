import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, type Rect, ZERO_INSETS } from "../core/layout.ts";
import { DIRECTIONS } from "./direction.ts";
import { computePads } from "./input/pad-geometry.ts";
import {
  buttonArt,
  buttonStyle,
  HINT_STYLE,
  IDLE_STYLE,
  PAD_GREY,
  PRESSED_STYLE,
} from "./pad-view-style.ts";

const isWhole = (value: number) => Math.abs(value - Math.round(value)) < 1e-9;

const contains = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

describe("buttonStyle", () => {
  it("shows a press over a hint, and a hint over idle", () => {
    assert.equal(buttonStyle(true, true), PRESSED_STYLE);
    assert.equal(buttonStyle(true, false), PRESSED_STYLE);
    assert.equal(buttonStyle(false, true), HINT_STYLE);
    assert.equal(buttonStyle(false, false), IDLE_STYLE);
  });
});

describe("pad grey", () => {
  it("draws the idle outline and arrow in #767676, the story's voice grey", () => {
    assert.equal(PAD_GREY, "#767676");
    assert.equal(IDLE_STYLE.outline, "#767676");
    assert.equal(IDLE_STYLE.arrow, "#767676");
  });
});

describe("buttonArt", () => {
  const rect: Rect = { x: 100.4, y: 200.7, width: 59.3, height: 59.3 };

  it("keeps the body inside the button rect, on whole device pixels", () => {
    for (const dpr of [1, 2, 3]) {
      const { body, outlineWidth } = buttonArt(rect, "up", dpr);

      assert.ok(contains(rect, body.x, body.y) && contains(rect, body.x + body.width, body.y + body.height));
      for (const edge of [body.x, body.y, body.x + body.width, body.y + body.height]) {
        assert.ok(isWhole(edge * dpr), `edge ${edge} at dpr ${dpr}`);
      }
      assert.ok(isWhole(outlineWidth * dpr) && outlineWidth >= 1);
    }
  });

  it("points the arrow's tip toward its direction, inside the body", () => {
    const centreX = rect.x + rect.width / 2;
    const centreY = rect.y + rect.height / 2;

    for (const dir of DIRECTIONS) {
      const { body, arrow } = buttonArt(rect, dir, 2);
      const [tipX, tipY] = arrow;

      assert.equal(arrow.length, 6);
      for (let index = 0; index < arrow.length; index += 2) {
        assert.ok(contains(body, arrow[index], arrow[index + 1]));
      }

      const offset = { up: centreY - tipY, down: tipY - centreY, left: centreX - tipX, right: tipX - centreX }[dir];

      assert.ok(offset > 5, `${dir} tip offset ${offset}`);
    }
  });

  it("leaves a gap between neighbouring buttons on a real pad", () => {
    const layout = computeLayout({ width: 390, height: 844, insets: ZERO_INSETS, dpr: 3 });
    const [pad] = computePads(layout);
    const up = buttonArt(pad.buttons.up, "up", layout.dpr).body;
    const left = buttonArt(pad.buttons.left, "left", layout.dpr).body;

    assert.ok(pad.buttonSize >= 48);
    assert.ok(left.x + left.width < up.x);
    assert.ok(up.y + up.height < left.y);
  });
});
