// Where the mute button sits and what counts as a tap on it. Pure TypeScript with no Pixi import, so it runs under
// `node --test`. Every length is in #game CSS px. The view (src/game/mute-button.ts) draws from the same rect, so art
// and hit-testing never disagree. Written by Claude Code.
//
// Rule (m3-plan owner decision 1: top-right of the safe area): the hit square's top edge is the safe rect's top, and
// its right edge the safe rect's right, pulled left past any control zone it would overlap. In portrait the zone is
// under the square, so the button sits in the safe corner, over the sky. In landscape the right band (a control zone)
// fills the safe corner, so the button moves left until it is right-aligned with the playfield square, next to the
// band: over the square's sky, or above the square when it is centred lower (iPad landscape).

import type { Layout, Point, Rect } from "../../core/layout.ts";

/** Side of the hit square (Apple's 44 pt and Material's 48 dp minimums). */
export const MUTE_HIT_SIZE = 48;

/** Side of the drawn icon's box, centred in the hit square. */
export const MUTE_ICON_SIZE = 24;

const overlaps = (a: Rect, b: Rect) =>
  a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
  && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/**
 * The mute button's hit square, or null when no MUTE_HIT_SIZE square fits along the safe rect's top without
 * overlapping a control zone (degenerate screens; the M key still mutes).
 */
export const muteButtonRect = (layout: Layout): Rect | null => {
  const { safe, zones } = layout;
  const size = MUTE_HIT_SIZE;
  let right = safe.x + safe.width;

  // Each pass moves the square left of a zone it overlaps; zones don't overlap each other, so this ends.
  for (let pass = 0; pass <= zones.length; pass++) {
    const rect: Rect = { x: right - size, y: safe.y, width: size, height: size };
    const hit = zones.find((zone) => overlaps(zone, rect));

    if (hit === undefined) {
      return contains(safe, rect) ? rect : null;
    }

    right = hit.x;
  }

  return null;
};

/** Whether (x, y) falls on the button. Edges count, as in pad hit-testing. */
export const hitsMuteButton = (rect: Rect | null, x: number, y: number) =>
  rect !== null && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/** The icon box (MUTE_ICON_SIZE square) centred in the hit square. */
export const muteIconBox = (rect: Rect): Rect => {
  const centre: Point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

  return {
    x: centre.x - MUTE_ICON_SIZE / 2,
    y: centre.y - MUTE_ICON_SIZE / 2,
    width: MUTE_ICON_SIZE,
    height: MUTE_ICON_SIZE,
  };
};
