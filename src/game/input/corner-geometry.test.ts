import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, type Insets, type Rect, type ScreenInfo, ZERO_INSETS } from "../../core/layout.ts";
import {
  CORNER_BUTTONS,
  CORNER_HIT_SIZE,
  CORNER_ICON_SIZE,
  cornerButtonRect,
  cornerIconBox,
  hitsCornerButton,
} from "./corner-geometry.ts";
import { computePads } from "./pad-geometry.ts";

const insets = (top: number, right: number, bottom: number, left: number): Insets => ({ top, right, bottom, left });

interface Device {
  readonly name: string;
  readonly screen: ScreenInfo;
}

// The presets of src/core/layout.test.ts.
const DEVICES: readonly Device[] = [
  { name: "iPhone SE", screen: { width: 375, height: 667, insets: insets(20, 0, 0, 0), dpr: 2 } },
  { name: "iPhone 13", screen: { width: 390, height: 844, insets: insets(47, 0, 34, 0), dpr: 3 } },
  { name: "iPhone 13 landscape", screen: { width: 844, height: 390, insets: insets(0, 47, 21, 47), dpr: 3 } },
  { name: "Pixel 7", screen: { width: 412, height: 915, insets: ZERO_INSETS, dpr: 2.625 } },
  { name: "Pixel 7 landscape", screen: { width: 915, height: 412, insets: ZERO_INSETS, dpr: 2.625 } },
  { name: "iPad", screen: { width: 768, height: 1024, insets: ZERO_INSETS, dpr: 2 } },
  { name: "iPad landscape", screen: { width: 1024, height: 768, insets: ZERO_INSETS, dpr: 2 } },
  { name: "1:1 window", screen: { width: 600, height: 600, insets: ZERO_INSETS, dpr: 1 } },
  { name: "desktop 16:9", screen: { width: 1280, height: 720, insets: ZERO_INSETS, dpr: 1 } },
  { name: "iPhone 15", screen: { width: 393, height: 852, insets: insets(59, 0, 34, 0), dpr: 3 } },
  { name: "iPhone 15 landscape", screen: { width: 852, height: 393, insets: insets(0, 59, 21, 59), dpr: 3 } },
  // A 64 device px camera cutout and a 48 device px gesture bar, as Android reports them: fractional CSS px.
  {
    name: "Android cutout",
    screen: { width: 412, height: 915, insets: insets(64 / 2.625, 0, 48 / 2.625, 0), dpr: 2.625 },
  },
  {
    name: "Android cutout landscape",
    screen: { width: 915, height: 412, insets: insets(0, 64 / 2.625, 0, 64 / 2.625), dpr: 2.625 },
  },
  { name: "dpr 1.5 laptop", screen: { width: 1280, height: 800, insets: ZERO_INSETS, dpr: 1.5 } },
  { name: "dpr 1.75 phone", screen: { width: 360, height: 780, insets: insets(24.57, 0, 13.71, 0), dpr: 1.75 } },
  { name: "dpr 1.75 phone landscape", screen: { width: 780, height: 360, insets: insets(0, 24.57, 0, 0), dpr: 1.75 } },
  { name: "1379×343 at dpr 2.625", screen: { width: 1379, height: 343, insets: ZERO_INSETS, dpr: 2.625 } },
  { name: "empty", screen: { width: 0, height: 0, insets: ZERO_INSETS, dpr: 1 } },
];

const overlaps = (a: Rect, b: Rect) =>
  a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
  && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 1e-9 && inner.y >= outer.y - 1e-9
  && inner.x + inner.width <= outer.x + outer.width + 1e-9 && inner.y + inner.height <= outer.y + outer.height + 1e-9;

describe("cornerButtonRect across the layout presets", () => {
  it(`gives each button a ${CORNER_HIT_SIZE} px square in its row, clear of the zones and pads`, () => {
    for (const { name, screen } of DEVICES) {
      const layout = computeLayout(screen);

      for (const [slot, button] of CORNER_BUTTONS.entries()) {
        const label = `${name}: ${button}`;
        const rect = cornerButtonRect(layout, button);

        if (name === "empty") {
          assert.equal(rect, null, label);
          continue;
        }

        assert.ok(rect !== null, `${label}: no room for the button`);
        assert.equal(rect.width, CORNER_HIT_SIZE, label);
        assert.equal(rect.height, CORNER_HIT_SIZE, label);
        assert.ok(inside(layout.safe, rect), `${label}: outside the safe rect`);
        assert.equal(rect.y, layout.safe.y + slot * CORNER_HIT_SIZE, `${label}: row ${slot}`);

        for (const zone of layout.zones) {
          assert.ok(!overlaps(zone, rect), `${label}: overlaps zone ${JSON.stringify(zone)}`);
        }

        for (const pad of computePads(layout)) {
          assert.ok(!overlaps(pad.hitBounds, rect), `${label}: overlaps a pad's hit area`);
        }

        if (layout.orientation === "portrait") {
          // The safe rect's own top-right corner.
          assert.equal(rect.x + rect.width, layout.safe.x + layout.safe.width, label);
        } else {
          // Pushed out of the right band: right-aligned with the square, at the safe top (above the square when it is
          // centred lower).
          assert.ok(Math.abs(rect.x + rect.width - (layout.square.x + layout.square.width)) < 1e-9, label);
        }
      }
    }
  });

  it("drops only the rows that don't fit in a short safe rect", () => {
    const CASES = [
      { width: 300, height: 40, mute: false, pause: false },
      { width: 600, height: 90, mute: true, pause: false },
    ];

    for (const { width, height, mute, pause } of CASES) {
      const layout = computeLayout({ width, height, insets: ZERO_INSETS, dpr: 1 });
      const name = `${width}×${height}`;

      assert.equal(cornerButtonRect(layout, "mute") !== null, mute, `${name}: mute`);
      assert.equal(cornerButtonRect(layout, "pause") !== null, pause, `${name}: pause`);
    }
  });
});

describe("hitsCornerButton", () => {
  it("hits inside and on the edges, misses outside and with no button", () => {
    const rect: Rect = { x: 100, y: 0, width: 48, height: 48 };

    assert.ok(hitsCornerButton(rect, 124, 24));
    assert.ok(hitsCornerButton(rect, 100, 0));
    assert.ok(hitsCornerButton(rect, 148, 48));
    assert.ok(!hitsCornerButton(rect, 99, 24));
    assert.ok(!hitsCornerButton(rect, 124, 49));
    assert.ok(!hitsCornerButton(null, 124, 24));
  });
});

describe("cornerIconBox", () => {
  it("centres the icon in the hit square", () => {
    const box = cornerIconBox({ x: 100, y: 10, width: 48, height: 48 });

    assert.deepEqual(box, { x: 112, y: 22, width: CORNER_ICON_SIZE, height: CORNER_ICON_SIZE });
  });
});
