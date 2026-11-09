import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeLayout,
  EDGE_EXCLUSION,
  type Insets,
  type Layout,
  MIN_BAND_WIDTH,
  MIN_ZONE_HEIGHT,
  MIN_ZONE_SHARE,
  PLAYFIELD_SIZE,
  type Rect,
  type ScreenInfo,
  playfieldToScreen,
  screenToPlayfield,
  ZERO_INSETS,
} from "./layout.ts";

const EPSILON = 1e-9;

const insets = (top: number, right: number, bottom: number, left: number): Insets => ({ top, right, bottom, left });

interface Device {
  readonly name: string;
  readonly screen: ScreenInfo;
}

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
  { name: "empty", screen: { width: 0, height: 0, insets: ZERO_INSETS, dpr: 1 } },
];

const screenOf = (name: string) => {
  const device = DEVICES.find((entry) => entry.name === name);

  if (device === undefined) {
    throw new Error(`unknown device ${name}`);
  }

  return device.screen;
};

const isWholeDevicePx = (value: number, dpr: number) => Math.abs(value * dpr - Math.round(value * dpr)) < EPSILON;

const right = (rect: Rect) => rect.x + rect.width;
const bottom = (rect: Rect) => rect.y + rect.height;

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - EPSILON
  && inner.y >= outer.y - EPSILON
  && right(inner) <= right(outer) + EPSILON
  && bottom(inner) <= bottom(outer) + EPSILON;

const overlaps = (a: Rect, b: Rect) =>
  Math.min(right(a), right(b)) - Math.max(a.x, b.x) > EPSILON
  && Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y) > EPSILON;

// The space the rule hands to controls before the edge exclusion: the safe rect minus the square.
const reservedSpace = (layout: Layout) =>
  layout.orientation === "portrait"
    ? [bottom(layout.safe) - bottom(layout.square)]
    : [layout.square.x - layout.safe.x, right(layout.safe) - right(layout.square)];

const minimumSpace = (layout: Layout) =>
  layout.orientation === "portrait" ? Math.max(MIN_ZONE_SHARE * layout.safe.height, MIN_ZONE_HEIGHT) : MIN_BAND_WIDTH;

describe("computeLayout invariants across devices", () => {
  for (const { name, screen } of DEVICES) {
    describe(name, () => {
      const layout = computeLayout(screen);
      const { square, safe, zones } = layout;
      const screenRect: Rect = { x: 0, y: 0, width: screen.width, height: screen.height };

      it("keeps the square inside the safe rect, square and non-negative", () => {
        assert.equal(square.width, square.height);
        assert.ok(square.width >= 0);
        assert.ok(contains(safe, square), JSON.stringify({ safe, square }));
        assert.equal(layout.scale, square.width / PLAYFIELD_SIZE);
      });

      it("snaps the square's position and side to whole device pixels", () => {
        for (const value of [square.x, square.y, square.width]) {
          assert.ok(isWholeDevicePx(value, screen.dpr), `${value} at dpr ${screen.dpr}`);
        }
      });

      it("reserves at least the minimum control space whenever the safe rect allows it", () => {
        const minimum = minimumSpace(layout);
        const fits = layout.orientation === "portrait" ? safe.height >= minimum : safe.width >= 2 * minimum;

        if (fits) {
          for (const space of reservedSpace(layout)) {
            assert.ok(space >= minimum - EPSILON, `${space} < ${minimum}`);
          }
        }
      });

      it("gives the controls the whole leftover of the safe rect", () => {
        if (layout.orientation === "portrait") {
          assert.ok(Math.abs(square.y - safe.y) < 1 / screen.dpr, "square anchored to the safe top");
        } else {
          const [left, right] = reservedSpace(layout);

          assert.ok(Math.abs((left ?? 0) - (right ?? 0)) <= 1 / screen.dpr + EPSILON, "square centred");
        }
      });

      it("keeps the zones off the square, inside the screen and clear of the edge exclusion", () => {
        assert.equal(zones.length, layout.orientation === "portrait" ? 1 : 2);

        for (const zone of zones) {
          assert.ok(zone.width >= 0 && zone.height >= 0);
          assert.ok(contains(screenRect, zone));
          assert.ok(!overlaps(zone, square));

          if (zone.width > 0 && zone.height > 0) {
            assert.ok(contains(safe, zone));
            assert.ok(zone.x >= EDGE_EXCLUSION - EPSILON);
            assert.ok(zone.y >= EDGE_EXCLUSION - EPSILON);
            assert.ok(right(zone) <= screen.width - EDGE_EXCLUSION + EPSILON);
            assert.ok(bottom(zone) <= screen.height - EDGE_EXCLUSION + EPSILON);
          }
        }
      });

      it("round-trips playfield points through the screen", () => {
        if (layout.scale === 0) {
          return;
        }

        for (const point of [{ x: 0, y: 0 }, { x: 250, y: 340 }, { x: PLAYFIELD_SIZE, y: PLAYFIELD_SIZE }]) {
          const back = screenToPlayfield(layout, playfieldToScreen(layout, point));

          assert.ok(Math.abs(back.x - point.x) < EPSILON && Math.abs(back.y - point.y) < EPSILON);
        }
      });
    });
  }
});

