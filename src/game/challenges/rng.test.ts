import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng, randomSeed, seedFromString } from "./rng.ts";

const draw = (seed: number, count: number, max: number) => {
  const rng = createRng(seed);

  return Array.from({ length: count }, () => rng.nextInt(max));
};

describe("createRng", () => {
  it("is deterministic per seed", () => {
    assert.deepEqual(draw(42, 100, 1000), draw(42, 100, 1000));
  });

  it("gives different streams for different seeds", () => {
    assert.notDeepEqual(draw(1, 20, 1000), draw(2, 20, 1000));
  });

  it("matches the widely used reference mulberry32", () => {
    // The usual one-liner, transcribed: its state is not kept in 32 bits, which must not matter.
    const reference = (seed: number) => {
      let a = seed;

      return () => {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    for (const seed of [0, 1, 42, 123456789]) {
      const rng = createRng(seed);
      const expected = reference(seed);

      for (let i = 0; i < 1000; i++) {
        assert.equal(rng.next(), expected());
      }
    }
  });

  it("takes any number as a seed, modulo 2^32", () => {
    assert.deepEqual(draw(-1, 10, 100), draw(2 ** 32 - 1, 10, 100));
    assert.deepEqual(draw(5.9, 10, 100), draw(5, 10, 100));
    assert.deepEqual(draw(2 ** 32 + 7, 10, 100), draw(7, 10, 100));
    assert.deepEqual(draw(NaN, 10, 100), draw(0, 10, 100));
  });

  it("keeps next() in [0, 1) and nextInt() in [0, max)", () => {
    const rng = createRng(7);

    for (let i = 0; i < 10000; i++) {
      const value = rng.next();
      assert.ok(value >= 0 && value < 1);

      const max = 1 + (i % 9);
      const int = rng.nextInt(max);
      assert.ok(Number.isInteger(int) && int >= 0 && int < max, `${int} out of [0, ${max})`);
    }
  });

  it("throws on a max that isn't an integer >= 1", () => {
    const rng = createRng(1);

    for (const max of [0, -1, 1.5, NaN, Infinity]) {
      assert.throws(() => rng.nextInt(max), RangeError);
    }
  });

  it("is roughly uniform", () => {
    for (const max of [4, 7]) {
      const counts = new Array<number>(max).fill(0);
      const total = 70000;

      for (const value of draw(123, total, max)) {
        counts[value] = (counts[value] ?? 0) + 1;
      }

      const expected = total / max;

      for (const count of counts) {
        // About 5 standard deviations at these sizes.
        assert.ok(Math.abs(count - expected) < expected * 0.05, `${count} vs ${expected}`);
      }
    }
  });
});

describe("seedFromString", () => {
  it("reads whole decimal numbers below 2^32 as is", () => {
    assert.equal(seedFromString("0"), 0);
    assert.equal(seedFromString("42"), 42);
    assert.equal(seedFromString("4294967295"), 4294967295);
    assert.equal(seedFromString("0123"), 123);
  });

  it("hashes anything else to a deterministic uint32", () => {
    for (const text of ["", "abc", "4294967296", "-1", "1.5", " 42", "olá"]) {
      const seed = seedFromString(text);

      assert.equal(seed, seedFromString(text));
      assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
    }

    assert.notEqual(seedFromString("abc"), seedFromString("abd"));
    assert.equal(seedFromString(""), 0x811c9dc5);
  });
});

describe("randomSeed", () => {
  it("gives a uint32", () => {
    const seed = randomSeed();

    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
  });
});
