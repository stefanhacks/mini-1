// What the compass pad view draws for each button: the rounded body, the arrow glyph and the colours for each state.
// Pure TypeScript with no Pixi import, so it runs under `node --test`. Every length is in #game CSS px, which are the
// ui layer's coordinates.

import type { Rect } from "../core/layout.ts";
import type { Direction } from "./direction.ts";
import { VOICE_GREY } from "./story/script.ts";

/** Gap between a button's art rect and its drawn body, as a share of the button side, so neighbours don't touch. */
export const BUTTON_INSET_RATIO = 0.06;

/** Corner radius of the body, as a share of the button side. */
export const BUTTON_RADIUS_RATIO = 0.18;

/** Half the arrow glyph's span along and across its heading, as a share of the button side. */
export const ARROW_HALF_RATIO = 0.18;

/** The glyph's back edge sits this share of ARROW_HALF behind the centre, so the triangle is squat. */
export const ARROW_BACK_RATIO = 0.6;

/** Outline width in CSS px, before snapping to whole device pixels. */
export const OUTLINE_WIDTH = 2;

/** Alpha of the whole pad while it is dimmed (shown, but not yet interactive). */
export const DIMMED_ALPHA = 0.35;

/** The idle outline and arrow: the story's VOICE_GREY, #767676 (M3 owner decision 4; it was the original's #464646). */
export const PAD_GREY = `#${VOICE_GREY.toString(16).padStart(6, "0")}`;

// The pressed body keeps the original's darker grey, so a press still reads as a fill, not an outline.
const PRESSED_GREY = "#464646";
const WHITE = "#ffffff";

export interface ButtonStyle {
  readonly fill: string;
  readonly fillAlpha: number;
  readonly outline: string;
  readonly outlineAlpha: number;
  readonly arrow: string;
}

/** Released: a dark, see-through body that keeps the playfield readable behind it. */
export const IDLE_STYLE: ButtonStyle = {
  fill: "#000000",
  fillAlpha: 0.45,
  outline: PAD_GREY,
  outlineAlpha: 1,
  arrow: PAD_GREY,
};

/** The expected direction, released: a white outline at half strength. Static: M2 has no animations. */
export const HINT_STYLE: ButtonStyle = {
  fill: "#000000",
  fillAlpha: 0.45,
  outline: WHITE,
  outlineAlpha: 0.5,
  arrow: "#8c8c8c",
};

/** Pressed: a brighter body and a white glyph. Hinted or not, a press looks the same. */
export const PRESSED_STYLE: ButtonStyle = {
  fill: PRESSED_GREY,
  fillAlpha: 0.9,
  outline: WHITE,
  outlineAlpha: 1,
  arrow: WHITE,
};

export const buttonStyle = (pressed: boolean, hinted: boolean): ButtonStyle => {
  if (pressed) {
    return PRESSED_STYLE;
  }

  return hinted ? HINT_STYLE : IDLE_STYLE;
};

export interface ButtonArt {
  /** The rounded body, edges on whole device pixels. */
  readonly body: Rect;
  readonly radius: number;
  /** Outline width: a whole number of device pixels, and at least 1 CSS px. Drawn inside `body`. */
  readonly outlineWidth: number;
  /** The arrow triangle as flat [x0, y0, x1, y1, x2, y2], tip first, on whole device pixels. */
  readonly arrow: readonly number[];
}

const HEADINGS: Readonly<Record<Direction, { readonly x: number; readonly y: number }>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Rounds a CSS px value to the nearest whole device pixel. A `dpr` that isn't finite and positive counts as 1. */
export const snapToDevicePixels = (value: number, dpr: number) => {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

  return Math.round(value * ratio) / ratio;
};

/**
 * The art for one button of side `rect.width`, pointing `dir`. Edges and glyph vertices are snapped to whole device
 * pixels for `dpr`, so the body stays crisp; a Pad carries no dpr, so callers that don't know it pass 1 (CSS px).
 */
export const buttonArt = (rect: Rect, dir: Direction, dpr = 1): ButtonArt => {
  const side = Math.min(rect.width, rect.height);
  const inset = side * BUTTON_INSET_RATIO;
  const left = snapToDevicePixels(rect.x + inset, dpr);
  const top = snapToDevicePixels(rect.y + inset, dpr);
  const right = snapToDevicePixels(rect.x + rect.width - inset, dpr);
  const bottom = snapToDevicePixels(rect.y + rect.height - inset, dpr);
  const body: Rect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  const half = side * ARROW_HALF_RATIO;
  const back = half * ARROW_BACK_RATIO;
  const heading = HEADINGS[dir];
  // Perpendicular to the heading: the back edge runs along it.
  const across = { x: -heading.y, y: heading.x };
  const vertex = (along: number, sideways: number) => [
    snapToDevicePixels(centreX + heading.x * along + across.x * sideways, dpr),
    snapToDevicePixels(centreY + heading.y * along + across.y * sideways, dpr),
  ];

  return {
    body,
    radius: side * BUTTON_RADIUS_RATIO,
    outlineWidth: Math.max(1, snapToDevicePixels(OUTLINE_WIDTH, dpr)),
    arrow: [...vertex(half, 0), ...vertex(-back, half), ...vertex(-back, -half)],
  };
};
