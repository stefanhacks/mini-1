import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedFromString } from "../game/challenges/rng.ts";
import { createSeeder, createTimescale, isValidTimescale, readLaunchOptions } from "./launch-options.ts";

describe("readLaunchOptions", () => {
  it("reads ?timescale only with ?debug", () => {
    assert.equal(readLaunchOptions("?debug&timescale=4", true).timescale, 4);
    assert.equal(readLaunchOptions("?timescale=4", false).timescale, 1);
  });

  it("reads a missing or unusable time scale as 1", () => {
    const searches = ["", "?timescale=", "?timescale=0", "?timescale=-2", "?timescale=abc", "?timescale=Infinity"];

    for (const search of searches) {
      assert.equal(readLaunchOptions(search, true).timescale, 1, search);
    }

    assert.equal(readLaunchOptions("?timescale=0.5", true).timescale, 0.5);
  });

  it("reads ?seed with or without ?debug, and null without it", () => {
    assert.equal(readLaunchOptions("?seed=2018", false).seed, "2018");
    assert.equal(readLaunchOptions("?debug&seed=abc", true).seed, "abc");
    assert.equal(readLaunchOptions("?debug", true).seed, null);
  });
});

describe("createTimescale", () => {
  it("changes only when adjustable, and only to valid values", () => {
    const fixed = createTimescale(1, false);
    const adjustable = createTimescale(2, true);

    fixed.set(8);
    adjustable.set(8);
    adjustable.set(0);
    adjustable.set(Number.NaN);

    assert.equal(fixed.value, 1);
    assert.equal(adjustable.value, 8);
  });

  it("isValidTimescale: finite and positive", () => {
    assert.deepEqual(
      [1, 0.25, 0, -1, Infinity, Number.NaN].map(isValidTimescale),
      [true, true, false, false, false, false],
    );
  });
});

describe("createSeeder", () => {
  it("with ?seed, game n plays seed + n − 1 (as uint32)", () => {
    const next = createSeeder("2018", () => assert.fail("random"));
    const base = seedFromString("2018");

    assert.deepEqual([next(), next(), next()], [base, (base + 1) >>> 0, (base + 2) >>> 0]);
  });

  it("wraps around at 2^32", () => {
    const seed = String(0xffffffff);
    const next = createSeeder(seed);
    const base = seedFromString(seed);

    next();
    assert.equal(next(), (base + 1) >>> 0);
  });

  it("without ?seed, every game draws a random seed", () => {
    let draws = 0;
    const next = createSeeder(null, () => ++draws * 10);

    assert.deepEqual([next(), next()], [10, 20]);
  });
});
