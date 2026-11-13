// The world layer: sea, sky, boat, backdrops and the kraken (WORLD_SPRITES), with their clips: the ambient loops
// (sea, clouds, the boat's bob), the backdrops' and the kraken's fades, and the broken boat thrown up. The weather's
// containers (scene/particles) are drawn in between, as WORLD_EFFECTS places them.
// Written by Claude Code.
import type { Container, Sprite } from "pixi.js";
import { CLIPS, TARGETS } from "../../assets/anims.ts";
import type { Clip } from "../../core/anim/clip.ts";
import type { ClipHandle, ClipPlayer } from "../../core/anim/player.ts";
import { placeOnArtGrid, type Layers } from "../../core/layers.ts";
import type { Point } from "../../core/layout.ts";
import type { Backdrop, Boat, Fade } from "../states/types.ts";
import { addArtSprite, type Textures } from "./art-sprite.ts";
import { faded, type Fades } from "./fades.ts";
import { WORLD_EFFECTS, WORLD_SPRITES, type WorldEffectLabel, type WorldSpriteLabel } from "./positions.ts";

export interface WorldView {
  /** Every world sprite by label, for tests and the debug overlay. */
  readonly sprites: Readonly<Record<WorldSpriteLabel, Sprite>>;
  /** Starts the ambient loops, once (scene.ts, last in the build): they run for the page's life, replays included. */
  readonly startAmbient: () => void;
  /** The ambient loops' speed, from their current pose on (reduced motion slows them, game/motion.ts). Default 1. */
  readonly setAmbientSpeed: (speed: number) => void;
  readonly setBackdrop: (backdrop: Backdrop, visible: boolean, fade?: Fade) => void;
  readonly setBoat: (state: Boat) => void;
  readonly setKraken: (visible: boolean, fade?: Fade) => void;
  /** Puts the sprites the clips move (the kraken's body, the broken boat) back at their WORLD_SPRITES places. */
  readonly resetPoses: () => void;
}

/** Where `Sky`'s sprite `index` (Clouds1, Clouds2) sits when the Sky's anchored position is (0, 0). */
const cloudOrigin = (index: number): Point => {
  const sky = TARGETS["Stage/Sky"];
  const { offset } = sky.sprites[index];

  return { x: sky.anchorOrigin.x + offset.x, y: sky.anchorOrigin.y + offset.y };
};

interface AmbientLoop {
  readonly label: WorldSpriteLabel;
  readonly clip: Clip;
  /** Where the clip's position (0, 0) puts the sprite (anims.ts TARGETS). */
  readonly origin: Point;
}

/**
 * The loops each world sprite plays from the first frame, as their animators' default states in Main.unity. The sea
 * strips use the clips' x as they are (225 sliding to 193): the art repeats every 32 px, so the loop is seamless, and
 * the right-edge gap it leaves is under the vignette's opaque rim, as in the original. SeaAnimTrês's `m_SizeDelta.y`
 * is left unbound (a SpriteRenderer ignores it; it is 0 throughout).
 */
const AMBIENT_LOOPS: readonly AmbientLoop[] = [
  { label: "seaF", clip: CLIPS.seaAnim, origin: TARGETS["Stage/Sea/Front"].anchorOrigin },
  { label: "seaM", clip: CLIPS.seaAnimDois, origin: TARGETS["Stage/Sea/Mid"].anchorOrigin },
  { label: "seaB", clip: CLIPS.seaAnimTres, origin: TARGETS["Stage/Sea/Back"].anchorOrigin },
  { label: "clouds", clip: CLIPS.clouds, origin: cloudOrigin(0) },
  { label: "clouds-2", clip: CLIPS.clouds, origin: cloudOrigin(1) },
  { label: "boat", clip: CLIPS.barco, origin: TARGETS["Stage/Barco Inteiro/InteiroSprite"].parentOrigin },
];

type WorldSprites = Readonly<Record<WorldSpriteLabel, Sprite>>;

