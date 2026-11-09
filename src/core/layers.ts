// The stage tree every scene draws into. Layout math lives in layout.ts, which has no Pixi import and is unit tested.
import { Container } from "pixi.js";
import { fitPlayfield } from "./layout.ts";

export { controlZoneRect, PLAYFIELD_SIZE, type Rect } from "./layout.ts";

/**
 * - `playfield`: the PLAYFIELD_SIZE square of pixel art, in art pixels. M1 renders it into a render texture; until
 *   then it is contain-fitted straight onto the screen by `fitLayers`.
 *   - `world`: sea, sky, boat, backgrounds and the kraken.
 *   - `fx`: lightning, flash, black overlay, vignette, and the title logo above them.
 * - `ui`: screen space in CSS px, drawn above the playfield: text, buttons and every touch target (the render texture
 *   is not hit-tested).
 */
export interface Layers {
  readonly playfield: Container;
  readonly world: Container;
  readonly fx: Container;
  readonly ui: Container;
}

/** Builds the layers on `root`, back to front. */
export const createLayers = (root: Container): Layers => {
  const world = new Container({ label: "world" });
  const fx = new Container({ label: "fx" });
  const playfield = new Container({ label: "playfield", children: [world, fx] });
  const ui = new Container({ label: "ui" });

  root.addChild(playfield, ui);

  return { playfield, world, fx, ui };
};

/** Fits the playfield to a `width`×`height` screen. Temporary until M1's render texture. */
export const fitLayers = (layers: Layers, width: number, height: number) => {
  const fit = fitPlayfield(width, height);

  layers.playfield.scale.set(fit.scale);
  layers.playfield.position.set(fit.x, fit.y);
};
