import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIPS } from "../assets/anims.ts";
import { evaluateCurve } from "../core/anim/hermite.ts";
import { PLAYFIELD_SIZE } from "../core/layout.ts";
import { createRng } from "./challenges/rng.ts";
import {
  BOLT_KEYS,
  capAlpha,
  drawStrike,
  FLASH_PEAK_EVENT,
  FLASH_REDUCED,
  FLASH_REDUCED_PEAK,
  flashRule,
  peakAlpha,
  STRIKE_HALF_RANGE,
  type StrikeKind,
} from "./lightning.ts";
import { TITLE_REVEAL_FLASH_MS } from "./states/timings.ts";

const draws = (kind: StrikeKind, count: number, seed = 7) => {
  const rng = createRng(seed);

  return Array.from({ length: count }, () => drawStrike(kind, rng));
};

/** The flash's alpha curve sampled every ms over its length. */
const sampleAlpha = (keys: Parameters<typeof evaluateCurve>[0], length: number) =>
  Array.from({ length: Math.round(length * 1000) + 1 }, (_, ms) => evaluateCurve(keys, ms / 1000));

describe("drawStrike", () => {
  it("reaches all 5 bolt sprites, for strikes and the reveal alike (quirk 8)", () => {
    for (const kind of ["lightning", "title-reveal"] as const) {
      const bolts = new Set(draws(kind, 500).map((strike) => strike.bolt));

      assert.deepEqual([...bolts].sort(), [0, 1, 2, 3, 4], kind);
    }

    assert.equal(BOLT_KEYS.length, 5);
  });

  it("puts a strike within ±500 / 3.75 px of the centre, and the reveal within ±500 / 4.75", () => {
    for (const [kind, divisor] of [["lightning", 3.75], ["title-reveal", 4.75]] as const) {
      const half = PLAYFIELD_SIZE / divisor;
      const xs = draws(kind, 2000).map((strike) => strike.x - PLAYFIELD_SIZE / 2);

      assert.equal(STRIKE_HALF_RANGE[kind], half);
      assert.ok(xs.every((x) => x >= -half && x < half), kind);
      // Spread over the range, both sides.
      assert.ok(Math.min(...xs) < -0.9 * half && Math.max(...xs) > 0.9 * half, kind);
    }
  });

  it("draws the sprite, the x, then the mirror: 3 numbers a strike, 2 for the reveal, which never mirrors", () => {
    const rng = createRng(11);
    const twin = createRng(11);

    drawStrike("lightning", rng);
    drawStrike("title-reveal", rng);
    Array.from({ length: 5 }, () => twin.next());
    assert.equal(rng.next(), twin.next());
    assert.ok(draws("title-reveal", 200).every((strike) => !strike.mirrored), "the reveal never mirrors");
  });
});

describe("flashRule", () => {
  it("caps the flash under OS reduced motion or the toggle; only the toggle turns the screen tone off", () => {
    const matrix = [
      { reducedMotion: false, reduceFlashes: false, capped: false, screenTone: true },
      { reducedMotion: true, reduceFlashes: false, capped: true, screenTone: true },
      { reducedMotion: false, reduceFlashes: true, capped: true, screenTone: false },
      { reducedMotion: true, reduceFlashes: true, capped: true, screenTone: false },
    ];

    for (const { reducedMotion, reduceFlashes, ...rule } of matrix) {
      assert.deepEqual(flashRule(reducedMotion, reduceFlashes), rule, `${reducedMotion}, ${reduceFlashes}`);
    }
  });
});

describe("the flash", () => {
  it("peaks at 1 at the DoingFlash event, which is TITLE_REVEAL_FLASH_MS in", () => {
    const [event] = CLIPS.flash.events;

    assert.equal(event.functionName, FLASH_PEAK_EVENT);
    assert.equal(event.time * 1000, TITLE_REVEAL_FLASH_MS);
    assert.equal(peakAlpha(CLIPS.flash), 1);
    assert.equal(evaluateCurve(CLIPS.flash.curves[0].keys, event.time), 1);
  });

  it("is capped at FLASH_REDUCED_PEAK for reduced motion, same shape, same times and event", () => {
    const full = sampleAlpha(CLIPS.flash.curves[0].keys, CLIPS.flash.length);
    const reduced = sampleAlpha(FLASH_REDUCED.curves[0].keys, FLASH_REDUCED.length);

    assert.equal(FLASH_REDUCED_PEAK, 0.4);
    assert.ok(Math.abs(Math.max(...reduced) - FLASH_REDUCED_PEAK) < 1e-9);
    reduced.forEach((alpha, ms) => assert.ok(Math.abs(alpha - full[ms] * FLASH_REDUCED_PEAK) < 1e-9, `at ${ms} ms`));
    assert.deepEqual(FLASH_REDUCED.events, CLIPS.flash.events);
    assert.equal(FLASH_REDUCED.length, CLIPS.flash.length);
    assert.deepEqual(
      FLASH_REDUCED.curves[0].keys.map((key) => key.time),
      CLIPS.flash.curves[0].keys.map((key) => key.time),
    );
    // The imported clip itself is untouched.
    assert.equal(peakAlpha(CLIPS.flash), 1);
  });

  it("leaves a clip already under the cap as it is", () => {
    assert.equal(capAlpha(FLASH_REDUCED, 0.5), FLASH_REDUCED);
    assert.equal(capAlpha(CLIPS.flash, 1), CLIPS.flash);
  });
});