/** Starts AMBIENT_LOOPS on `sprites`, at `speed`. */
const playAmbientLoops = (clips: ClipPlayer, sprites: WorldSprites, speed: number) =>
  AMBIENT_LOOPS.map(({ label, clip, origin }) => clips.play(clip, { node: sprites[label], origin }, { speed }));

/**
 * The boat's states: the whole boat bobbing, the broken one at its spot or thrown up (its end pose stays), or none.
 * `placeHome` puts a sprite back at its WORLD_SPRITES place.
 */
const createBoat = (sprites: WorldSprites, fades: Fades, placeHome: (label: WorldSpriteLabel) => void) => {
  const broken = sprites["broken-boat"];
  // The broken boat's clip animates its child QuebradoSprite: the sprite is that child, and the clip has no curve on
  // the parent itself.
  const thrown = {
    clip: CLIPS.barcoQuebradoJogadoCima,
    speed: 1,
    target: {
      node: broken,
      children: {
        QuebradoSprite: { node: broken, origin: TARGETS["Stage/Barco Quebrado/QuebradoSprite"].parentOrigin },
      },
    },
  };
  let boat: Boat | null = null;

  return (state: Boat) => {
    if (state === boat) {
      return;
    }

    const wasThrown = boat === "thrown";

    boat = state;
    sprites.boat.visible = state === "whole";

    if (state === "whole" || state === "none") {
      fades.hide(broken);
    } else {
      fades.show(broken);
    }

    if (state === "thrown") {
      fades.play(broken, thrown);
    } else if (wasThrown) {
      fades.stop(broken);
      placeHome("broken-boat");
    }
  };
};

/**
 * Appends WORLD_SPRITES to the world layer, in table order, each after the `effects` drawn just behind it
 * (WORLD_EFFECTS). Every sprite starts visible; the scene's `reset` hides.
 */
export const createWorld = (
  layers: Layers,
  textures: Textures,
  clips: ClipPlayer,
  fades: Fades,
  effects: Readonly<Record<WorldEffectLabel, Container>>,
): WorldView => {
  const sprites = {} as Record<WorldSpriteLabel, Sprite>;
  const homes = {} as Record<WorldSpriteLabel, Point>;

  for (const { label, key, at } of WORLD_SPRITES) {
    for (const effect of WORLD_EFFECTS) {
      if (effect.before === label) {
        layers.world.addChild(effects[effect.label]);
      }
    }

    sprites[label] = addArtSprite(layers.world, textures, key, at, label);
    homes[label] = at;
  }

  const body = sprites["kraken-body"];
  const tail = sprites["kraken-tail"];
  const bodyOrigin = TARGETS["Stage/Monster/Body"].parentOrigin;
  let ambient: ClipHandle[] | null = null;
  let ambientSpeed = 1;

  const placeHome = (label: WorldSpriteLabel) => placeOnArtGrid(sprites[label], homes[label].x, homes[label].y);

  return {
    sprites,
    startAmbient: () => {
      ambient ??= playAmbientLoops(clips, sprites, ambientSpeed);
    },
    setAmbientSpeed: (speed) => {
      ambientSpeed = speed;
      ambient?.forEach((handle) => handle.setSpeed(speed));
    },
    setBackdrop: (backdrop, visible, fade) => {
      const sprite = sprites[backdrop];

      if (visible) {
        fades.show(sprite, faded(fade, CLIPS.fadeIn));
      } else {
        fades.hide(sprite, faded(fade, CLIPS.fadeOut));
      }
    },
    setBoat: createBoat(sprites, fades, placeHome),
    setKraken: (visible, fade) => {
      if (visible) {
        fades.show(body, faded(fade, CLIPS.fadeKrakenA, { node: body, origin: bodyOrigin }));
        fades.show(tail, faded(fade, CLIPS.fadeKrakenB));
      } else {
        fades.hide(body);
        fades.hide(tail);
      }
    },
    resetPoses: () => {
      placeHome("kraken-body");
      placeHome("broken-boat");
    },
  };
};
