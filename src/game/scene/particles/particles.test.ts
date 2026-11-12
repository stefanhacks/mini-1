import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng } from "../../challenges/rng.ts";
import { createSlots, emitBetween, PARKED_X, type Dot } from "./pool.ts";
import { createRain, type RainStep } from "./rain.ts";
import { BUBBLES, bubbleRate, bubbleSway, EYES, PREWARM, RAIN, SPLASH } from "./spec.ts";
import { createUndersea, type EyeFrame } from "./undersea.ts";

const dots = (count: number): Dot[] => Array.from({ length: count }, () => ({ x: PARKED_X, y: 0, alpha: 0 }));

const live = (pool: readonly Dot[]) => pool.filter((dot) => dot.alpha > 0);

const NO_BOAT: RainStep = { rate: 1, boat: null };

/** Steps `system` from `from` to `to` in frames of `frame` s. */
const run = (step: (from: number, to: number) => void, from: number, to: number, frame = 1 / 60) => {
  for (let at = from; at < to - 1e-9; at += frame) {
    step(at, Math.min(at + frame, to));
  }
};

const rainFrom = (seed: number) => {
  const drops = dots(RAIN.pool);
  const splashes = dots(SPLASH.pool);
  const rain = createRain(drops, splashes);

  rain.reset(createRng(seed));

  return { rain, drops, splashes };
};

describe("emitBetween", () => {
  it("emits at even intervals and carries the fraction across steps", () => {
    const emitter = { phase: 0 };
    const times: number[] = [];

    emitBetween(emitter, 4, 0, 0.6, (at) => times.push(at));
    emitBetween(emitter, 4, 0.6, 1, (at) => times.push(at));
    assert.deepEqual(times.map((at) => Math.round(at * 1000)), [250, 500, 750, 1000]);
    emitBetween(emitter, 0, 1, 2, (at) => times.push(at));
    assert.equal(times.length, 4, "a rate of 0 emits nothing");
  });
});

describe("createSlots", () => {
  it("hands slots out from 0, reuses the last freed, and refuses when full", () => {
    const slots = createSlots(3);

    assert.deepEqual([slots.take(), slots.take(), slots.take(), slots.take()], [0, 1, 2, -1]);
    slots.free(1);
    assert.equal(slots.inUse, 2);
    assert.equal(slots.take(), 1);
  });
});

