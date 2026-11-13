// What the page URL sets for a run: `?seed=` and, with `?debug`, `?timescale=` and `?eyes=always`. Pure TypeScript.
// Written by Claude Code.
import { randomSeed, seedFromString } from "../game/challenges/rng.ts";

export interface LaunchOptions {
  /** Game-time multiplier: `?timescale=N` with `?debug`, 1 otherwise. */
  readonly timescale: number;
  /** The `?seed=` value, or null for random seeds. */
  readonly seed: string | null;
  /** `?debug&eyes=always`: an eye wherever one may show (scene/particles), to review them without waiting. */
  readonly eyesAlways: boolean;
}

/** Whether `value` can be a time scale: finite and positive. */
export const isValidTimescale = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Reads the options from `search` (`window.location.search`). `?debug&timescale=N` multiplies game time, so e2e
 * playthroughs don't wait out the original's ~25 s of pauses. Read only with `?debug`: the one test hook (m2-plan,
 * deliverable 6). A missing or unusable value reads as 1.
 */
export const readLaunchOptions = (search: string, debug: boolean): LaunchOptions => {
  const params = new URLSearchParams(search);
  const timescale = Number(params.get("timescale") ?? "1");

  return {
    timescale: debug && isValidTimescale(timescale) ? timescale : 1,
    seed: params.get("seed"),
    eyesAlways: debug && params.get("eyes") === "always",
  };
};

export interface Timescale {
  readonly value: number;
  /** Changes the time scale to a valid `next`; does nothing unless `adjustable` (`?debug`). */
  readonly set: (next: number) => void;
}

export const createTimescale = (initial: number, adjustable: boolean): Timescale => {
  let value = initial;

  return {
    get value() {
      return value;
    },
    set: (next) => {
      if (adjustable && isValidTimescale(next)) {
        value = next;
      }
    },
  };
};

/**
 * The seed of each new game. `?seed=` makes games reproducible (tests, bug reports): game n plays seed + n − 1, so a
 * replay is still a new game. Without it every game gets a random seed.
 */
export const createSeeder = (seed: string | null, random: () => number = randomSeed) => {
  let gamesSeeded = 0;

  return () => {
    gamesSeeded += 1;

    return seed === null ? random() : (seedFromString(seed) + gamesSeeded - 1) >>> 0;
  };
};
