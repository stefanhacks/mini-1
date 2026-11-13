// "Tap to continue": the pause overlay (m5-plan, deliverable 5), merged with the audio prompt of m3-plan's deliverable
// 5, so a pause and audio that needs a tap show one prompt, and one tap answers both. A dim over the whole screen, and
// white text on a black box under the logo (positions.ts), over everything: the scene's texts, the corner buttons and
// any flash. Static. While it shows, the scene's own tap prompt (Title's "Tap to begin", the ending's "Tap to play
// again") is not drawn (m5-plan decision 13): only `renderable` changes, so its fade and pulse, frozen with the paused
// clock, carry on from the same alpha once the prompt goes.
// Written by Claude Code.
import { Container, Graphics, type Text } from "pixi.js";
import type { Layers } from "../../core/layers.ts";
import { snapToDevicePixels, type Layout } from "../../core/layout.ts";
import { BLACK } from "./palette.ts";
import { CONTINUE_PROMPT, TAP_PROMPT } from "./positions.ts";
import { createUiText, placeUiText } from "./ui-text.ts";

export const TAP_TO_CONTINUE = "Tap to continue";

/** The black box's padding around the text, in CSS px. */
const CONTINUE_PADDING = { x: 16, y: 10 } as const;

/** How much the dim darkens the game under the prompt. */
const DIM_ALPHA = 0.5;

/** How far the dim reaches past the safe rect, in CSS px: more than any safe-area inset, so it covers the screen. */
const DIM_OVERSCAN = 256;

export interface ContinuePromptScene {
  /** The audio lifecycle's prompt: audio needs a tap to resume. Idempotent. */
  readonly setAudioPrompt: (shown: boolean) => void;
  /** The game's pause (pause.ts). Idempotent. */
  readonly setPaused: (paused: boolean) => void;
  /** Whether the prompt shows: paused, or audio needs a tap. */
  readonly visible: boolean;
  /** Follows a new layout. Call it from `onLayout`. */
  readonly relayout: (layout: Layout) => void;
  readonly container: Container;
}

interface ContinueParts {
  readonly container: Container;
  readonly dim: Graphics;
  readonly box: Graphics;
  readonly text: Text;
}

/** Places the text in `layout` and, while the prompt shows, draws the dim and the box around the text. */
const drawContinuePrompt = ({ container, dim, box, text }: ContinueParts, layout: Layout) => {
  const snap = (value: number) => snapToDevicePixels(value, layout.dpr);
  const { safe } = layout;

  placeUiText(text, CONTINUE_PROMPT, layout);
  dim.clear();
  box.clear();

  if (!container.visible) {
    return;
  }

  const reach = 2 * DIM_OVERSCAN;

  dim.rect(safe.x - DIM_OVERSCAN, safe.y - DIM_OVERSCAN, safe.width + reach, safe.height + reach)
    .fill({ color: BLACK, alpha: DIM_ALPHA });

  const width = snap(text.width + 2 * CONTINUE_PADDING.x);
  const height = snap(text.height + 2 * CONTINUE_PADDING.y);

  box.rect(snap(text.x - width / 2), snap(text.y - height / 2), width, height).fill(BLACK);
};

/** Builds "Tap to continue" into the ui layer, hidden. Shown only once the game runs (the font is in). */
export const createContinuePrompt = (layers: Layers, initial: Layout): ContinuePromptScene => {
  const container = new Container({ label: "continue", visible: false });
  // The dim, then the box, then the text, back to front.
  const dim = container.addChild(new Graphics({ label: "continue-dim" }));
  const box = container.addChild(new Graphics({ label: "continue-box" }));
  const text = createUiText(container, CONTINUE_PROMPT, TAP_TO_CONTINUE);
  let layout = initial;
  let audioPrompt = false;
  let paused = false;

  layers.ui.addChild(container);

  const draw = () => drawContinuePrompt({ container, dim, box, text }, layout);

  const update = () => {
    const visible = audioPrompt || paused;

    if (visible) {
      // Above the scene's texts and the corner buttons, which were added later or earlier: always on top.
      layers.ui.addChild(container);
    }

    if (visible !== container.visible) {
      container.visible = visible;
      draw();
    }

    // Looked up each time: the scene is built after this prompt, at the gate.
    const covered = layers.ui.getChildByLabel(TAP_PROMPT.label);

    if (covered !== null) {
      covered.renderable = !visible;
    }
  };

  return {
    setAudioPrompt: (shown) => {
      audioPrompt = shown;
      update();
    },
    setPaused: (next) => {
      paused = next;
      update();
    },
    get visible() {
      return container.visible;
    },
    relayout: (next) => {
      layout = next;
      draw();
    },
    container,
  };
};
