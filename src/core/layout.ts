// Screen layout math. Pure TypeScript with no Pixi import, so it runs under `node --test`. Every length is in CSS px
// unless its name says otherwise.

/** Side of the square logical playfield, in art pixels. The original Unity canvas was 500×500. */
export const PLAYFIELD_SIZE = 500;

/** Portrait: the bottom control zone takes at least this share of the safe height... */
export const MIN_ZONE_SHARE = 0.3;

/** ...and at least this many CSS px. */
export const MIN_ZONE_HEIGHT = 200;

/** Landscape: each side band is at least this wide, so the 170–200 px pad fits. */
export const MIN_BAND_WIDTH = 200;

/** Keep-out strip along every physical screen edge, against the iOS swipe-back and Android back gestures. */
export const EDGE_EXCLUSION = 24;

// Absorbs float noise such as 0.1 * 3 = 0.30000000000000004 before snapping to device pixels.
const SNAP_EPSILON = 1e-6;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Safe-area insets, as `env(safe-area-inset-*)` reports them. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ScreenInfo {
  readonly width: number;
  readonly height: number;
  readonly insets: Insets;
  /** Device pixels per CSS px: the canvas resolution. Anything not finite and positive counts as 1. */
  readonly dpr: number;
}

export interface Layout {
  readonly orientation: "portrait" | "landscape";
  /** The screen minus the safe-area insets. */
  readonly safe: Rect;
  /** Where the playfield lands. Position and side are whole device pixels; `width === height`. */
  readonly square: Rect;
  /** Square side / PLAYFIELD_SIZE: CSS px per art pixel. */
  readonly scale: number;
  /** The final control zones: one in portrait, the left and right bands in landscape. May have zero size. */
  readonly zones: readonly Rect[];
}

export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

// A [start, end] span along one axis, in CSS px.
interface Span {
  readonly start: number;
  readonly end: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Snaps the square along one axis. Only whole device pixels inside `span` are usable: the start rounds up, the end
 * rounds down, so the square never leaves the span. Returns that usable length and its first device pixel.
 */
const deviceSpan = (span: Span, dpr: number) => {
  const first = Math.ceil(span.start * dpr - SNAP_EPSILON);
  const last = Math.floor(span.end * dpr + SNAP_EPSILON);

  return { first, length: Math.max(0, last - first) };
};

/** Places `side` device px inside a device span: at its start, or centred with the odd pixel floored. */
const place = (span: { first: number; length: number }, side: number, centred: boolean) =>
  span.first + (centred ? Math.floor((span.length - side) / 2) : 0);

/**
 * Cuts the edge exclusion out of a zone. `keep` is the screen inset by max(inset, EDGE_EXCLUSION) on each side, so a
 * zone ends at least EDGE_EXCLUSION from every physical screen edge, and a large inset (a notch, the home indicator)
 * already counts toward it instead of adding to it. The result is clamped into the screen and never negative.
 */
const exclude = (zone: Rect, keep: Rect, screen: ScreenInfo): Rect => {
  const left = clamp(Math.max(zone.x, keep.x), 0, screen.width);
  const top = clamp(Math.max(zone.y, keep.y), 0, screen.height);
  const right = clamp(Math.min(zone.x + zone.width, keep.x + keep.width), left, screen.width);
  const bottom = clamp(Math.min(zone.y + zone.height, keep.y + keep.height), top, screen.height);

  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * The layout rule (M1 plan, deliverable 2).
 *
 * 1. Safe rect = screen minus insets. Portrait when its width ≤ its height.
 * 2. Control space is reserved first: in portrait a bottom zone of max(MIN_ZONE_SHARE × safe height,
 *    MIN_ZONE_HEIGHT); in landscape a MIN_BAND_WIDTH band on each side.
 * 3. The square takes the largest whole-device-pixel side that fits what remains. Portrait anchors it to the safe
 *    top and centres it horizontally; landscape centres it in both axes. Its position is whole device pixels too:
 *    the start of each span rounds up, and a centring offset with an odd pixel floors (see `deviceSpan`, `place`).
 * 4. The leftover goes back to the controls: the portrait zone is everything in the safe rect under the square, the
 *    bands everything in the safe rect beside it.
 * 5. The edge exclusion is cut out of each zone (see `exclude`).
 *
 * Degenerate screens (empty, smaller than the reserved space, insets larger than the screen) give a zero square and
 * zero-size zones, never negative sizes.
 */
export const computeLayout = (screen: ScreenInfo): Layout => {
  const { width, height, insets } = screen;
  const dpr = Number.isFinite(screen.dpr) && screen.dpr > 0 ? screen.dpr : 1;

  const safe: Rect = {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, width - insets.left - insets.right),
    height: Math.max(0, height - insets.top - insets.bottom),
  };
  const safeRight = safe.x + safe.width;
  const safeBottom = safe.y + safe.height;
  const portrait = safe.width <= safe.height;

  // The box the square must fit in once the control space is reserved.
  const zoneHeight = Math.max(MIN_ZONE_SHARE * safe.height, MIN_ZONE_HEIGHT);
  const horizontal = deviceSpan(
    portrait ? { start: safe.x, end: safeRight } : { start: safe.x + MIN_BAND_WIDTH, end: safeRight - MIN_BAND_WIDTH },
    dpr,
  );
  const vertical = deviceSpan({ start: safe.y, end: portrait ? safeBottom - zoneHeight : safeBottom }, dpr);
  const side = Math.min(horizontal.length, vertical.length);

  const square: Rect = {
    x: place(horizontal, side, true) / dpr,
    y: place(vertical, side, !portrait) / dpr,
    width: side / dpr,
    height: side / dpr,
  };
  const squareRight = square.x + square.width;
  const squareBottom = square.y + square.height;

  const raw: Rect[] = portrait
    ? [{ x: safe.x, y: squareBottom, width: safe.width, height: Math.max(0, safeBottom - squareBottom) }]
    : [
      { x: safe.x, y: safe.y, width: Math.max(0, square.x - safe.x), height: safe.height },
      { x: squareRight, y: safe.y, width: Math.max(0, safeRight - squareRight), height: safe.height },
    ];

  const keepLeft = Math.max(insets.left, EDGE_EXCLUSION);
  const keepTop = Math.max(insets.top, EDGE_EXCLUSION);
  const keep: Rect = {
    x: keepLeft,
    y: keepTop,
    width: width - Math.max(insets.right, EDGE_EXCLUSION) - keepLeft,
    height: height - Math.max(insets.bottom, EDGE_EXCLUSION) - keepTop,
  };

  return {
    orientation: portrait ? "portrait" : "landscape",
    safe,
    square,
    scale: square.width / PLAYFIELD_SIZE,
    zones: raw.map((zone) => exclude(zone, keep, screen)),
  };
};

/** Maps a point in playfield art px (0..PLAYFIELD_SIZE) to screen CSS px. */
export const playfieldToScreen = (layout: Layout, point: Point): Point => ({
  x: layout.square.x + point.x * layout.scale,
  y: layout.square.y + point.y * layout.scale,
});

/** Maps a point in screen CSS px to playfield art px. An empty square maps everything to the playfield origin. */
export const screenToPlayfield = (layout: Layout, point: Point): Point => {
  if (layout.scale === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: (point.x - layout.square.x) / layout.scale,
    y: (point.y - layout.square.y) / layout.scale,
  };
};
