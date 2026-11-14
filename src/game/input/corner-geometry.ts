// Where the corner buttons sit (mute, then pause, "reduce flashes" and endless mode below it) and what counts as a tap
// on one. Pure TypeScript with no Pixi import, so it runs under `node --test`. Every length is in #game CSS px. The
// views (src/game/mute-button.ts, pause-button.ts, flashes-button.ts, endless-button.ts) draw from the same rects, so
// art and hit-testing never disagree. Written by Claude Code.
//
// Rule (m3-plan owner decision 1: top-right of the safe area; m5-plan owner decisions 6 and 7: a stack below it): slot
// i's hit square has its top edge i squares below the safe rect's top, and its right edge on the safe rect's right,
// pulled left past any control zone it would overlap. In portrait the zone is under the square, so the stack sits in
// the safe corner, over the sky. In landscape the right band (a control zone) fills the safe corner, so the stack
// moves left until it is right-aligned with the playfield square, next to the band: over the square's sky, or above
// the square when it is centred lower (iPad landscape).

import type { Layout, Point, Rect } from "../../core/layout.ts";

/**
 * The corner stack, top to bottom: owner decision 7's order, mute, pause, then the "reduce flashes" toggle; then the
 * endless-mode icon (endless-plan.md).
 */
export const CORNER_BUTTONS = ["mute", "pause", "flashes", "endless"] as const;

export type CornerButton = (typeof CORNER_BUTTONS)[number];

/** Side of a hit square (Apple's 44 pt and Material's 48 dp minimums). */
export const CORNER_HIT_SIZE = 48;

/** Side of a drawn icon's box, centred in its hit square. */
export const CORNER_ICON_SIZE = 24;

const overlaps = (a: Rect, b: Rect) =>
  a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
  && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/**
 * `button`'s hit square, or null when no CORNER_HIT_SIZE square fits in its row of the safe rect without overlapping a
 * control zone (degenerate screens; its key still works).
 */
export const cornerButtonRect = (layout: Layout, button: CornerButton): Rect | null => {
  const { safe, zones } = layout;
  const size = CORNER_HIT_SIZE;
  const y = safe.y + CORNER_BUTTONS.indexOf(button) * size;
  let right = safe.x + safe.width;

  // Each pass moves the square left of a zone it overlaps; zones don't overlap each other, so this ends.
  for (let pass = 0; pass <= zones.length; pass++) {
    const rect: Rect = { x: right - size, y, width: size, height: size };
    const hit = zones.find((zone) => overlaps(zone, rect));

    if (hit === undefined) {
      return contains(safe, rect) ? rect : null;
    }

    right = hit.x;
  }

  return null;
};

/** Whether (x, y) falls on the button. Edges count, as in pad hit-testing. */
export const hitsCornerButton = (rect: Rect | null, x: number, y: number) =>
  rect !== null && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/** The icon box (CORNER_ICON_SIZE square) centred in the hit square. */
export const cornerIconBox = (rect: Rect): Rect => {
  const centre: Point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

  return {
    x: centre.x - CORNER_ICON_SIZE / 2,
    y: centre.y - CORNER_ICON_SIZE / 2,
    width: CORNER_ICON_SIZE,
    height: CORNER_ICON_SIZE,
  };
};
