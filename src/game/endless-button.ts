// The endless-mode icon's view (endless-plan.md): an infinity loop drawn with Graphics in the ui layer (CSS px), below
// the "reduce flashes" toggle. It only draws: the input router hit-tests the same rect (input/corner-geometry.ts)
// before the pads. Shown only while the states offer endless mode (Title's prompt, the Ending's replay prompt); on the
// replay prompt it pulses as the tap prompt does (`TMPIdle`), held at full alpha under reduced motion. Hidden while the
// layout has no room for it. Written by Claude Code.
import { Container, Graphics } from "pixi.js";
import { CLIPS } from "../assets/anims.ts";
import { evaluateCurve } from "../core/anim/hermite.ts";
import type { Layout } from "../core/layout.ts";
import { ICON_COLOR, iconGrid } from "./corner-icon.ts";
import { cornerButtonRect } from "./input/corner-geometry.ts";

export interface EndlessButtonView {
  /** Follows a new layout. Call it from onLayout. */
  readonly setLayout: (layout: Layout) => void;
  /** Shown or not, and pulsing or not (the end of the story's highlight). Idempotent. */
  readonly setAvailable: (available: boolean, highlighted: boolean) => void;
  /** The pulse at game time `now` (ms). Once a frame; cheap when not pulsing. */
  readonly sync: (now: number) => void;
  readonly graphics: Graphics;
}

/** The two loops' centres on the icon's 24-unit grid, their radius, and the points per loop. */
const LOOPS = [[7.5, 12], [16.5, 12]] as const;
const LOOP_RADIUS = 4.5;
const LOOP_POINTS = 24;

/** TMPIdle's alpha curve (1 → 0.647 → 1 over 1.6 s), the tap prompt's pulse. */
const PULSE = CLIPS.tmpIdle;
const PULSE_KEYS = PULSE.curves[0]?.keys ?? [];

/** The pulse's alpha at `ms` into it. */
export const pulseAlpha = (ms: number) => {
  const length = PULSE.length * 1000;

  return evaluateCurve(PULSE_KEYS, ((ms % length) + length) % length / 1000);
};

export const createEndlessButton = (parent: Container, reducedMotion: () => boolean): EndlessButtonView => {
  const graphics = new Graphics({ label: "endless-button", eventMode: "none" });
  let layout: Layout | null = null;
  let available = false;
  let highlighted = false;
  // When the pulse started (game ms), or null until the first sync after it was asked for.
  let pulseFrom: number | null = null;

  const draw = () => {
    graphics.clear();

    const rect = layout === null ? null : cornerButtonRect(layout, "endless");

    graphics.visible = available && rect !== null;

    if (layout === null || rect === null) {
      return;
    }

    const { at, unit, width } = iconGrid(layout, rect);

    // Two circles touching at the centre: an infinity sign that reads at 24 px.
    for (const [cx, cy] of LOOPS) {
      const points = Array.from({ length: LOOP_POINTS }, (_, i) => {
        const angle = (i / LOOP_POINTS) * Math.PI * 2;

        return at(cx + LOOP_RADIUS * Math.cos(angle), cy + LOOP_RADIUS * Math.sin(angle));
      }).flat();

      graphics.poly(points, true).stroke({ width: Math.max(width, unit * 2), color: ICON_COLOR, join: "round" });
    }
  };

  parent.addChild(graphics);

  return {
    setLayout: (next) => {
      layout = next;
      draw();
    },
    setAvailable: (nextAvailable, nextHighlighted) => {
      if (nextHighlighted !== highlighted) {
        highlighted = nextHighlighted;
        pulseFrom = null;
        graphics.alpha = 1;
      }

      if (nextAvailable !== available) {
        available = nextAvailable;
        draw();
      }
    },
    sync: (now) => {
      if (!available || !highlighted || reducedMotion()) {
        graphics.alpha = 1;
        return;
      }

      pulseFrom ??= now;
      graphics.alpha = pulseAlpha(now - pulseFrom);
    },
    graphics,
  };
};
