// Endless mode's time bar (endless-plan.md): a thin line under the arrow row's cursors that drains from right to left
// as the challenge's time limit runs out, in the voice's grey, white in its last quarter. Drawn with Graphics in the ui
// layer (CSS px), like the hold ring. Written by Claude Code.
import { Container, Graphics } from "pixi.js";
import { playfieldToScreen, snapToDevicePixels, type Layout } from "../../core/layout.ts";
import { VOICE_GREY } from "../story/script.ts";
import { WHITE } from "./palette.ts";
import { ARROW_ROW, CURSOR_OFFSET } from "./positions.ts";

/** The bar's centre, in playfield px: under the cursors, clear of the bottom edge. */
export const TIMER_BAR_AT = { x: ARROW_ROW.x, y: ARROW_ROW.y + CURSOR_OFFSET + 20 };

/** Its full width and its height, in playfield px, and the height's floor in CSS px. */
const BAR_WIDTH = 300;
const BAR_HEIGHT = 2;
const MIN_BAR_HEIGHT = 2;

/** The share of the time left below which the bar turns white. */
export const TIMER_WARN_BELOW = 0.25;

/** The alpha of the bar's track (the time already spent). */
const TRACK_ALPHA = 0.25;

export interface TimerBarView {
  readonly graphics: Graphics;
  /** The share of the time left (0..1), or null for no bar. Redraws only when a device pixel changes. */
  readonly setFraction: (fraction: number | null) => void;
  readonly relayout: (layout: Layout) => void;
}

export const createTimerBar = (parent: Container, initial: Layout): TimerBarView => {
  const graphics = new Graphics({ label: "timer-bar", eventMode: "none" });
  let layout = initial;
  let fraction: number | null = null;
  // What is drawn: the filled width in device px and the colour, so a frame that changes neither draws nothing.
  let drawnKey = "";

  const draw = (force = false) => {
    const width = BAR_WIDTH * layout.scale;
    const filled = fraction === null ? 0 : Math.round(Math.min(1, Math.max(0, fraction)) * width * layout.dpr);
    const warn = fraction !== null && fraction < TIMER_WARN_BELOW;
    const key = fraction === null ? "" : `${filled} ${warn}`;

    if (!force && key === drawnKey) {
      return;
    }

    drawnKey = key;
    graphics.clear();

    if (fraction === null) {
      return;
    }

    const snap = (value: number) => snapToDevicePixels(value, layout.dpr);
    const centre = playfieldToScreen(layout, TIMER_BAR_AT);
    const height = Math.max(MIN_BAR_HEIGHT, snap(BAR_HEIGHT * layout.scale));
    const left = snap(centre.x - width / 2);
    const top = snap(centre.y - height / 2);

    graphics.rect(left, top, snap(width), height).fill({ color: WHITE, alpha: TRACK_ALPHA });

    if (filled > 0) {
      graphics.rect(left, top, filled / layout.dpr, height).fill({ color: warn ? WHITE : VOICE_GREY });
    }
  };

  parent.addChild(graphics);

  return {
    graphics,
    setFraction: (next) => {
      fraction = next;
      draw();
    },
    relayout: (next) => {
      layout = next;
      draw(true);
    },
  };
};
