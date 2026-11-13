// Lightning strikes on the fx layer's bolt and flash: the original's DoTheThunder and DoWhileFlash.
// Written by Claude Code.
import type { Container, Sprite } from "pixi.js";
import { CLIPS } from "../../assets/anims.ts";
import type { Clip } from "../../core/anim/clip.ts";
import type { AnimNode, ClipHandle, ClipPlayer } from "../../core/anim/player.ts";
import { placeOnArtGrid } from "../../core/layers.ts";
import type { Rng } from "../challenges/rng.ts";
import {
  BOLT_KEYS,
  BOLT_TOP,
  drawStrike,
  FLASH_PEAK_EVENT,
  FLASH_REDUCED,
  flashRule,
  type StrikeKind,
} from "../lightning.ts";
import type { Textures } from "./art-sprite.ts";

export interface LightningView {
  /**
   * A strike drawn from `rng` (lightning.ts): the bolt flickers (`Raio.anim`) and the flash peaks (`Flash.anim`). A
   * `title-reveal` also calls `revealLogo` at the flash's peak, from the clip's own event. A strike cuts the last one.
   */
  readonly strike: (kind: StrikeKind, rng: Rng) => void;
  /** Drops a pending logo reveal: Title was left before its flash peaked. */
  readonly cancelReveal: () => void;
  /** Stops the strike, if any: bolt and flash hidden at alpha 0, no reveal pending. */
  readonly reset: () => void;
}

export interface LightningDeps {
  readonly bolt: Sprite;
  readonly flash: Container;
  readonly textures: Textures;
  readonly clips: ClipPlayer;
  readonly revealLogo: () => void;
  /** Read at each strike. */
  readonly reducedMotion: () => boolean;
  /** The "reduce flashes" toggle (reduce-flashes.ts), read at each strike like `reducedMotion`. */
  readonly reduceFlashes: () => boolean;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the player asked for reduced motion. A MediaQueryList's `matches` is live, so reading it at each strike
 * follows a change made while the game runs, with no listener to remove. False where there is no `matchMedia`.
 */
export const watchReducedMotion = (): (() => boolean) => {
  const query = typeof matchMedia === "function" ? matchMedia(REDUCED_MOTION_QUERY) : null;

  return () => query?.matches ?? false;
};

export const createLightning = (deps: LightningDeps): LightningView => {
  const { bolt, flash, textures, clips, revealLogo, reducedMotion, reduceFlashes } = deps;
  let playing: ClipHandle[] = [];
  let revealPending = false;

  const reveal = () => {
    if (revealPending) {
      revealPending = false;
      revealLogo();
    }
  };

  const stop = () => {
    for (const handle of playing) {
      handle.stop();
    }

    playing = [];
  };

  // Shown for the clip's length; the clips start and end at alpha 0.
  const play = (node: Container & AnimNode, clip: Clip, onEvent?: (name: string) => void) => {
    node.visible = true;
    playing.push(clips.play(clip, { node }, {
      onEvent,
      onEnd: () => {
        node.visible = false;
      },
    }));
  };

  return {
    strike: (kind, rng) => {
      const { bolt: index, x, mirrored } = drawStrike(kind, rng);
      const key = BOLT_KEYS[index];

      stop();
      // A reveal whose flash was cut short shows now, rather than never.
      reveal();
      bolt.texture = textures[key];
      bolt.scale.x = mirrored ? -1 : 1;
      placeOnArtGrid(bolt, x, BOLT_TOP);
      revealPending = kind === "title-reveal";
      play(bolt, CLIPS.raio);
      play(flash, flashRule(reducedMotion(), reduceFlashes()).capped ? FLASH_REDUCED : CLIPS.flash, (name) => {
        if (name === FLASH_PEAK_EVENT) {
          reveal();
        }
      });
    },
    cancelReveal: () => {
      revealPending = false;
    },
    reset: () => {
      stop();
      revealPending = false;

      for (const node of [bolt, flash]) {
        node.alpha = 0;
        node.visible = false;
      }
    },
  };
};
