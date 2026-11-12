// One playfield sprite from the manifest, placed on the art grid. Written by Claude Code.
import { Sprite, type Container, type Texture } from "pixi.js";
import { SPRITES, type SpriteKey } from "../../assets/manifest.ts";
import { placeOnArtGrid } from "../../core/layers.ts";
import type { Point } from "../../core/layout.ts";

export type Textures = Readonly<Record<SpriteKey, Texture>>;

/** Appends the sprite for `key` to `parent`, with its manifest anchor, at `at` in playfield px on the art grid. */
export const addArtSprite = (
  parent: Container,
  textures: Textures,
  key: SpriteKey,
  at: Point,
  label: string = key,
) => {
  const result = new Sprite({ texture: textures[key], anchor: SPRITES[key].anchor, label });

  placeOnArtGrid(result, at.x, at.y);
  parent.addChild(result);

  return result;
};
