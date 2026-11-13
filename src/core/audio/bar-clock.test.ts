import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoopAudioAsset } from "../../assets/manifest.ts";
import { barIndexAtOrAfter, barLength, barsFromAnchor, changeBarTime, MIN_LEAD, nextBarTime } from "./bar-clock.ts";

// Built like the manifest's `loop()`: 0.1 s guard, 423360 samples at 44.1 kHz.
const BGM01: LoopAudioAsset = {
  url: "bgm01.m4a",
  offset: 0.1,
  duration: 423360 / 44100,
  loop: true,
  loopStart: 0.1,
  loopEnd: 0.1 + 423360 / 44100,
};
const BAR = barLength(BGM01);

const assertOnGrid = (time: number, anchor: number) => {
  const bars = barsFromAnchor(time, anchor, BAR);

  assert.ok(Math.abs(bars - Math.round(bars)) < 1e-9, `${time} is ${bars} bars from ${anchor}`);
};

describe("nextBarTime", () => {
  it("returns the anchor while it is the lead ahead, else the following boundary; a lead of 0 can return now", () => {
    const CASES: readonly (readonly [name: string, now: number, lead: number | undefined, expected: number])[] = [
      ["anchor far ahead", 0, undefined, 5],
      ["anchor exactly the lead ahead", 5 - MIN_LEAD, undefined, 5],
      ["anchor closer than the lead", 4.95, undefined, 5 + BAR],
      ["now on the anchor", 5, undefined, 5 + BAR],
      ["inside the first bar", 5 + 3, undefined, 5 + BAR],
      ["just inside the second bar", 5 + BAR + 0.01, undefined, 5 + 2 * BAR],
      ["lead 0, now on a boundary", 5 + 2 * BAR, 0, 5 + 2 * BAR],
    ];

    for (const [name, now, lead, expected] of CASES) {
      assert.equal(nextBarTime(now, 5, BAR, lead), expected, name);
    }
  });

  it("never schedules closer than the lead: a boundary exactly on now goes to the next bar", () => {
    const anchor = 0.1;

    for (let n = 1; n < 50; n += 1) {
      const boundary = anchor + n * BAR;

      assert.equal(nextBarTime(boundary, anchor, BAR), anchor + (n + 1) * BAR);
      assert.equal(nextBarTime(boundary - MIN_LEAD, anchor, BAR), boundary);
      assert.equal(nextBarTime(boundary - MIN_LEAD + 1e-4, anchor, BAR), anchor + (n + 1) * BAR);
    }
  });

  it("stays on the grid and at least the lead ahead over a 10-hour session", () => {
    const anchor = 0.12345;

    for (let now = 0; now < 36000; now += 7.77) {
      const next = nextBarTime(now, anchor, BAR);

      assertOnGrid(next, anchor);
      assert.ok(next >= now + MIN_LEAD - 1e-6, `${next} too close to ${now}`);
      assert.ok(next < now + MIN_LEAD + BAR, `${next} more than a bar after ${now}`);
    }
  });

  it("treats a time a float error past a boundary as on it", () => {
    const anchor = 0.1;
    const boundary = anchor + 3750 * BAR; // 10 h

    assert.equal(barIndexAtOrAfter(boundary + 1e-9, anchor, BAR), 3750);
    assert.equal(barIndexAtOrAfter(boundary - 1e-9, anchor, BAR), 3750);
    assert.equal(barIndexAtOrAfter(boundary + 1e-3, anchor, BAR), 3751);
  });
});

describe("changeBarTime", () => {
  it("is the next bar at or after the natural end, keeping the lead", () => {
    const CASES: readonly (readonly [name: string, now: number, naturalEnd: number | undefined, expected: number])[] = [
      ["nothing to finish", 5 + 3, undefined, 5 + BAR],
      ["an end already past", 5 + 3, 5 + 2, 5 + BAR],
      ["an end exactly on a bar", 5 + 1, 5 + 3 * BAR, 5 + 3 * BAR],
      ["an end just ahead", 5 + 2 * BAR - 0.05, 5 + 2 * BAR, 5 + 3 * BAR],
    ];

    for (const [name, now, naturalEnd, expected] of CASES) {
      assert.equal(changeBarTime(now, 5, BAR, naturalEnd), expected, name);
    }
  });

  it("waits for the first bar at or after a one-shot's natural end", () => {
    // bgm02 from bar 1: 20.425 s after the offset ends inside bar 3, so the change lands on bar 4.
    const start = 5 + BAR;

    assert.equal(changeBarTime(start + 1, 5, BAR, start + 20.425), 5 + 4 * BAR);
  });
});
