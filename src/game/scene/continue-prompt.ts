// "Tap to continue" (m3-plan, deliverable 5): audio needs a tap to resume. Minimal and static (the pause overlay is
// M5): white text on a black box at the playfield's centre, over everything. Moved from scene.ts. Written by Claude
// Code.
import { Container, Graphics } from "pixi.js";
import type { Layers } from "../../core/layers.ts";
import { snapToDevicePixels, type Layout } from "../../core/layout.ts";
import { BLACK } from "./palette.ts";
import { CONTINUE_PROMPT } from "./positions.ts";
import { createUiText, placeUiText } from "./ui-text.ts";

export const TAP_TO_CONTINUE = "Tap to continue";

/** The black box's padding around the text, in CSS px. */
const CONTINUE_PADDING = { x: 16, y: 10 } as const;

export interface ContinuePromptScene {
  /** Shows or hides the prompt; showing it also brings it to the top of the ui layer. Idempotent. */
  readonly setVisible: (visible: boolean) => void;
  /** Follows a new layout. Call it from `onLayout`. */
  readonly relayout: (layout: Layout) => void;
  readonly container: Container;
}

/** Builds the "Tap to continue" prompt into the ui layer, hidden. Shown only once the game runs (the font is in). */
export const createContinuePrompt = (layers: Layers, initial: Layout): ContinuePromptScene => {
  const container = new Container({ label: "continue", visible: false });
  // The box first, so it draws under the text.
  const box = container.addChild(new Graphics({ label: "continue-box" }));
  const text = createUiText(container, CONTINUE_PROMPT, TAP_TO_CONTINUE);
  let layout = initial;

  layers.ui.addChild(container);

  const draw = () => {
    const snap = (value: number) => snapToDevicePixels(value, layout.dpr);

    placeUiText(text, CONTINUE_PROMPT, layout);
    box.clear();

    if (!container.visible) {
      return;
    }

    const width = snap(text.width + 2 * CONTINUE_PADDING.x);
    const height = snap(text.height + 2 * CONTINUE_PADDING.y);

    box.rect(snap(text.x - width / 2), snap(text.y - height / 2), width, height).fill(BLACK);
  };

  return {
    setVisible: (visible) => {
      if (visible) {
        // Above the scene's texts and the mute button, which were added later or earlier: always on top.
        layers.ui.addChild(container);
      }

      if (visible !== container.visible) {
        container.visible = visible;
        draw();
      }
    },
    relayout: (next) => {
      layout = next;
      draw();
    },
    container,
  };
};
