// The "reduce flashes" toggle's view (m5-plan owner decisions 7 and 9): a lightning bolt drawn with Graphics in the ui
// layer (CSS px), below the pause button, struck through while flashes are reduced, as the mute icon is while muted.
// It only draws: the input router hit-tests the same rect (input/corner-geometry.ts) before the pads. Shown from the
// gate on, like mute; hidden while the layout has no room for it. Written by Claude Code.
import { Container, Graphics } from "pixi.js";
import type { Layout } from "../core/layout.ts";
import { drawSlash, ICON_COLOR, iconGrid } from "./corner-icon.ts";
import { cornerButtonRect } from "./input/corner-geometry.ts";

export interface FlashesButtonView {
  /** Follows a new layout. Call it from onLayout. */
  readonly setLayout: (layout: Layout) => void;
  /** Reduced, the bolt is struck through. Idempotent. */
  readonly setReduced: (reduced: boolean) => void;
  readonly graphics: Graphics;
}

/** The bolt on the icon's 24-unit grid, as tall as the other icons (4 to 20): [x, y] corners, clockwise from top. */
const BOLT = [[13, 4], [18, 4], [14.5, 10], [19, 10], [9, 20], [11, 13], [6, 13]] as const;

export const createFlashesButton = (parent: Container): FlashesButtonView => {
  const graphics = new Graphics({ label: "flashes-button", eventMode: "none" });
  let layout: Layout | null = null;
  let reduced = false;

  const draw = () => {
    graphics.clear();

    const rect = layout === null ? null : cornerButtonRect(layout, "flashes");

    graphics.visible = rect !== null;

    if (layout === null || rect === null) {
      return;
    }

    const { at, width } = iconGrid(layout, rect);

    graphics.poly(BOLT.flatMap(([x, y]) => at(x, y))).fill({ color: ICON_COLOR });

    if (reduced) {
      drawSlash(graphics, at, width);
    }
  };

  parent.addChild(graphics);

  return {
    setLayout: (next) => {
      layout = next;
      draw();
    },
    setReduced: (next) => {
      if (next !== reduced) {
        reduced = next;
        draw();
      }
    },
    graphics,
  };
};
