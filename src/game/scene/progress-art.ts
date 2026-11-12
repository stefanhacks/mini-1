// The hold ring and the press pips, drawn around the arrow in the ui layer (CSS px). Written by Claude Code.
import type { Graphics } from "pixi.js";
import { playfieldToScreen, type Layout, type Point } from "../../core/layout.ts";
import type { HoldProgress, ManyProgress } from "../challenges/rule.ts";
import { WHITE } from "./palette.ts";
import { ARROW_ROW, RING_RADIUS } from "./positions.ts";

/** Where the ring and the pips start: the top, going clockwise (y down). */
const RING_START = -Math.PI / 2;

/** The ring's stroke, in art px, and its floor in CSS px. */
const RING_STROKE = 2;
const MIN_RING_STROKE = 2;

/** A pip's radius, in art px, and its floor in CSS px. */
const PIP_RADIUS = 2.5;
const MIN_PIP_RADIUS = 2;

/** The alpha of the ring's track and of a pip not yet counted. */
const PENDING_ALPHA = 0.25;

/** The point at `angle` on the circle of `radius` around `centre`. */
const pointOnRing = (centre: Point, radius: number, angle: number): Point => ({
  x: centre.x + radius * Math.cos(angle),
  y: centre.y + radius * Math.sin(angle),
});

interface Ring {
  readonly centre: Point;
  readonly radius: number;
}

const ringFor = (layout: Layout): Ring => ({
  centre: playfieldToScreen(layout, ARROW_ROW),
  radius: RING_RADIUS * layout.scale,
});

/** Hold: the full ring faint, and the held fraction over it, clockwise from the top. */
const drawHold = (graphics: Graphics, { centre, radius }: Ring, layout: Layout, progress: HoldProgress) => {
  const width = Math.max(MIN_RING_STROKE, RING_STROKE * layout.scale);

  graphics.circle(centre.x, centre.y, radius).stroke({ width, color: WHITE, alpha: PENDING_ALPHA });

  if (progress.fraction > 0) {
    const start = RING_START;
    const end = start + progress.fraction * Math.PI * 2;
    const from = pointOnRing(centre, radius, start);

    graphics
      .moveTo(from.x, from.y)
      .arc(centre.x, centre.y, radius, start, end)
      .stroke({ width, color: WHITE });
  }
};

/** Many: one pip per press needed, clockwise from the top, filled as they are counted. */
const drawPips = (graphics: Graphics, { centre, radius }: Ring, layout: Layout, progress: ManyProgress) => {
  const pip = Math.max(MIN_PIP_RADIUS, PIP_RADIUS * layout.scale);

  for (let i = 0; i < progress.target; i++) {
    const { x, y } = pointOnRing(centre, radius, RING_START + (i / progress.target) * Math.PI * 2);

    if (i < progress.count) {
      graphics.circle(x, y, pip).fill(WHITE);
    } else {
      graphics.circle(x, y, pip).fill({ color: WHITE, alpha: PENDING_ALPHA });
    }
  }
};

/** Draws a hold's ring or a many's pips into `graphics`, which the caller has cleared. */
export const drawProgressArt = (graphics: Graphics, layout: Layout, progress: HoldProgress | ManyProgress) => {
  const ring = ringFor(layout);

  if (progress.kind === "hold") {
    drawHold(graphics, ring, layout, progress);
  } else {
    drawPips(graphics, ring, layout, progress);
  }
};