describe("rain", () => {
  it("emits 220 drops a second over the original's box: 194.5 a second where they can reach the playfield", () => {
    let spawned = 0;
    const emitter = { phase: 0 };

    emitBetween(emitter, RAIN.rate, 0, 10, () => (spawned += 1));
    assert.equal(spawned, Math.floor(RAIN.rate * 10));
    assert.ok(Math.abs((RAIN.rate * 1000) / (RAIN.x.max - RAIN.x.min) - 220) < 1e-9);
  });

  it("keeps its live drops inside the pool at steady state", () => {
    const { rain, drops } = rainFrom(1);
    const counts: number[] = [];

    run((from, to) => {
      rain.step(from, to, NO_BOAT);
      counts.push(rain.stats.drops);
    }, 0, 6);

    const steady = counts.slice(counts.length / 2);
    const mean = steady.reduce((sum, count) => sum + count, 0) / steady.length;

    assert.ok(mean > 150 && mean < 190, `mean ${mean}`);
    assert.ok(Math.max(...counts) <= RAIN.pool);
    assert.equal(rain.stats.dropped, 0);
    assert.equal(live(drops).length, rain.stats.drops);
  });

  it("moves drops at (−375, +375) px/s on whole px, and kills each by its 1 s life or at the sea line", () => {
    const { rain, drops } = rainFrom(2);
    const lives: number[] = [];
    let seen = new Map<number, { x: number; y: number }>();

    run((from, to) => {
      rain.step(from, to, NO_BOAT);

      const next = new Map<number, { x: number; y: number }>();

      drops.forEach((dot, slot) => {
        if (dot.alpha > 0) {
          assert.ok(Number.isInteger(dot.x) && Number.isInteger(dot.y));
          assert.ok(dot.y <= RAIN.seaLine, `a drop below the sea line: ${dot.y}`);
          assert.ok(dot.alpha >= RAIN.alpha.min - 1e-9 && dot.alpha <= RAIN.alpha.max + 1e-9);
          next.set(slot, { x: dot.x, y: dot.y });

          const before = seen.get(slot);

          // Same drop a frame on: 6.25 px left and down, give or take the rounding.
          if (before !== undefined && before.y < dot.y) {
            assert.ok(Math.abs(before.x - dot.x - 6.25) <= 1 && Math.abs(dot.y - before.y - 6.25) <= 1);
          }
        }
      });
      seen = next;
      lives.push(next.size);
    }, 0, 3);

    assert.ok(lives.every((count) => count > 0));
  });

  it("splashes three dots where a drop meets the sea line, inside the playfield only", () => {
    const { rain, splashes } = rainFrom(3);
    let maxSplashes = 0;

    run((from, to) => {
      rain.step(from, to, NO_BOAT);
      maxSplashes = Math.max(maxSplashes, rain.stats.splashes);

      for (const dot of live(splashes)) {
        assert.ok(dot.x >= RAIN.splashX.min - SPLASH.spread - 10 && dot.x <= RAIN.splashX.max + SPLASH.spread);
        // A hop: up to 8.8 px over the line, down to 7 px under it at the end.
        assert.ok(dot.y >= RAIN.seaLine - 10 && dot.y <= RAIN.seaLine + 8, `${dot.y}`);
        assert.ok(dot.alpha <= SPLASH.alpha.max + 1e-9);
      }
    }, 0, 4);

    // About 70 hits a second in the playfield, 3 dots each for 0.75 s: the spec's mean of 158.
    assert.ok(rain.stats.splashes > 110 && maxSplashes <= SPLASH.pool, `${rain.stats.splashes}, ${maxSplashes}`);
    assert.equal(rain.stats.dropped, 0);
  });

  it("lands a splash's three dots within 1 px of each other", () => {
    const { rain, splashes } = rainFrom(9);
    let checked = 0;

    // About one drop a second: one splash at a time.
    run((from, to) => {
      rain.step(from, to, { rate: 1 / RAIN.rate, boat: null });

      const shown = live(splashes);

      if (shown.length === SPLASH.count) {
        const xs = shown.map((dot) => dot.x);
        const ys = shown.map((dot) => dot.y);

        const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

        assert.ok(spread <= 1, `${xs.join()} ${ys.join()}`);
        checked += 1;
      }
    }, 0, 30);

    assert.ok(checked > 100, `${checked}`);
  });

  it("drops nothing under long steps (?timescale=32): spent splashes free their slots first", () => {
    const { rain } = rainFrom(10);

    run((from, to) => rain.step(from, to, NO_BOAT), 0, 60, 32 / 60);
    run((from, to) => rain.step(from, to, NO_BOAT), 60, 120, 3.2);
    assert.equal(rain.stats.dropped, 0);
  });

  it("kills drops on the intact boat's capsule, and splashes there", () => {
    const boat = { x: 250, y: 310 };
    const { rain, drops, splashes } = rainFrom(4);
    let onBoat = 0;

    run((from, to) => {
      rain.step(from, to, { rate: 1, boat });

      for (const dot of live(drops)) {
        const inside = Math.abs(dot.x - boat.x) < 11 && Math.abs(dot.y - boat.y - 0.7) < 15;

        assert.ok(!inside, `a drop inside the boat at ${dot.x}, ${dot.y}`);
      }

      onBoat += live(splashes).filter((dot) => dot.y < 300).length;
    }, 0, 4);

    assert.ok(onBoat > 0, "splashes on the boat's top");
  });

  it("emits at the reduced-motion hook's rate", () => {
    const full = rainFrom(5);
    const half = rainFrom(5);

    run((from, to) => full.rain.step(from, to, NO_BOAT), 0, 3);
    run((from, to) => half.rain.step(from, to, { rate: 0.5, boat: null }), 0, 3);
    assert.ok(Math.abs(half.rain.stats.drops / full.rain.stats.drops - 0.5) < 0.1);
  });

  it("is the same for the same seed whatever the frames, and different for another seed", () => {
    const a = rainFrom(6);
    const b = rainFrom(6);
    const c = rainFrom(7);

    run((from, to) => a.rain.step(from, to, NO_BOAT), 0, 2, 1 / 60);
    run((from, to) => b.rain.step(from, to, NO_BOAT), 0, 2, 1 / 30);
    run((from, to) => c.rain.step(from, to, NO_BOAT), 0, 2, 1 / 60);

    const sorted = (pool: readonly Dot[]) => live(pool).map(({ x, y, alpha }) => `${x},${y},${alpha}`).sort();

    assert.deepEqual(sorted(a.drops), sorted(b.drops));
    assert.notDeepEqual(sorted(a.drops), sorted(c.drops));
  });

  it("empties both pools on reset", () => {
    const { rain, drops, splashes } = rainFrom(8);

    run((from, to) => rain.step(from, to, NO_BOAT), 0, 2);
    rain.reset(createRng(8));
    assert.deepEqual([rain.stats.drops, rain.stats.splashes, live(drops).length, live(splashes).length], [0, 0, 0, 0]);
    assert.ok(drops.every((dot) => dot.x === PARKED_X));
  });
});

