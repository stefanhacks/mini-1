// TEMPORARY M0/M1 scene: a static frame of the title screen that proves the asset pipeline, plus the text box with a
// test line that proves the playfield-to-screen mapping. M2/M4 replace it; removing it means deleting this file and
// its calls in main.ts.
// Positions come from the original Main.unity (canvas centre, y up) converted to playfield pixels (top-left, y down).
import { Sprite, Text, type Container, type Texture } from "pixi.js";
import type { Layers } from "../core/layers.ts";
import type { Layout } from "../core/layout.ts";
import { SPRITES, type SpriteKey } from "../assets/manifest.ts";
import { placeStoryText, TEXT_BOX_CENTER } from "./text-box.ts";

type Placement = readonly [key: SpriteKey, x: number, y: number, scale?: number];
type Textures = Readonly<Record<SpriteKey, Texture>>;

const TEXT_FONT = "Josefin Slab";
const TEST_LINE = "Captain! This wind is too strong!";

// Back to front, as the original sortingOrder. The 500 px sea strips are centred: their scene x offsets would
// overhang the square, which the render texture clips. M4 animates their slide and bob.
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

export interface PlaceholderScene {
  /** The story text box art in `top`, hidden by default as in the original. */
  readonly textBox: Sprite;
  /** The M1 test line in `ui`. */
  readonly line: Text;
  /** Moves the test line onto the text box for a new layout. Call it on every resize. */
  readonly relayout: (layout: Layout) => void;
}

/** Builds the scene, then shows the text box with a test line in the UI layer. Needs the font loaded first. */
export const buildPlaceholderScene = (layers: Layers, textures: Textures): PlaceholderScene => {
  placeAll(layers.world, WORLD, textures);
  placeAll(layers.fx, FX, textures);
  placeAll(layers.top, TOP, textures);

  const textBox = new Sprite({
    texture: textures.textBox,
    anchor: SPRITES.textBox.anchor,
    position: TEXT_BOX_CENTER,
    visible: false,
    label: "textBox",
  });

  layers.top.addChild(textBox);

  // M1 only: M2/M4 drive the text box. The colour is HistoryText's.
  const line = new Text({
    text: TEST_LINE,
    anchor: { x: 0.5, y: 0 },
    style: { fontFamily: TEXT_FONT, fill: "#ffffff", align: "center", wordWrap: true },
    label: "text-line",
  });

  textBox.visible = true;
  layers.ui.addChild(line);

  const relayout = (layout: Layout) => {
    const placement = placeStoryText(layout);

    line.style.fontSize = placement.fontSize;
    line.style.lineHeight = placement.lineHeight;
    line.style.wordWrapWidth = placement.wrapWidth;
    line.position.set(placement.anchor.x, placement.anchor.y);
  };

  return { textBox, line, relayout };
};
