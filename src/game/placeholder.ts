// TEMPORARY M0 scene: a static frame of the title screen that proves the asset pipeline. M2/M4 replace it; removing
// it means deleting this file and its one call in main.ts.
// Positions come from the original Main.unity (canvas centre, y up) converted to playfield pixels (top-left, y down).
import { Sprite, Text, type Container, type Texture } from "pixi.js";
import type { Layers } from "../core/layers.ts";
import { SPRITES, type SpriteKey } from "../assets/manifest.ts";

type Placement = readonly [key: SpriteKey, x: number, y: number, scale?: number];
type Textures = Readonly<Record<SpriteKey, Texture>>;

const LABEL_FONT = "Josefin Slab";
const LABEL_MARGIN = 12;

// Back to front, as the original sortingOrder. The 500 px sea strips are centred: their scene x offsets would
// overhang the square, which nothing clips until M1's render texture. M4 animates their slide and bob.
const WORLD: readonly Placement[] = [
  ["seaB", 250, 389],
  ["boat", 250, 309.5],
  ["seaM", 250, 399],
  ["clouds", 250, 73],
  ["seaF", 250, 409],
];

// Main.unity scales the vignette to 1.05, so its dark rim sits just outside the square.
const FX: readonly Placement[] = [["vignette", 250, 250, 1.05]];

const TOP: readonly Placement[] = [["title", 250, 215]];

const placeAll = (layer: Container, placements: readonly Placement[], textures: Textures) => {
  for (const [key, x, y, scale = 1] of placements) {
    const sprite = new Sprite({ texture: textures[key], anchor: SPRITES[key].anchor, label: key });

    sprite.position.set(x, y);
    sprite.scale.set(scale);
    layer.addChild(sprite);
  }
};

/** Builds the scene and a "M0" label in the UI layer, which proves the font loads. Needs the font loaded first. */
export const buildPlaceholderScene = (layers: Layers, textures: Textures) => {
  placeAll(layers.world, WORLD, textures);
  placeAll(layers.fx, FX, textures);
  placeAll(layers.top, TOP, textures);

  const label = new Text({
    text: "M0",
    style: { fontFamily: LABEL_FONT, fontSize: 16, fill: "#ffffff" },
    label: "m0-label",
  });

  label.position.set(LABEL_MARGIN, LABEL_MARGIN);
  layers.ui.addChild(label);
};
