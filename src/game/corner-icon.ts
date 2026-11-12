// What the corner buttons' icons share (mute-button.ts, pause-button.ts): the colour, the stroke, and a 24-unit grid on
// the icon box snapped to device pixels. Written by Claude Code.
import { snapToDevicePixels, type Layout, type Rect } from "../core/layout.ts";
import { cornerIconBox } from "./input/corner-geometry.ts";
import { VOICE_GREY } from "./story/script.ts";

/** The icons' colour: the voice grey, as the pad's outlines, so they stay out of the way. */
export const ICON_COLOR = VOICE_GREY;

/** Stroke width in CSS px, before snapping. */
const STROKE = 2;

/** Maps a point on the icon's 24-unit grid to snapped screen CSS px, as [x, y]. */
export type IconPoint = (x: number, y: number) => number[];

export interface IconGrid {
  readonly at: IconPoint;
  /** CSS px per grid unit. */
  readonly unit: number;
  /** The snapped stroke width, at least 1 CSS px. */
  readonly width: number;
}

/** The grid of the icon centred in the hit square `rect`. */
export const iconGrid = (layout: Layout, rect: Rect): IconGrid => {
  const snap = (value: number) => snapToDevicePixels(value, layout.dpr);
  const box = cornerIconBox(rect);
  const unit = box.width / 24;

  return {
    at: (x, y) => [snap(box.x + x * unit), snap(box.y + y * unit)],
    unit,
    width: Math.max(1, snap(STROKE)),
  };
};
