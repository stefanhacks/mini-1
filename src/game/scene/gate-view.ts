// The start gate's view (m3-plan, deliverable 2): the flashing-lights warning, the load bar and the tap prompt, in the
// ui layer. Moved from scene.ts. Written by Claude Code.
import { CanvasTextMetrics, Graphics, type Text } from "pixi.js";
import type { Layers } from "../../core/layers.ts";
import { playfieldToScreen, snapToDevicePixels, type Layout, type Rect } from "../../core/layout.ts";
import type { GateScreen, GateView } from "../states/types.ts";
import { VOICE_GREY } from "../story/script.ts";
import { WHITE } from "./palette.ts";
import { GATE_BAR, GATE_PROMPT, GATE_WARNING } from "./positions.ts";
import { createUiText, placeUiText } from "./ui-text.ts";

export const GATE_WARNING_TEXT = "This game contains\nflashing lights.";

/** The bar's height never goes under this many CSS px, so it reads on a small square. */
const MIN_BAR_HEIGHT = 2;

export interface GateScene extends GateView {
  /** Follows a new layout. Call it from `onLayout`. */
  readonly relayout: (layout: Layout) => void;
  /**
   * Call once the UI font has loaded: drops the font metrics measured with a fallback and redraws the texts, so a text
   * drawn before the font (the failure screen, then a retry that loads it) doesn't keep the fallback.
   */
  readonly refreshFont: () => void;
  readonly parts: { readonly warning: Text; readonly bar: Graphics; readonly prompt: Text };
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/** The same screen shown again: nothing to redraw. Hiding (null) always goes through. */
const sameScreen = (next: GateScreen | null, shown: GateScreen | null) =>
  next !== null && shown !== null && next.progress === shown.progress && next.warning === shown.warning
  && next.prompt === shown.prompt;

/** The bar's track on screen, snapped to device pixels, and the width of its filled part for `progress`. */
const barRect = (layout: Layout, progress: number): Rect & { readonly fill: number } => {
  const snap = (value: number) => snapToDevicePixels(value, layout.dpr);
  const topLeft = playfieldToScreen(layout, GATE_BAR);
  const width = snap(GATE_BAR.width * layout.scale);

  return {
    x: snap(topLeft.x),
    y: snap(topLeft.y),
    width,
    height: Math.max(MIN_BAR_HEIGHT, snap(GATE_BAR.height * layout.scale)),
    fill: snap(width * clamp01(progress)),
  };
};

/**
 * Builds the gate's view into the ui layer, hidden. Needs nothing loaded: the bar is Graphics, and the texts are only
 * shown once the font is in (Gate decides, see GateLoader.fontReady), except the failure line.
 */
export const createGateView = (layers: Layers, initial: Layout): GateScene => {
  const warning = createUiText(layers.ui, GATE_WARNING, GATE_WARNING_TEXT, false);
  const prompt = createUiText(layers.ui, GATE_PROMPT, "", false);
  const bar = new Graphics({ label: "gate-bar", visible: false });
  let layout = initial;
  let shown: GateScreen | null = null;

  layers.ui.addChild(bar);

  const drawBar = () => {
    bar.clear();
    bar.visible = shown?.progress !== null && shown?.progress !== undefined;

    if (shown === null || shown.progress === null) {
      return;
    }

    const { x, y, width, height, fill } = barRect(layout, shown.progress);

    bar.rect(x, y, width, height).fill({ color: VOICE_GREY, alpha: 0.5 });

    if (fill > 0) {
      bar.rect(x, y, fill, height).fill(WHITE);
    }
  };

  const gate: GateScene = {
    show: (screen) => {
      if (sameScreen(screen, shown)) {
        return;
      }

      shown = screen;
      warning.visible = screen?.warning ?? false;
      prompt.visible = screen?.prompt !== null && screen?.prompt !== undefined;
      prompt.text = screen?.prompt ?? "";
      drawBar();
    },
    relayout: (next) => {
      layout = next;
      placeUiText(warning, GATE_WARNING, next);
      placeUiText(prompt, GATE_PROMPT, next);
      drawBar();
    },
    refreshFont: () => {
      CanvasTextMetrics.clearMetrics();
      warning.style.update();
      prompt.style.update();
    },
    parts: { warning, bar, prompt },
  };

  gate.relayout(initial);

  return gate;
};
