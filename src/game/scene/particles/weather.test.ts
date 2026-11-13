// Written by Claude Code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Particle, ParticleContainer, Sprite, Texture } from "pixi.js";
import type { Undersea } from "../../states/types.ts";
import { PARKED_X } from "./pool.ts";
import { BUBBLES, RAIN, SPLASH } from "./spec.ts";
import { createWeather } from "./weather.ts";
import type { WeatherParts } from "./weather-effects.ts";

const pool = (size: number) =>
  Array.from({ length: size }, () => new Particle({ texture: Texture.WHITE, x: PARKED_X, y: 0, alpha: 0 }));

const eyeSprite = (label: string) => new Sprite({ texture: Texture.WHITE, anchor: 0.5, label, visible: false });

/** createWeatherEffects's shape, without the manifest's art (its PNG imports don't load under `node --test`). */
const createParts = (): WeatherParts => ({
  effects: {
    splash: new ParticleContainer(),
    rain: new ParticleContainer(),
    bubbles: new ParticleContainer(),
    "eye-small": eyeSprite("eye-small"),
    "eye-large": eyeSprite("eye-large"),
  },
  drops: pool(RAIN.pool),
  splashes: pool(SPLASH.pool),
  bubbles: pool(BUBBLES.pool),
});

/** A `setUndersea` from a state's timer, due at `at` game ms. */
interface Due {
  readonly at: number;
  readonly undersea: Undersea;
}

/**
 * Plays `dues` on a forced-eye weather in frames of `frame` ms, as the frame loop does: the clock ticks, its timers
 * call `setUndersea` at their due time (the clock's `now` inside a timer), then the weather syncs to the frame's time.
 * Returns the bubbles and the eye shown at each multiple of `sample` ms.
 */
const play = (frame: number, dues: readonly Due[], end: number, sample: number) => {
  const parts = createParts();
  let now = 0;
  const weather = createWeather(parts, { visible: false, position: { x: 0, y: 0 } }, {
    eyesAlways: true,
    now: () => now,
  });
  const samples: { at: number; bubbles: number[][]; eye: unknown[] | null; eyes: number }[] = [];
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  let next = 0;

  weather.sync(0);
  weather.start(7);

  for (let at = frame; at <= end; at += frame) {
    while (next < dues.length && dues[next].at <= at) {
      now = dues[next].at;
      weather.setUndersea(dues[next].undersea);
      next += 1;
    }

    now = at;
    weather.sync(at);

    if (at % sample === 0) {
      const shown = [parts.effects["eye-small"], parts.effects["eye-large"]].find((sprite) => sprite.visible);

      samples.push({
        at,
        // What shows, in a stable order: which slot a bubble takes, and whether one at the very end of its life is
        // freed yet, are the frames' business.
        bubbles: parts.bubbles
          .map((dot) => [dot.x, dot.y, round(dot.alpha)])
          .filter(([, , alpha]) => alpha > 0)
          .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
        eye: shown === undefined ? null : [shown.label, shown.x, shown.y, round(shown.alpha)],
        eyes: weather.stats.eyes,
      });
    }
  }

  return samples;
};

describe("createWeather", () => {
  it("opens and closes a window set from a timer at its due time, the same however the frames cut it", () => {
    // Part 2's 4 bubbles a second and an eye window between pages, set off the coarse frames' boundaries.
    const dues: Due[] = [
      { at: 1230, undersea: { part: 2, eyesFor: 1250 } },
      { at: 2480, undersea: { part: 2, eyesFor: 0 } },
      { at: 3910, undersea: { part: 3, eyesFor: 500 } },
      { at: 4410, undersea: { part: 3, eyesFor: 0 } },
    ];
    const fine = play(10, dues, 6000, 400);
    const coarse = play(400, dues, 6000, 400);

    assert.ok(fine.some((sample) => sample.eye !== null), "an eye shows at a sample");
    assert.deepEqual(coarse, fine);
  });
});