describe("computeLayout specific layouts", () => {
  it("anchors the iPhone SE square under the status bar and gives the rest to the zone", () => {
    const layout = computeLayout(screenOf("iPhone SE"));

    assert.equal(layout.orientation, "portrait");
    // Safe height 647, zone ≥ 200 (> 30% = 194.1), so the side is min(375, 447) = 375.
    assert.deepEqual(layout.square, { x: 0, y: 20, width: 375, height: 375 });
    assert.deepEqual(layout.zones, [{ x: 24, y: 395, width: 327, height: 667 - 24 - 395 }]);
  });

  it("lets the iPhone 13 home indicator inset count toward the edge exclusion", () => {
    const layout = computeLayout(screenOf("iPhone 13"));

    assert.deepEqual(layout.square, { x: 0, y: 47, width: 390, height: 390 });
    // Bottom inset 34 > 24, so the zone ends at the safe bottom, not 24 px above it.
    assert.deepEqual(layout.zones, [{ x: 24, y: 437, width: 342, height: 844 - 34 - 437 }]);
  });

  it("shrinks the iPhone 13 landscape square to keep 200 px bands", () => {
    const layout = computeLayout(screenOf("iPhone 13 landscape"));

    assert.equal(layout.orientation, "landscape");
    // Safe rect 750×369; side = min(369, 750 − 400) = 350, centred.
    assert.equal(layout.square.width, 350);
    assert.equal(layout.square.x, 47 + 200);
    assert.ok(Math.abs(layout.square.y - (369 - 350) / 2) <= 1 / 3);
    // Side insets 47 > 24 count as the exclusion; the bottom inset 21 does not, so 24 applies there.
    assert.deepEqual(layout.zones, [
      { x: 47, y: 24, width: 200, height: 390 - 24 - 24 },
      { x: 597, y: 24, width: 200, height: 390 - 24 - 24 },
    ]);
  });

  it("snaps a Pixel 7 square to whole device pixels at dpr 2.625", () => {
    const layout = computeLayout(screenOf("Pixel 7"));

    // 412 CSS px is 1081.5 device px, so the side floors to 1081 device px and centres with the odd half floored.
    assert.equal(layout.square.width, 1081 / 2.625);
    assert.equal(layout.square.x, 0);
  });

  it("gives a 1:1 window a 400 px square and a 200 px zone", () => {
    const layout = computeLayout(screenOf("1:1 window"));

    assert.equal(layout.orientation, "portrait");
    assert.deepEqual(layout.square, { x: 100, y: 0, width: 400, height: 400 });
    assert.deepEqual(layout.zones, [{ x: 24, y: 400, width: 552, height: 176 }]);
  });

  it("splits the desktop leftover between the bands", () => {
    const layout = computeLayout(screenOf("desktop 16:9"));

    assert.deepEqual(layout.square, { x: 280, y: 0, width: 720, height: 720 });
    assert.deepEqual(layout.zones, [
      { x: 24, y: 24, width: 256, height: 672 },
      { x: 1000, y: 24, width: 256, height: 672 },
    ]);
  });

  it("uses 30% of a tall safe height when that beats the 200 px floor", () => {
    const layout = computeLayout({ width: 800, height: 2000, insets: ZERO_INSETS, dpr: 1 });

    assert.equal(layout.square.width, 800);
    assert.equal(bottom(layout.safe) - bottom(layout.square), 1200);

    const narrow = computeLayout({ width: 1000, height: 1200, insets: ZERO_INSETS, dpr: 1 });

    assert.equal(narrow.square.width, 1200 - 1200 * MIN_ZONE_SHARE);
  });
});

describe("computeLayout degenerate screens", () => {
  const cases: readonly ScreenInfo[] = [
    { width: 0, height: 0, insets: ZERO_INSETS, dpr: 1 },
    { width: 10, height: 30, insets: ZERO_INSETS, dpr: 3 },
    { width: 300, height: 100, insets: ZERO_INSETS, dpr: 2 },
    { width: 100, height: 100, insets: insets(80, 80, 80, 80), dpr: 2 },
    { width: 200, height: 200, insets: ZERO_INSETS, dpr: 0 },
    { width: 200, height: 200, insets: ZERO_INSETS, dpr: Number.NaN },
  ];

  for (const screen of cases) {
    it(`never goes negative at ${screen.width}×${screen.height}`, () => {
      const layout = computeLayout(screen);

      assert.ok(layout.square.width >= 0 && layout.safe.width >= 0 && layout.safe.height >= 0);
      assert.ok(Number.isFinite(layout.square.x) && Number.isFinite(layout.square.y));

      for (const zone of layout.zones) {
        assert.ok(zone.width >= 0 && zone.height >= 0);
        assert.ok(zone.x >= 0 && right(zone) <= screen.width);
        assert.ok(zone.y >= 0 && bottom(zone) <= screen.height);
      }
    });
  }

  it("gives an empty square and maps every screen point to the playfield origin", () => {
    const layout = computeLayout({ width: 0, height: 0, insets: ZERO_INSETS, dpr: 1 });

    assert.equal(layout.scale, 0);
    assert.deepEqual(screenToPlayfield(layout, { x: 5, y: 5 }), { x: 0, y: 0 });
  });
});

describe("playfieldToScreen", () => {
  it("maps the playfield corners onto the square", () => {
    const layout = computeLayout({ width: 1280, height: 720, insets: ZERO_INSETS, dpr: 1 });

    assert.deepEqual(playfieldToScreen(layout, { x: 0, y: 0 }), { x: 280, y: 0 });
    assert.deepEqual(playfieldToScreen(layout, { x: PLAYFIELD_SIZE, y: PLAYFIELD_SIZE }), { x: 1000, y: 720 });
    assert.deepEqual(screenToPlayfield(layout, { x: 640, y: 360 }), { x: 250, y: 250 });
  });
});
