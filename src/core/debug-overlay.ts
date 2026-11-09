// The `?debug` overlay: outlines of the layout's safe rect, square and control zones, drawn in the UI layer for
// screenshots and device checks.
import { Graphics } from "pixi.js";
import type { Layout, Rect } from "./layout.ts";

const SAFE_COLOR = "#00ff66";
const SQUARE_COLOR = "#ffcc00";
const ZONE_COLOR = "#ff33cc";
const LINE_WIDTH = 2;

/** True when the page URL has a `debug` query parameter, with or without a value. */
export const isDebugEnabled = () => new URLSearchParams(window.location.search).has("debug");

export const createDebugOverlay = () => new Graphics({ label: "debug-overlay" });

/** Redraws the outlines for `layout`. Strokes sit inside each rect, so an edge on the screen border stays visible. */
export const drawDebugOverlay = (overlay: Graphics, layout: Layout) => {
  const outline = (rect: Rect, color: string) => {
    overlay.rect(rect.x, rect.y, rect.width, rect.height).stroke({ width: LINE_WIDTH, color, alignment: 1 });
  };

  overlay.clear();
  outline(layout.safe, SAFE_COLOR);
  outline(layout.square, SQUARE_COLOR);

  for (const zone of layout.zones) {
    outline(zone, ZONE_COLOR);
  }
};
