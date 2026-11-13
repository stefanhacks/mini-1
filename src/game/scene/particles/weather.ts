// The weather in the world layer: the rain and its splashes, the bubbles and the eyes (m5-plan, deliverables 1–2),
// drawn by Pixi `ParticleContainer`s (weather-effects.ts) inside the playfield's render texture, so their cost doesn't
// grow with the screen. Written by Claude Code.
//
// Each container holds a fixed pool of particles, filled once and never `update()`d again: a free particle is parked
// off the playfield at alpha 0, and only the dynamic position and colour change (m5-particles-spec §7, pool rule). The
// systems (rain.ts, undersea.ts) run on the game clock, through `sync` in the frame loop's game-logic guard, so a
// pause or a halt freezes them, and `?timescale` speeds them up. Their draws come from the game's seed, salted per
// system: the same seed gives the same weather.
import type { Sprite } from "pixi.js";
import { placeOnArtGrid } from "../../../core/layers.ts";
import type { Point } from "../../../core/layout.ts";
import { createRng } from "../../challenges/rng.ts";
import type { Undersea } from "../../states/types.ts";
import { createRain } from "./rain.ts";
import { BUBBLE_SALT, EYE_SALT, PREWARM, RAIN_SALT, type EyeSize } from "./spec.ts";
import { createUndersea } from "./undersea.ts";
import type { WeatherParts } from "./weather-effects.ts";

/** Read at every `sync`. The scene sets it from the reduced-motion policy (game/motion.ts). */
export interface WeatherMotion {
  /** Multiplies the rain's emission: 1, the original's 220 drops a second, without reduced motion. */
  rainRate: number;
}

export interface WeatherStats {
  /** Live particles per system. */
  readonly drops: number;
  readonly splashes: number;
  readonly bubbles: number;
  /** Particles a full pool turned away since the last `start`. */
  readonly dropped: number;
  /** Eyes shown since the last `start`. */
  readonly eyes: number;
}

export interface Weather {
  /** Advances to `now` (game ms). Once a frame, after the clips, inside the game-logic guard (frame-loop.ts). */
  readonly sync: (now: number) => void;
  /** A new game: every system emptied, re-seeded from `seed` and prewarmed; Title's undersea. */
  readonly start: (seed: number) => void;
  /**
   * From the game clock's `now` on (WeatherOptions): the weather catches up to it first, so a window set from a timer
   * opens at that timer's due time, not at the last frame's `sync`.
   */
  readonly setUndersea: (undersea: Undersea | null) => void;
  readonly motion: WeatherMotion;
  readonly stats: WeatherStats;
}

const EYE_SIZES: readonly EyeSize[] = ["small", "large"];

export interface WeatherOptions {
  /** `?debug&eyes=always`: an eye in every window where one may show, so they can be reviewed without waiting. */
  readonly eyesAlways?: boolean;
  /**
   * The game clock's time (ms), the same `sync` gets: `setUndersea` catches the weather up to it. States call it from
   * the machine's step, before this frame's `sync`; without the catch-up, a window or a bubble rate would start at the
   * last frame's time, up to a frame early (a whole eye window at `?timescale=32`), and differ with the frame cuts.
   * Without it, `setUndersea` applies at the last `sync`.
   */
  readonly now?: () => number;
}

/**
 * Drives `parts` (weather-effects.ts `createWeatherEffects`). `boat` is the intact boat's sprite: drops die on it while
 * it shows. Nothing falls before the first `start` (Title).
 */
export const createWeather = (
  parts: WeatherParts,
  boat: { readonly visible: boolean; readonly position: Point },
  { eyesAlways = false, now }: WeatherOptions = {},
): Weather => {
  const rain = createRain(parts.drops, parts.splashes);
  const undersea = createUndersea(parts.bubbles, eyesAlways);
  const eyes: Readonly<Record<EyeSize, Sprite>> = {
    small: parts.effects["eye-small"],
    large: parts.effects["eye-large"],
  };
  const motion: WeatherMotion = { rainRate: 1 };
  /** Weather time (s): the game time synced since the first `start`. */
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

  const sync = (at: number) => {
    const elapsed = lastNow === null ? 0 : at - lastNow;

    lastNow = at;

    if (started && elapsed > 0) {
      const from = time;

      time += elapsed / 1000;
      step(from, time);
    }
  };

  return {
    sync,
    start: (seed) => {
      rain.reset(createRng((seed ^ RAIN_SALT) >>> 0));
      undersea.reset(createRng((seed ^ BUBBLE_SALT) >>> 0), createRng((seed ^ EYE_SALT) >>> 0));
      started = true;
      step(time - PREWARM, time);
    },
    setUndersea: (next) => {
      if (now !== undefined) {
        sync(now());
      }

      undersea.set(time, next);
    },
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
