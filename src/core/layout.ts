// Screen layout math. Pure TypeScript with no Pixi import, so it runs under `node --test`.

/** Side of the square logical playfield, in art pixels. The original Unity canvas was 500×500. */
export const PLAYFIELD_SIZE = 500;

// Share of the screen height the portrait control zone takes, from the bottom (02: "the bottom 35–40%").
const PORTRAIT_ZONE_SHARE = 0.35;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where a square of PLAYFIELD_SIZE lands on screen: its uniform scale and its top-left corner. */
export interface Fit {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Contain-fits the playfield square into a `width`×`height` screen and centres it. */
export const fitPlayfield = (width: number, height: number): Fit => {
  const side = Math.max(0, Math.min(width, height));

  return {
    scale: side / PLAYFIELD_SIZE,
    x: (width - side) / 2,
    y: (height - side) / 2,
  };
};

/**
 * STUB, replaced in M1: the screen rectangles reserved for the gesture controls, in screen (CSS) px.
 *
 * - Portrait (and square): one rect, the bottom 35% of the screen. It overlaps the centred playfield until M1 moves
 *   the square to the top.
 * - Landscape: two rects, the side bands left and right of the centred square. They are empty on a square-ish
 *   screen; M1 decides the minimum band width (03 open question).
 *
 * Safe-area insets and edge exclusion are not applied yet.
 */
export const controlZoneRect = (width: number, height: number): readonly Rect[] => {
  if (width <= height) {
    const zoneHeight = height * PORTRAIT_ZONE_SHARE;

    return [{ x: 0, y: height - zoneHeight, width, height: zoneHeight }];
  }

  const band = (width - height) / 2;

  return [
    { x: 0, y: 0, width: band, height },
    { x: width - band, y: 0, width: band, height },
  ];
};
