// The weather in the world layer: the rain and its splashes, the bubbles and the eyes (m5-plan, deliverables 1–2),
// drawn by Pixi `ParticleContainer`s inside the playfield's render texture, so their cost doesn't grow with the screen.
// Written by Claude Code.
//
// Each container holds a fixed pool of particles, filled once and never `update()`d again: a free particle is parked
// off the playfield at alpha 0, and only the dynamic position and colour change (m5-particles-spec §7, pool rule). The
// systems (rain.ts, undersea.ts) run on the game clock, through `sync` in the frame loop's game-logic guard, so a
// pause or a halt freezes them, and `?timescale` speeds them up. Their draws come from the game's seed, salted per
// system: the same seed gives the same weather.
import { Particle, ParticleContainer, Rectangle, Sprite, Texture } from "pixi.js";
import { SPRITES } from "../../../assets/manifest.ts";
import { placeOnArtGrid } from "../../../core/layers.ts";
import { PLAYFIELD_SIZE, type Point } from "../../../core/layout.ts";
import { createRng } from "../../challenges/rng.ts";
import type { Undersea } from "../../states/types.ts";
import type { Textures } from "../art-sprite.ts";
import type { WorldEffectLabel } from "../positions.ts";
import { PARKED_X } from "./pool.ts";
import { createRain } from "./rain.ts";
import { BUBBLE_SALT, BUBBLES, EYE_SALT, PREWARM, RAIN, RAIN_SALT, SPLASH, type EyeSize } from "./spec.ts";
import { createUndersea } from "./undersea.ts";

/** By WORLD_EFFECTS label: the world appends each where that table puts it. */
export interface WeatherEffects extends Readonly<Record<WorldEffectLabel, ParticleContainer | Sprite>> {
  readonly splash: ParticleContainer;
  readonly rain: ParticleContainer;
  readonly bubbles: ParticleContainer;
  readonly "eye-small": Sprite;
  readonly "eye-large": Sprite;
}

interface PoolSpec {
  readonly label: string;
  readonly texture: Texture;
  readonly size: number;
  readonly anchor: number;
  readonly scale: number;
}

/** A container of `size` parked particles, which only ever change position and colour. */
const createPool = ({ label, texture, size, anchor, scale }: PoolSpec) => {
  const particles = Array.from({ length: size }, () => new Particle({
    texture,
    x: PARKED_X,
    y: 0,
    anchorX: anchor,
    anchorY: anchor,
    scaleX: scale,
    scaleY: scale,
    alpha: 0,
  }));
  const container = new ParticleContainer({
    label,
    texture,
    dynamicProperties: { position: true, color: true },
    // A ParticleContainer measures no bounds: the playfield is enough.
    boundsArea: new Rectangle(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE),
  });

  container.addParticle(...particles);

  return { container, particles };
};

const createEye = (textures: Textures, key: "eyeSmall" | "eyeLarge", label: string) =>
  new Sprite({ texture: textures[key], anchor: SPRITES[key].anchor, label, visible: false, alpha: 0 });

/** Builds the weather's display objects, unattached: the world appends them in WORLD_EFFECTS order. */
export const createWeatherEffects = (textures: Textures) => {
  const splash = createPool({
    label: "splash",
    texture: Texture.WHITE,
    size: SPLASH.pool,
    anchor: 0,
    scale: SPLASH.size,
  });
  const rain = createPool({
    label: "rain",
    texture: textures.raindrop,
    size: RAIN.pool,
    anchor: 0.5,
    scale: RAIN.scale,
  });
  const bubbles = createPool({
    label: "bubbles",
    texture: textures.bubble,
    size: BUBBLES.pool,
    anchor: 0.5,
    scale: BUBBLES.scale,
  });
  const effects: WeatherEffects = {
    splash: splash.container,
    rain: rain.container,
    bubbles: bubbles.container,
    "eye-small": createEye(textures, "eyeSmall", "eye-small"),
    "eye-large": createEye(textures, "eyeLarge", "eye-large"),
  };

  return { effects, drops: rain.particles, splashes: splash.particles, bubbles: bubbles.particles };
};

