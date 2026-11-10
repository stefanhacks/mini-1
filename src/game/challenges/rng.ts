// Seedable pseudo-random numbers for challenge generation. Pure TypeScript with no Pixi import.
// Game code takes an Rng and never calls Math.random directly, so a `?seed=` reproduces a whole game.

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, maxExclusive). Throws a RangeError unless `maxExclusive` is an integer >= 1. */
  nextInt(maxExclusive: number): number;
}

const UINT32 = 2 ** 32;

/** Mulberry32: a 32-bit state, fast, and good enough for picking arrows. Any number seeds it (taken modulo 2^32). */
export const createRng = (seed: number): Rng => {
  let state = toUint32(seed);

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };

  return {
    next,
    nextInt: (maxExclusive) => {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new RangeError(`nextInt() needs an integer >= 1, got ${maxExclusive}`);
      }

      return Math.floor(next() * maxExclusive);
    },
  };
};

/**
 * The seed a `?seed=` value names. A whole decimal number from 0 to 2^32 − 1 is used as is, so a seed shown in a bug
 * report reads back the same (leading zeros parse too: "0123" is 123); any other string is hashed (FNV-1a, 32 bits,
 * over UTF-16 code units).
 */
export const seedFromString = (text: string): number => {
  if (/^\d{1,10}$/.test(text) && Number(text) < UINT32) {
    return Number(text);
  }

  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }

  return hash;
};

/** A fresh seed for a new game (e.g. replay) when no `?seed=` is given. The only place Math.random is used. */
export const randomSeed = (): number => Math.floor(Math.random() * UINT32);

const toUint32 = (value: number): number => (Number.isFinite(value) ? Math.trunc(value) % UINT32 >>> 0 : 0);