const underseaFrom = (seed: number, always = false) => {
  const bubbles = dots(BUBBLES.pool);
  const undersea = createUndersea(bubbles, always);
  const eyes: EyeFrame[] = [];

  undersea.reset(createRng(seed), createRng(seed + 1));

  const step = (from: number, to: number) => {
    undersea.step(from, to, { rate: 1 });

    if (undersea.eye !== null) {
      eyes.push(undersea.eye);
    }
  };

  step(0, PREWARM);

  return { undersea, bubbles, eyes, step };
};

describe("bubbles", () => {
  it("rise at 1 a second, then 2, 4 and 6 after each won round", () => {
    assert.deepEqual([0, 1, 2, 3].map(bubbleRate), [1, 2, 4, 6]);

    const { undersea, step } = underseaFrom(1);
    const alive = (part: number, from: number) => {
      undersea.set(from, { part, eyesFor: 0 });
      run(step, from, from + 10);

      return undersea.stats.bubbles;
    };

    // Each lives 5 s: rate × 5 alive.
    assert.deepEqual([alive(0, 2), alive(1, 12), alive(2, 22), alive(3, 32)], [5, 10, 20, 30]);
    assert.equal(undersea.stats.dropped, 0);
  });

  it("prewarms 2 s, rising 30 px a second from the sea floor with the shared sway, and fading at 4.5 s", () => {
    const { bubbles, undersea, step } = underseaFrom(2);

    assert.equal(undersea.stats.bubbles, 2, "Unity's 2 s prewarm at 1 a second");
    run(step, PREWARM, 7);

    for (const dot of live(bubbles)) {
      assert.ok(dot.y >= 349 && dot.y <= 503, `${dot.y}`);
      assert.ok(dot.x >= 87 && dot.x <= 413 + 15, `${dot.x}`);
    }

    assert.equal(bubbleSway(0), 0);
    assert.equal(bubbleSway(2), 14.4);
    assert.ok(Math.abs(bubbleSway(2.25) - 14.05) < 1e-9);
  });

  it("stops and fades out over 1 s once the kraken shows, and starts again on reset", () => {
    const { bubbles, undersea, step } = underseaFrom(3);

    undersea.set(2, { part: 3, eyesFor: 0 });
    run(step, 2, 10);
    assert.ok(undersea.stats.bubbles >= 25);
    undersea.set(10, null);
    run(step, 10, 10.5);
    assert.ok(live(bubbles).every((dot) => dot.alpha <= BUBBLES.alpha.max / 2 + 0.01), "half faded");
    run(step, 10.5, 11.1);
    assert.deepEqual([undersea.stats.bubbles, live(bubbles).length, undersea.eye], [0, 0, null]);
    run(step, 11.1, 20);
    assert.equal(undersea.stats.bubbles, 0, "none after the kraken");

    undersea.reset(createRng(3), createRng(4));
    step(20 - PREWARM, 20);
    assert.equal(undersea.stats.bubbles, 2, "a replay prewarms Title's 1 a second again");
  });
});

