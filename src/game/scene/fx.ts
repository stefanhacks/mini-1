// The fx layer, back to front as the original's sortingOrder: the lightning bolt `Raio` (−2), the black overlay
// `TelaPreta` and the vignette (−1), then the white flash (0). The world below tops out at −2 (the broken boat), and
// the text box (0) and the logo (15) are in `top`, above. Written by Claude Code.
import { Graphics, Sprite } from "pixi.js";
import { SPRITES } from "../../assets/manifest.ts";
import type { Layers } from "../../core/layers.ts";
import { PLAYFIELD_SIZE } from "../../core/layout.ts";
import { BOLT_KEYS } from "../lightning.ts";
import type { Textures } from "./art-sprite.ts";
import { BLACK, WHITE } from "./palette.ts";
import { PLAYFIELD_CENTER, VIGNETTE_SCALE } from "./positions.ts";

export interface FxView {
  /** Hidden at alpha 0 until a strike (scene/lightning.ts sets its texture, mirror and place). */
  readonly bolt: Sprite;
  readonly black: Graphics;
  readonly vignette: Sprite;
  /** Hidden at alpha 0 until a strike. */
  readonly flash: Graphics;
  /** The black overlay (the original's `TelaPreta`) over the world, under the text box. */
  readonly setBlack: (visible: boolean) => void;
}

export const createFx = (layers: Layers, textures: Textures): FxView => {
  const [firstBolt] = BOLT_KEYS;
  const bolt = new Sprite({
    texture: textures[firstBolt],
    anchor: SPRITES[firstBolt].anchor,
    label: "bolt",
    alpha: 0,
    visible: false,
  });

  layers.fx.addChild(bolt);

  // TelaPreta is the flash sprite at 1.05, tinted black. A plain rect over the whole square does the same.
  const black = new Graphics({ label: "black" }).rect(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE).fill(BLACK);

  layers.fx.addChild(black);

  // At VIGNETTE_SCALE the vignette is off the art grid (see layers.ts), so it is placed directly.
  const vignette = new Sprite({ texture: textures.vignette, anchor: SPRITES.vignette.anchor, label: "vignette" });

  vignette.scale.set(VIGNETTE_SCALE);
  vignette.position.set(PLAYFIELD_CENTER.x, PLAYFIELD_CENTER.y);
  layers.fx.addChild(vignette);

  // The flash sprite is solid white at 1.2, past every edge of the square: a plain rect over it does the same.
  const flash = new Graphics({ label: "flash", alpha: 0, visible: false })
    .rect(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE)
    .fill(WHITE);

  layers.fx.addChild(flash);

  return {
    bolt,
    black,
    vignette,
    flash,
    setBlack: (visible) => {
      black.visible = visible;
    },
  };
};
