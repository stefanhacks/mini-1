// TEMPORARY M0/M1 scene: a static frame of the title screen that proves the asset pipeline, plus the text box with a
// test line that proves the playfield-to-screen mapping. M2/M4 replace it; removing it means deleting this file and
// its calls in main.ts.
// Positions come from the original Main.unity (canvas centre, y up) converted to playfield pixels (top-left, y down).
import { CanvasTextMetrics, Sprite, Text, type Container, type Texture } from "pixi.js";
import { placeOnArtGrid, type Layers } from "../core/layers.ts";
import type { Layout } from "../core/layout.ts";
import { SPRITES, type SpriteKey } from "../assets/manifest.ts";
import { placeStoryText, storyLinesPerPage, TEXT_BOX_CENTER } from "./text-box.ts";

type Placement = readonly [key: SpriteKey, x: number, y: number, scale?: number];
type Textures = Readonly<Record<SpriteKey, Texture>>;

const TEXT_FONT = "Josefin Slab";
const TEST_LINE = "Captain! This wind is too strong!";

// Back to front, as the original sortingOrder. The 500 px sea strips are centred: their scene x offsets would
// overhang the square, which the render texture clips. M4 animates their slide and bob. The boat is at 310, not the
// original's 309.5: on whole art pixels (see layers.ts).
const WORLD: readonly Placement[] = [
  ["seaB", 250, 389],
  ["boat", 250, 310],
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

    sprite.scale.set(scale);

    if (Number.isInteger(scale)) {
      placeOnArtGrid(sprite, x, y);
    } else {
      sprite.position.set(x, y);
    }

    layer.addChild(sprite);
  }
};

export interface PlaceholderScene {
  /** The story text box art in `top`. */
  readonly textBox: Sprite;
  /** The M1 test line in `ui`: the first page of TEST_LINE that fits the box. */
  readonly line: Text;
  /** Moves the test line onto the text box for a new layout, and re-pages it. Call it on every resize. */
  readonly relayout: (layout: Layout) => void;
}

/** Builds the scene, then the text box with a test line in the UI layer. Needs the font loaded first. */
export const buildPlaceholderScene = (layers: Layers, textures: Textures): PlaceholderScene => {
  placeAll(layers.world, WORLD, textures);
  placeAll(layers.fx, FX, textures);
  placeAll(layers.top, TOP, textures);

  // Shown for M1, to prove the mapping. M2 hides it outside the story, as the original does.
  const textBox = new Sprite({ texture: textures.textBox, anchor: SPRITES.textBox.anchor, label: "textBox" });

  placeOnArtGrid(textBox, TEXT_BOX_CENTER.x, TEXT_BOX_CENTER.y);
  layers.top.addChild(textBox);

  // M1 only: M2/M4 drive the text. The colour is HistoryText's. Centred both ways on the text rect, as the original.
  // `roundPixels` keeps it on whole device pixels: the centre anchor can put an edge on half of one.
  const line = new Text({
    text: TEST_LINE,
    anchor: { x: 0.5, y: 0.5 },
    style: { fontFamily: TEXT_FONT, fill: "#ffffff", align: "center", wordWrap: true },
    roundPixels: true,
    label: "text-line",
  });

  layers.ui.addChild(line);

  // Shows the first page: as many wrapped lines as fit the box (`storyLinesPerPage`). M4 pages through the rest.
  const relayout = (layout: Layout) => {
    const placement = placeStoryText(layout);

    line.style.fontSize = placement.fontSize;
    line.style.lineHeight = placement.lineHeight;
    line.style.wordWrapWidth = placement.wrapWidth;
    line.text = CanvasTextMetrics.measureText(TEST_LINE, line.style).lines
      .slice(0, storyLinesPerPage(layout))
      .join("\n");
    line.position.set(placement.anchor.x, placement.anchor.y);
  };

  return { textBox, line, relayout };
};
