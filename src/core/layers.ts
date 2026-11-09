// The stage tree every scene draws into. Layout math (PLAYFIELD_SIZE, the fit, the control zone) lives in layout.ts,
// which has no Pixi import: import it from there, so logic that uses it stays testable under node.
import { Container } from "pixi.js";

/**
 * - `playfield`: the PLAYFIELD_SIZE square of pixel art, in art pixels. It is never on the stage: PlayfieldDisplay
 *   (display.ts) renders it into a render texture every frame, and the stage shows that texture.
 *   - `world`: sea, sky, boat, backgrounds and the kraken.
 *   - `fx`: lightning, flash, black overlay and vignette.
 *   - `top`: pixel art the original draws above every light effect: the title logo, credits and the text box.
 * - `ui`: screen space in CSS px, drawn above the playfield: text, buttons and every touch target (the render texture
 *   is not hit-tested). Map playfield points onto it with `playfieldToScreen` from layout.ts.
 */
export interface Layers {
  readonly playfield: Container;
  readonly world: Container;
  readonly fx: Container;
  readonly top: Container;
  readonly ui: Container;
}

/** Builds the layers, back to front. The caller puts the playfield's display, then `ui`, on the stage. */
export const createLayers = (): Layers => {
  const world = new Container({ label: "world" });
  const fx = new Container({ label: "fx" });
  const top = new Container({ label: "top" });
  const playfield = new Container({ label: "playfield", children: [world, fx, top] });
  const ui = new Container({ label: "ui" });

  return { playfield, world, fx, top, ui };
};
