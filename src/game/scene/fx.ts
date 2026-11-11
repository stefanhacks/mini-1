// The fx layer: the black overlay and the vignette. M4 adds the flash and the lightning bolts here. Written by Claude
// Code.
import { Graphics, Sprite } from "pixi.js";
import { SPRITES } from "../../assets/manifest.ts";
import type { Layers } from "../../core/layers.ts";
import { PLAYFIELD_SIZE } from "../../core/layout.ts";
import type { Textures } from "./art-sprite.ts";
import { BLACK } from "./palette.ts";
import { PLAYFIELD_CENTER, VIGNETTE_SCALE } from "./positions.ts";

export interface FxView {
  readonly black: Graphics;
  readonly vignette: Sprite;
  /** The black overlay (the original's `TelaPreta`) over the world, under the text box. */
  readonly setBlack: (visible: boolean) => void;
}

export const createFx = (layers: Layers, textures: Textures): FxView => {
  // TelaPreta is the flash sprite at 1.05, tinted black. A plain rect over the whole square does the same.
  const black = new Graphics({ label: "black" }).rect(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE).fill(BLACK);

  layers.fx.addChild(black);

  // At VIGNETTE_SCALE the vignette is off the art grid (see layers.ts), so it is placed directly.
  const vignette = new Sprite({ texture: textures.vignette, anchor: SPRITES.vignette.anchor, label: "vignette" });

  vignette.scale.set(VIGNETTE_SCALE);
  vignette.position.set(PLAYFIELD_CENTER.x, PLAYFIELD_CENTER.y);
  layers.fx.addChild(vignette);

  return {
    black,
    vignette,
    setBlack: (visible) => {
      black.visible = visible;
    },
  };
};
