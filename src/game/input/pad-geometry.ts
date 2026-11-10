// Compass pad geometry and hit-testing: where each pad sits in its control zone, its four button rects, and which
// direction a point hits. Pure TypeScript with no Pixi import, so it runs under `node --test`. Every length is in #game
// CSS px. The pad view (src/game/pad.ts) draws from the same `Pad`s, so art and hit-testing never disagree.

import type { Layout, Point, Rect } from "../../core/layout.ts";
import type { Direction } from "../direction.ts";

/** The pad's largest side: the cross's bounding square (M1 owner decision: min(200, zone width, zone height)). */
export const PAD_MAX_SIZE = 200;

/** The smallest button side the pad aims for. A pad of 3 × this (144 px) or more meets it; zones are ≥ 176 px. */
export const MIN_BUTTON_SIZE = 48;

/** In a zone taller than the pad, the pad's centre sits this far above the zone's bottom, toward the thumbs. */
export const PAD_BOTTOM_OFFSET = 140;

/** The hit area reaches this far past the cross's bounding square on each side, clipped to the zone. */
export const HIT_MARGIN = 24;

/** Radius of the dead centre, as a share of the button side: a touch there is too ambiguous to guess. */
export const DEAD_ZONE_RATIO = 0.25;

export interface Pad {
  /** The cross's centre. */
  readonly centre: Point;
  /** Side of the cross's bounding square. 0 when its zone is empty. */
  readonly size: number;
  /** The cross's bounding square: a 3 × 3 grid of `buttonSize` cells, with the buttons on the middle row and column. */
  readonly bounds: Rect;
  /** Side of each button: size / 3. */
  readonly buttonSize: number;
  /** Each button's art rect. Hit-testing does not use them: see `hitTest`. */
  readonly buttons: Readonly<Record<Direction, Rect>>;
  /** Where a touch counts for this pad: `bounds` grown by HIT_MARGIN, clipped to the zone. */
  readonly hitBounds: Rect;
  /** A touch closer than this to `centre` hits nothing. */
  readonly deadZoneRadius: number;
}

export interface PadHit {
  /** Index into the pads array, which is also the index of the layout zone the pad sits in. */
  readonly pad: number;
  readonly dir: Direction;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const intersect = (a: Rect, b: Rect): Rect => {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.max(left, Math.min(a.x + a.width, b.x + b.width));
  const bottom = Math.max(top, Math.min(a.y + a.height, b.y + b.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * The pad for one zone. Centred horizontally; vertically, at the lower of the zone's centre and PAD_BOTTOM_OFFSET above
 * its bottom, clamped so the cross stays inside the zone. A short zone (a landscape phone band, a squat portrait zone)
 * therefore centres the pad, and a tall one drops it toward the thumbs.
 */
const padInZone = (zone: Rect): Pad => {
  const size = Math.max(0, Math.min(PAD_MAX_SIZE, zone.width, zone.height));
  const half = size / 2;
  const zoneBottom = zone.y + zone.height;
  const centre: Point = {
    x: zone.x + zone.width / 2,
    y: clamp(Math.max(zone.y + zone.height / 2, zoneBottom - PAD_BOTTOM_OFFSET), zone.y + half, zoneBottom - half),
  };
  const bounds: Rect = { x: centre.x - half, y: centre.y - half, width: size, height: size };
  const buttonSize = size / 3;
  const cell = (column: number, row: number): Rect => ({
    x: bounds.x + column * buttonSize,
    y: bounds.y + row * buttonSize,
    width: buttonSize,
    height: buttonSize,
  });
  const grown: Rect = {
    x: bounds.x - HIT_MARGIN,
    y: bounds.y - HIT_MARGIN,
    width: size + 2 * HIT_MARGIN,
    height: size + 2 * HIT_MARGIN,
  };

  return {
    centre,
    size,
    bounds,
    buttonSize,
    buttons: { up: cell(1, 0), left: cell(0, 1), right: cell(2, 1), down: cell(1, 2) },
    hitBounds: intersect(grown, zone),
    deadZoneRadius: DEAD_ZONE_RATIO * buttonSize,
  };
};

/**
 * One pad per layout zone, in the same order: one in portrait, the left and the right band's in landscape (owner
 * decision 1: both active). A pad whose zone is empty has size 0 and is never hit.
 */
export const computePads = (layout: Layout): readonly Pad[] => layout.zones.map(padInZone);

/**
 * Which pad and direction a point in #game CSS px hits, or null.
 *
 * A pad's hit area is `hitBounds` (the cross's square plus HIT_MARGIN), split into four triangles by the diagonals
 * through its centre: the side of the larger offset from the centre wins, and an exact diagonal goes to up/down. Each
 * button's art lies wholly inside its own triangle, and the empty corners of the cross count for the nearer arm, so
 * a thumb that lands a little off a button still hits it. The one gap is the dead centre (`deadZoneRadius`), where the
 * heading can't be told: a wrong press resets a Sequence, so there it is better to hit nothing than to guess.
 * The right and bottom edges of `hitBounds` are exclusive. Pads never overlap, since zones don't.
 */
export const hitTest = (pads: readonly Pad[], x: number, y: number): PadHit | null => {
  for (let index = 0; index < pads.length; index++) {
    const pad = pads[index];
    const { hitBounds } = pad;
    const inside = x >= hitBounds.x
      && x < hitBounds.x + hitBounds.width
      && y >= hitBounds.y
      && y < hitBounds.y + hitBounds.height;

    if (pad.size <= 0 || !inside) {
      continue;
    }

    const dx = x - pad.centre.x;
    const dy = y - pad.centre.y;

    if (dx * dx + dy * dy < pad.deadZoneRadius * pad.deadZoneRadius) {
      return null;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return { pad: index, dir: dx < 0 ? "left" : "right" };
    }

    return { pad: index, dir: dy < 0 ? "up" : "down" };
  }

  return null;
};