export type WeatherParts = ReturnType<typeof createWeatherEffects>;

/**
 * How fast the weather goes. Reduced motion's hook (m5-plan, deliverable 4, wave 2): read at every `sync`, and left at
 * 1 and 1 until then.
 */
export interface WeatherMotion {
  /** Multiplies the rain's emission: 1 is the original's 220 drops a second. */
  rainRate: number;
  /** Weather seconds per game second: every drop, splash, bubble and eye moves, and emits, this much faster. */
  speed: number;
}

export interface WeatherStats {
  /** Live particles per system. */
  readonly drops: number;
  readonly splashes: number;
  readonly bubbles: number;
  /** Particles a full pool turned away, and eyes shown, since the last `start`. */
  readonly dropped: number;
  readonly eyes: number;
}

export interface Weather {
  /** Advances to `now` (game ms). Once a frame, after the clips, inside the game-logic guard (frame-loop.ts). */
  readonly sync: (now: number) => void;
  /** A new game: every system emptied, re-seeded from `seed` and prewarmed; Title's undersea. */
  readonly start: (seed: number) => void;
  readonly setUndersea: (undersea: Undersea | null) => void;
  readonly motion: WeatherMotion;
  readonly stats: WeatherStats;
}

const EYE_SIZES: readonly EyeSize[] = ["small", "large"];

export interface WeatherOptions {
  /** `?debug&eyes=always`: an eye in every slot where one may show, so they can be reviewed without waiting. */
  readonly eyesAlways?: boolean;
}

/**
 * Drives `parts` (createWeatherEffects). `boat` is the intact boat's sprite: drops die on it while it shows. Nothing
 * falls before the first `start` (Title).
 */
export const createWeather = (
  parts: WeatherParts,
  boat: { readonly visible: boolean; readonly position: Point },
  { eyesAlways = false }: WeatherOptions = {},
): Weather => {
  const rain = createRain(parts.drops, parts.splashes);
  const undersea = createUndersea(parts.bubbles, eyesAlways);
  const eyes: Readonly<Record<EyeSize, Sprite>> = {
    small: parts.effects["eye-small"],
    large: parts.effects["eye-large"],
  };
  const motion: WeatherMotion = { rainRate: 1, speed: 1 };
  /** Weather time (s): game time at `motion.speed`. */
  let time = 0;
  let lastNow: number | null = null;
  let started = false;

  const step = (from: number, to: number) => {
    rain.step(from, to, { rate: motion.rainRate, boat: boat.visible ? boat.position : null });
    undersea.step(from, to, { rate: 1 });

    const frame = undersea.eye;

    for (const size of EYE_SIZES) {
      const sprite = eyes[size];

      sprite.visible = frame?.size === size;

      if (frame?.size === size) {
        sprite.alpha = frame.alpha;
        placeOnArtGrid(sprite, frame.x, frame.y);
      }
    }
  };

  return {
    sync: (now) => {
      const elapsed = lastNow === null ? 0 : now - lastNow;

      lastNow = now;

      if (started && elapsed > 0) {
        const from = time;

        time += (elapsed / 1000) * motion.speed;
        step(from, time);
      }
    },
    start: (seed) => {
      rain.reset(createRng((seed ^ RAIN_SALT) >>> 0));
      undersea.reset(time, createRng((seed ^ BUBBLE_SALT) >>> 0), createRng((seed ^ EYE_SALT) >>> 0));
      started = true;
      step(time - PREWARM, time);
    },
    setUndersea: (next) => undersea.set(time, next),
    motion,
    stats: {
      get drops() {
        return rain.stats.drops;
      },
      get splashes() {
        return rain.stats.splashes;
      },
      get bubbles() {
        return undersea.stats.bubbles;
      },
      get dropped() {
        return rain.stats.dropped + undersea.stats.dropped;
      },
      get eyes() {
        return undersea.stats.eyes;
      },
    },
  };
};
