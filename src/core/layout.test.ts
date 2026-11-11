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
  snapToDevicePixels,
  type ScreenInfo,
  playfieldToScreen,
  rectToScreen,
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
        assert.ok(Number.isInteger(layout.sideDevicePx));
        assert.equal(layout.sideDevicePx / layout.dpr, square.width);
      });

      it("snaps the square's position and side to whole device pixels", () => {
        for (const value of layout.sideDevicePx === 0 ? [square.width] : [square.x, square.y, square.width]) {
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

          // Up to 1 device px from rounding each band's outer edge onto the grid, plus 1 from the floored odd pixel.
          assert.ok(Math.abs((left ?? 0) - (right ?? 0)) <= 2 / screen.dpr + EPSILON, "square centred");
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

describe("computeLayout device pixels", () => {
  it("keeps sideDevicePx an exact integer at a Chrome-zoom dpr", () => {
    const dpr = 1.2000000476837158;
    const layout = computeLayout({ width: 4000, height: 2500 / dpr, insets: ZERO_INSETS, dpr });

    assert.equal(layout.dpr, dpr);
    assert.equal(layout.sideDevicePx, 2500);
  });

  it("reports the sanitised dpr", () => {
    assert.equal(computeLayout({ width: 200, height: 200, insets: ZERO_INSETS, dpr: 0 }).dpr, 1);
  });

  it("starts the square on the first whole device pixel under a fractional cutout", () => {
    const layout = computeLayout(screenOf("Android cutout"));

    // 64 / 2.625 CSS px is exactly device pixel 64.
    assert.equal(layout.square.y * 2.625, 64);
    assert.equal(layout.sideDevicePx, 1081);
  });

  it("gives at least MIN − EDGE_EXCLUSION on a side with no inset", () => {
    const [left, right] = computeLayout(screenOf("iPad landscape")).zones;

    assert.equal(left?.width, MIN_BAND_WIDTH - EDGE_EXCLUSION);
    assert.equal(right?.width, MIN_BAND_WIDTH - EDGE_EXCLUSION);
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
    { width: 200, height: 200, insets: insets(20.5, 0.3, 13.7, 0), dpr: 1 },
    { width: 120, height: 900, insets: insets(10.4, 0, 0, 0.6), dpr: 2.625 },
  ];

  for (const screen of cases) {
    it(`never goes negative at ${screen.width}×${screen.height}`, () => {
      const layout = computeLayout(screen);

      assert.ok(layout.square.width >= 0 && layout.safe.width >= 0 && layout.safe.height >= 0);
      assert.ok(Number.isFinite(layout.square.x) && Number.isFinite(layout.square.y));
      assert.ok(contains(layout.safe, layout.square), JSON.stringify(layout));

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

describe("rectToScreen", () => {
  it("maps a playfield rect through the layout's square", () => {
    const RECT: Rect = { x: 55, y: 370, width: 390, height: 80 };
    const layout = computeLayout({ width: 1280, height: 720, insets: ZERO_INSETS, dpr: 1 });
    const rect = rectToScreen(layout, RECT);

    assert.ok(Math.abs(rect.x - (layout.square.x + RECT.x * layout.scale)) < EPSILON);
    assert.ok(Math.abs(rect.y - (layout.square.y + RECT.y * layout.scale)) < EPSILON);
    assert.ok(Math.abs(rect.width - RECT.width * layout.scale) < EPSILON);
    assert.ok(Math.abs(rect.height - RECT.height * layout.scale) < EPSILON);
  });
});

describe("snapToDevicePixels", () => {
  it("rounds to the nearest whole device pixel", () => {
    assert.equal(snapToDevicePixels(10.3, 1), 10);
    assert.equal(snapToDevicePixels(10.3, 2), 10.5);
    assert.equal(snapToDevicePixels(10.2, 3), 31 / 3);
    assert.equal(snapToDevicePixels(-0.4, 1), -0);
  });

  it("matches Math.round(value * dpr) / dpr for a layout's dpr", () => {
    const layout = computeLayout({ width: 390, height: 844, insets: ZERO_INSETS, dpr: 3 });
    const value = layout.square.x + 123.456 * layout.scale;

    assert.equal(snapToDevicePixels(value, layout.dpr), Math.round(value * layout.dpr) / layout.dpr);
  });

  it("treats a dpr that isn't finite and positive as 1", () => {
    assert.equal(snapToDevicePixels(10.6, 0), 11);
    assert.equal(snapToDevicePixels(10.6, -2), 11);
    assert.equal(snapToDevicePixels(10.6, Number.NaN), 11);
    assert.equal(snapToDevicePixels(10.6, Number.POSITIVE_INFINITY), 11);
  });
});
