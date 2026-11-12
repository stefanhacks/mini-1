// The screen tone (m5-plan deliverable 3, owner decisions 2 and 8): the renderer's clear colour follows the lightning
// flash, so the letterbox and the insets flash with the square. Each frame, after the clips sync and before the stage
// renders, the clear colour becomes grey `a`, white at the flash's alpha `a` over black, and black again once the flash
// hides. The playfield's render texture clears to its own black (core/display.ts) and its sprite is opaque, so the
// square shows only its own flash. It follows the clock: a pause freezes the flash's clip, and so the tone. Pure
// TypeScript (types only from Pixi), so it runs under `node --test`. Written by Claude Code.
import type { ColorSource } from "pixi.js";

/** The clear colour's grey for a flash at `alpha`: white at `alpha` over black, in 0..1. */
export const toneGrey = (alpha: number) => (alpha > 0 ? Math.min(alpha, 1) : 0);

export interface ScreenToneDeps {
  /** The renderer's background (`renderer.background`): Pixi clears the canvas to its colour before the stage. */
  readonly background: { color: ColorSource };
  /** The flash node, once the scene is built. */
  readonly flash: () => { readonly visible: boolean; readonly alpha: number } | undefined;
  /** Whether the tone shows at all (lightning.ts `flashRule`), read every frame. */
  readonly shown: () => boolean;
}

export interface ScreenTone {
  /** Sets the clear colour from the flash. Call it every frame, before Pixi renders the stage. */
  readonly sync: () => void;
  /** The clear colour's grey now, 0..1. */
  readonly grey: number;
}

export const createScreenTone = ({ background, flash, shown }: ScreenToneDeps): ScreenTone => {
  let grey = 0;

  return {
    sync: () => {
      const node = flash();
      const next = node !== undefined && node.visible && shown() ? toneGrey(node.alpha) : 0;

      // Only on a change: most frames have no flash.
      if (next !== grey) {
        grey = next;
        background.color = [grey, grey, grey];
      }
    },
    get grey() {
      return grey;
    },
  };
};
