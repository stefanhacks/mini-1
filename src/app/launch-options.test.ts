import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedFromString } from "../game/challenges/rng.ts";
import { createSeeder, createTimescale, readLaunchOptions } from "./launch-options.ts";

describe("readLaunchOptions", () => {
  it("reads ?timescale only with ?debug, and a missing or unusable one as 1", () => {
    const CASES: readonly (readonly [search: string, debug: boolean, timescale: number])[] = [
      ["?debug&timescale=4", true, 4],
      ["?timescale=4", false, 1],
      ["?timescale=0.5", true, 0.5],
      ...["", "?timescale=", "?timescale=0", "?timescale=-2", "?timescale=abc", "?timescale=Infinity"].map(
        (search) => [search, true, 1] as const,
      ),
    ];

    for (const [search, debug, timescale] of CASES) {
      assert.equal(readLaunchOptions(search, debug).timescale, timescale, `${JSON.stringify(search)}, debug ${debug}`);
    }
  });

  it("reads ?seed with or without ?debug, and null without it", () => {
    assert.equal(readLaunchOptions("?seed=2018", false).seed, "2018");
    assert.equal(readLaunchOptions("?debug&seed=abc", true).seed, "abc");
    assert.equal(readLaunchOptions("?debug", true).seed, null);
  });

  it("reads ?eyes=always only with ?debug", () => {
    assert.equal(readLaunchOptions("?debug&eyes=always", true).eyesAlways, true);
    assert.equal(readLaunchOptions("?eyes=always", false).eyesAlways, false);
    assert.equal(readLaunchOptions("?debug&eyes=never", true).eyesAlways, false);
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
