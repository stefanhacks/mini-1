// The pause button's view (m5-plan owner decision 6): two bars drawn with Graphics in the ui layer (CSS px), just below
// the mute button, and a play triangle while paused (decision 13). It only draws: the input router hit-tests the same
// rect (input/corner-geometry.ts) before the pads. Hidden at the gate, where pausing is off, and while the layout has
// no room for it. Written by Claude Code.
import { Container, Graphics } from "pixi.js";
import type { Layout } from "../core/layout.ts";
import { ICON_COLOR, iconGrid } from "./corner-icon.ts";
import { cornerButtonRect } from "./input/corner-geometry.ts";

export interface PauseButtonView {
  /** Follows a new layout. Call it from onLayout. */
  readonly setLayout: (layout: Layout) => void;
  /** Shows or hides it (pause.ts: hidden while pausing is off). Idempotent. */
  readonly setEnabled: (enabled: boolean) => void;
  /** Paused, it shows the play icon. Idempotent. */
  readonly setPaused: (paused: boolean) => void;
  readonly graphics: Graphics;
}

/** The two bars on the icon's 24-unit grid: [left, right] of each. */
const BARS = [[6, 10], [14, 18]] as const;

/** The bars' top and bottom on the same grid, as tall as the mute icon's speaker. */
const BAR_TOP = 4;

const BAR_BOTTOM = 20;

/** The play triangle on the same grid, as tall as the bars, its centroid at the grid's centre: [x, y] corners. */
const PLAY = [[8, BAR_TOP], [20, 12], [8, BAR_BOTTOM]] as const;

export const createPauseButton = (parent: Container): PauseButtonView => {
  const graphics = new Graphics({ label: "pause-button", eventMode: "none" });
  let layout: Layout | null = null;
  let enabled = false;
  let paused = false;

  const draw = () => {
    graphics.clear();

    const rect = layout === null ? null : cornerButtonRect(layout, "pause");

    graphics.visible = enabled && rect !== null;

    if (layout === null || rect === null) {
      return;
    }

    const { at } = iconGrid(layout, rect);

    if (paused) {
      graphics.poly(PLAY.flatMap(([x, y]) => at(x, y))).fill({ color: ICON_COLOR });

      return;
    }

    for (const [left, right] of BARS) {
      graphics.poly([...at(left, BAR_TOP), ...at(right, BAR_TOP), ...at(right, BAR_BOTTOM), ...at(left, BAR_BOTTOM)])
        .fill({ color: ICON_COLOR });
    }
  };

  parent.addChild(graphics);

  return {
    setLayout: (next) => {
      layout = next;
      draw();
    },
    setEnabled: (next) => {
      if (next !== enabled) {
        enabled = next;
        draw();
      }
    },
    setPaused: (next) => {
      if (next !== paused) {
        paused = next;
        draw();
      }
    },
    graphics,
  };
};