describe("eyes", () => {
  /**
   * The windows of a game with no text box or challenge up, in game ms (states/: part 0's preamble, each transition
   * and the wait after each won round, the ending before the kraken), as [part, window].
   */
  const WINDOWS: readonly (readonly [number, number])[] = [
    [0, 2500], [0, 500], [0, 1250], [1, 500], [1, 1250], [2, 500], [2, 1250], [3, 1500],
  ];

  /** Plays a whole game's windows from a fresh game, `gap` s of pages or challenges between them; the eyes shown. */
  const playGame = (seed: number, always = false, gap = 20) => {
    const { undersea, step, eyes } = underseaFrom(seed, always);
    const shown: { part: number; frames: EyeFrame[] }[] = [];
    let at = PREWARM;

    for (const [part, window] of WINDOWS) {
      const before = eyes.length;

      undersea.set(at, { part, eyesFor: window });
      run(step, at, at + window / 1000);
      at += window / 1000;
      undersea.set(at, { part, eyesFor: 0 });
      assert.equal(undersea.eye, null, "an eye is gone as its window closes");

      if (eyes.length > before) {
        shown.push({ part, frames: eyes.slice(before) });
      }

      run(step, at, at + gap);
      assert.equal(undersea.eye, null, "no eye behind a page or during a challenge");
      at += gap;
    }

    return { shown, count: undersea.stats.eyes };
  };

  it("never shows on Title or while no window is open, even forced", () => {
    const { undersea, step } = underseaFrom(1, true);

    run(step, PREWARM, 60);
    undersea.set(60, { part: 3, eyesFor: 0 });
    run(step, 60, 120);
    assert.equal(undersea.stats.eyes, 0);
  });

  it("shows at most one small eye in parts 0–1, in about 5% of games, however long the pages take", () => {
    let games = 0;

    for (let seed = 0; seed < 2000; seed++) {
      const { shown } = playGame(seed * 7919, false, 1 + (seed % 7) * 10);
      const early = shown.filter(({ part }) => part < 2);

      assert.ok(early.length <= 1);
      assert.ok(early.every(({ frames }) => frames.every((eye) => eye.size === "small")));
      // Only in a window of at least 1 s: never in a transition.
      assert.ok(early.every(({ frames }) => frames.length > 50), "a whole eye, not a glimpse");
      games += early.length;
    }

    assert.ok(games > 60 && games < 140, `${games} of 2000`);
  });

  it("shows about 1 window in 6 from part 2, small in part 2 and either size from part 3", () => {
    let shown = 0;
    let windows = 0;
    const sizes = new Set<string>();

    for (let seed = 0; seed < 3000; seed++) {
      const late = playGame(seed, false, 1).shown.filter(({ part }) => part >= 2);

      for (const { part, frames } of late) {
        assert.ok(part >= 3 || frames.every((eye) => eye.size === "small"));
        frames.forEach((eye) => sizes.add(eye.size));
      }

      shown += late.length;
      windows += WINDOWS.filter(([part]) => part >= 2).length;
    }

    assert.deepEqual([...sizes].sort(), ["large", "small"]);
    assert.ok(Math.abs(shown / windows - EYES.chance) < 0.02, `${shown / windows}`);
  });

  it("fills its window, with shorter fades in a transition, in its band, on whole px", () => {
    const { shown, count } = playGame(5, true);

    assert.equal(count, WINDOWS.length, "forced: an eye in every window");

    for (const { frames } of shown) {
      assert.ok(frames.every((eye) => Number.isInteger(eye.x) && Number.isInteger(eye.y)));
      assert.ok(frames.every((eye) => eye.alpha >= 0 && eye.alpha <= EYES.alpha + 1e-9));

      for (const eye of frames) {
        const band = EYES.band[eye.size];

        assert.ok(eye.x >= band.x.min - EYES.drift - 1 && eye.x <= band.x.max + EYES.drift + 1);
        assert.ok(eye.y >= band.y.min - 1 && eye.y <= band.y.max + 1);
      }
    }

    // Frames of 1/60 s: the preamble's eye reaches full alpha after 30 frames and holds 1.5 s; a transition's peaks.
    const preamble = shown[0].frames;
    const transition = shown[1].frames;
    const full = (frames: readonly EyeFrame[]) => frames.filter((eye) => Math.abs(eye.alpha - EYES.alpha) < 1e-6);

    assert.ok(Math.abs(preamble[14].alpha - EYES.alpha / 2) < 0.03, `${preamble[14].alpha}`);
    assert.ok(full(preamble).length >= 89, `${full(preamble).length}`);
    assert.ok(full(transition).length >= 5 && transition.length < 30, `${full(transition).length}`);
  });

  it("closes a shown eye from the alpha it reached when its window closes early, and shows no bubble meanwhile", () => {
    const { undersea, step } = underseaFrom(9, true);

    undersea.set(PREWARM, { part: 2, eyesFor: 1250 });

    const before = undersea.stats.bubbles;

    run(step, PREWARM, PREWARM + 0.25);

    const opening = undersea.eye?.alpha ?? 0;

    assert.ok(opening > 0 && opening < EYES.alpha);
    assert.ok(undersea.stats.bubbles <= before, "no bubble while the eye shows");
    undersea.set(PREWARM + 0.25, { part: 2, eyesFor: 0 });
    run(step, PREWARM + 0.25, PREWARM + 0.5);
    assert.equal(undersea.eye, null, "a 0.25 s fade-in closes in 0.125 s");
  });

  it("clears with the bubbles at the kraken, and opens no window after it", () => {
    const { undersea, step } = underseaFrom(11, true);

    undersea.set(PREWARM, { part: 3, eyesFor: 1500 });
    run(step, PREWARM, PREWARM + 1);
    undersea.set(PREWARM + 1, null);
    run(step, PREWARM + 1, PREWARM + 1.6);
    assert.equal(undersea.eye, null);
    undersea.set(PREWARM + 1.6, { part: 3, eyesFor: 1500 });
    run(step, PREWARM + 1.6, PREWARM + 3);
    assert.deepEqual([undersea.eye, undersea.stats.eyes], [null, 1]);
  });

  it("is the same for the same seed", () => {
    assert.deepEqual(playGame(42, true).shown, playGame(42, true).shown);
    assert.notDeepEqual(playGame(42, true).shown, playGame(43, true).shown);
  });
});
