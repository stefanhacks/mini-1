// TEMPORARY M0 scene: a static frame of the title screen that proves the asset pipeline. M2/M4 replace it.
// Positions come from the original Main.unity (canvas centre, y up) converted to playfield pixels (top-left, y down).
import { Sprite, type Texture } from "pixi.js";
import type { Layers } from "../core/layers.ts";
import { SPRITES, type SpriteKey } from "../assets/manifest.ts";

type Placement = readonly [key: SpriteKey, x: number, y: number];

// Back to front, as the original sortingOrder. The 500 px sea strips are centred: their scene x offsets would
// overhang the square, which nothing clips until M1's render texture. M4 animates their slide and bob.
const WORLD: readonly Placement[] = [
  ["seaB", 250, 389],
  ["boat", 250, 309.5],
  ["seaM", 250, 399],
  ["clouds", 250, 73],
  ["seaF", 250, 409],
];

// The vignette, then the title logo, which the original draws above every light effect.
const FX: readonly Placement[] = [
  ["vignette", 250, 250],
  ["title", 250, 215],
];

const place = ([key, x, y]: Placement, textures: Readonly<Record<SpriteKey, Texture>>) => {
  const sprite = new Sprite({ texture: textures[key], anchor: SPRITES[key].anchor, label: key });

  sprite.position.set(x, y);

  return sprite;
};

export const buildPlaceholderScene = (layers: Layers, textures: Readonly<Record<SpriteKey, Texture>>) => {
  layers.world.addChild(...WORLD.map((placement) => place(placement, textures)));
  layers.fx.addChild(...FX.map((placement) => place(placement, textures)));
};
