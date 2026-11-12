// What the corner buttons' icons share (mute-button.ts, pause-button.ts, flashes-button.ts): the colour, the stroke, a
// 24-unit grid on the icon box snapped to device pixels, and the "off" slash. Written by Claude Code.
import type { Graphics } from "pixi.js";
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

/** A slash across the whole icon, with a black edge so it reads where it crosses the icon's shape. */
export const drawSlash = (graphics: Graphics, at: IconPoint, width: number) => {
  const [x0, y0] = at(3, 3);
  const [x1, y1] = at(21, 21);

  graphics.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width * 3, color: 0x000000, cap: "round" });
  graphics.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color: ICON_COLOR, cap: "round" });
};
