// The Pixi application on the page: the canvas in #game, the layers, the playfield display and the debug overlay.
// Written by Claude Code.
import { Application } from "pixi.js";
import { createDebugOverlay, isDebugEnabled } from "../core/debug-overlay.ts";
import { PlayfieldDisplay } from "../core/display.ts";
import { createLayers } from "../core/layers.ts";
import { blockContextMenu, getGameElement, readResolution } from "../core/viewport.ts";

export const createStage = async () => {
  const gameElement = getGameElement();
  const app = new Application();

  // No `resizeTo`: Pixi's ResizePlugin would size the canvas from clientWidth/clientHeight, half a device pixel off at
  // fractional ratios. resize.ts sizes it instead.
  await app.init({
    background: "#000000",
    resolution: readResolution(),
    autoDensity: true,
  });

  gameElement.appendChild(app.canvas);
  blockContextMenu(gameElement);

  const layers = createLayers();
  const display = new PlayfieldDisplay(app.renderer, layers.playfield);
  const debugEnabled = isDebugEnabled();
  const overlay = debugEnabled ? createDebugOverlay() : null;

  app.stage.addChild(display.sprite, layers.ui);

  // The first child of `ui`: everything else draws over it (m4-refactor.md, rule 1).
  if (overlay) {
    layers.ui.addChild(overlay);
  }

  return { gameElement, app, layers, display, debugEnabled, overlay };
};

export type Stage = Awaited<ReturnType<typeof createStage>>;
