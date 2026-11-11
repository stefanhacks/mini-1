// The world layer: sea, sky, boat, backdrops and the kraken (WORLD_SPRITES). Written by Claude Code.
import type { Sprite } from "pixi.js";
import type { Layers } from "../../core/layers.ts";
import type { Backdrop, Boat } from "../states/types.ts";
import { addArtSprite, type Textures } from "./art-sprite.ts";
import { WORLD_SPRITES, type WorldSpriteLabel } from "./positions.ts";

export interface WorldView {
  /** Every world sprite by label, for the animation clips (M4). */
  readonly sprites: Readonly<Record<WorldSpriteLabel, Sprite>>;
  readonly setBackdrop: (backdrop: Backdrop, visible: boolean) => void;
  readonly setBoat: (state: Boat) => void;
  readonly setKraken: (visible: boolean) => void;
}

/** Appends WORLD_SPRITES to the world layer, in table order. Everything starts visible; the scene's `reset` hides. */
export const createWorld = (layers: Layers, textures: Textures): WorldView => {
  const sprites = {} as Record<WorldSpriteLabel, Sprite>;

  for (const { label, key, at } of WORLD_SPRITES) {
    sprites[label] = addArtSprite(layers.world, textures, key, at, label);
  }

  return {
    sprites,
    setBackdrop: (backdrop, visible) => {
      sprites[backdrop].visible = visible;
    },
    setBoat: (state) => {
      sprites.boat.visible = state === "whole";
      sprites["broken-boat"].visible = state === "broken";
    },
    setKraken: (visible) => {
      sprites["kraken-tail"].visible = visible;
      sprites["kraken-body"].visible = visible;
    },
  };
};
