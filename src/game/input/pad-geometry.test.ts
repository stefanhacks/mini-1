import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, type Insets, type Rect, type ScreenInfo, ZERO_INSETS } from "../../core/layout.ts";
import { DIRECTIONS } from "../direction.ts";
import {
  computePads,
  DEAD_ZONE_RATIO,
  HIT_MARGIN,
  hitTest,
  MIN_BUTTON_SIZE,
  PAD_BOTTOM_OFFSET,
  PAD_MAX_SIZE,
} from "./pad-geometry.ts";

const EPSILON = 1e-9;

const insets = (top: number, right: number, bottom: number, left: number): Insets => ({ top, right, bottom, left });

// The presets of src/core/layout.test.ts.
const DEVICES: readonly { readonly name: string; readonly screen: ScreenInfo }[] = [
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
];

const centreOf = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - EPSILON
  && inner.y >= outer.y - EPSILON
  && inner.x + inner.width <= outer.x + outer.width + EPSILON
  && inner.y + inner.height <= outer.y + outer.height + EPSILON;

describe("computePads on device layouts", () => {
  for (const { name, screen } of DEVICES) {
    describe(name, () => {
      const layout = computeLayout(screen);
      const pads = computePads(layout);

      it("puts one pad in each zone: one in portrait, both bands in landscape", () => {
        assert.equal(pads.length, layout.orientation === "portrait" ? 1 : 2);
        assert.equal(pads.length, layout.zones.length);
      });

      it("sizes the pad min(200, zone width, zone height), with buttons of at least 48 px, inside its zone", () => {
        pads.forEach((pad, index) => {
          const zone = layout.zones[index];

          assert.equal(pad.size, Math.min(PAD_MAX_SIZE, zone.width, zone.height));
          assert.ok(pad.buttonSize >= MIN_BUTTON_SIZE, `button ${pad.buttonSize}`);
          assert.ok(contains(zone, pad.bounds));
          assert.ok(contains(zone, pad.hitBounds));
          assert.ok(contains(pad.hitBounds, pad.bounds));

          for (const dir of DIRECTIONS) {
            assert.ok(contains(pad.bounds, pad.buttons[dir]));
          }
        });
      });

      it("centres the pad horizontally and lowers it toward the thumbs in a tall zone", () => {
        pads.forEach((pad, index) => {
          const zone = layout.zones[index];
          const zoneBottom = zone.y + zone.height;

          assert.ok(Math.abs(pad.centre.x - (zone.x + zone.width / 2)) < EPSILON);
          assert.ok(pad.centre.y >= zone.y + zone.height / 2 - EPSILON);

          if (zone.height / 2 < PAD_BOTTOM_OFFSET && zone.height >= pad.size) {
            // Low enough that the offset doesn't apply: the pad is centred in the zone.
            assert.ok(Math.abs(pad.centre.y - (zone.y + zone.height / 2)) < EPSILON);
          } else {
            assert.ok(Math.abs(pad.centre.y - Math.max(zoneBottom - PAD_BOTTOM_OFFSET, zone.y + pad.size / 2)) < 1e-6);
          }
        });
      });

      it("hits each button's centre and corners with its own direction and pad", () => {
        pads.forEach((pad, index) => {
          for (const dir of DIRECTIONS) {
            const button = pad.buttons[dir];
            const inset = 0.5;
            const points = [
              centreOf(button),
              { x: button.x + inset, y: button.y + inset },
              { x: button.x + button.width - inset, y: button.y + inset },
              { x: button.x + inset, y: button.y + button.height - inset },
              { x: button.x + button.width - inset, y: button.y + button.height - inset },
            ];

            for (const point of points) {
              assert.deepEqual(hitTest(pads, point.x, point.y), { pad: index, dir }, `${dir} at ${point.x},${point.y}`);
            }
          }
        });
      });

      it("ignores the dead centre and the square, and hits the margin around the pad", () => {
        assert.equal(hitTest(pads, centreOf(layout.square).x, centreOf(layout.square).y), null);

        pads.forEach((pad, index) => {
          const { centre, deadZoneRadius } = pad;

          assert.equal(hitTest(pads, centre.x, centre.y), null);
          assert.equal(hitTest(pads, centre.x + deadZoneRadius * 0.9, centre.y), null);
          assert.deepEqual(hitTest(pads, centre.x + deadZoneRadius * 1.1, centre.y), { pad: index, dir: "right" });

          const marginY = Math.max(pad.hitBounds.y, pad.bounds.y - HIT_MARGIN / 2);

          assert.deepEqual(hitTest(pads, centre.x, marginY), { pad: index, dir: "up" });
        });
      });
    });
  }
});

describe("hitTest", () => {
  const layout = computeLayout({ width: 844, height: 390, insets: insets(0, 47, 21, 47), dpr: 3 });
  const pads = computePads(layout);

  it("tells the two landscape pads apart", () => {
    const [left, right] = pads;

    assert.deepEqual(hitTest(pads, left.buttons.up.x + 5, left.buttons.up.y + 5), { pad: 0, dir: "up" });
    assert.deepEqual(hitTest(pads, right.buttons.left.x + 5, right.buttons.left.y + 5), { pad: 1, dir: "left" });
  });

  it("splits by the diagonals, with exact diagonals going to up and down", () => {
    const { centre, size } = pads[0];
    const far = size / 2;

    assert.deepEqual(hitTest(pads, centre.x - far + 1, centre.y - far + 1), { pad: 0, dir: "up" });
    assert.deepEqual(hitTest(pads, centre.x + far - 1, centre.y + far - 1), { pad: 0, dir: "down" });
    assert.deepEqual(hitTest(pads, centre.x - far + 1, centre.y - far + 2), { pad: 0, dir: "left" });
    assert.deepEqual(hitTest(pads, centre.x + far - 1, centre.y + far - 2), { pad: 0, dir: "right" });
  });

  it("treats the hit bounds' right and bottom edges as outside", () => {
    const { hitBounds, centre } = pads[0];

    assert.equal(hitTest(pads, hitBounds.x + hitBounds.width, centre.y), null);
    assert.deepEqual(hitTest(pads, hitBounds.x + hitBounds.width - 0.01, centre.y), { pad: 0, dir: "right" });
  });

  it("sizes the dead centre from the button side", () => {
    assert.equal(pads[0].deadZoneRadius, DEAD_ZONE_RATIO * pads[0].buttonSize);
  });

  it("never hits a pad whose zone is empty", () => {
    const empty = computePads(computeLayout({ width: 0, height: 0, insets: ZERO_INSETS, dpr: 1 }));

    assert.ok(empty.every((pad) => pad.size === 0));
    assert.equal(hitTest(empty, 0, 0), null);
  });

  it("has no pads to hit with no pads", () => {
    assert.equal(hitTest([], 10, 10), null);
  });
});
