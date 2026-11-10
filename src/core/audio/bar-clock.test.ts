import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoopAudioAsset } from "../../assets/manifest.ts";
import { barIndexAtOrAfter, barLength, barsFromAnchor, MIN_LEAD, nextBarTime } from "./bar-clock.ts";

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

describe("barLength", () => {
  it("is BGM01's loop length, 9.6 s", () => {
    assert.ok(Math.abs(BAR - 9.6) < 1e-12);
  });
});

describe("nextBarTime", () => {
  it("returns the anchor while it is at least the lead ahead", () => {
    assert.equal(nextBarTime(0, 5, BAR), 5);
    assert.equal(nextBarTime(5 - MIN_LEAD, 5, BAR), 5);
  });

  it("goes to the next bar when the anchor is closer than the lead", () => {
    assert.equal(nextBarTime(4.95, 5, BAR), 5 + BAR);
    assert.equal(nextBarTime(5, 5, BAR), 5 + BAR);
  });

  it("returns the following boundary inside a bar", () => {
    assert.equal(nextBarTime(5 + 3, 5, BAR), 5 + BAR);
    assert.equal(nextBarTime(5 + BAR + 0.01, 5, BAR), 5 + 2 * BAR);
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

  it("accepts a lead of 0 and then returns now when now is on a boundary", () => {
    assert.equal(nextBarTime(5 + 2 * BAR, 5, BAR, 0), 5 + 2 * BAR);
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
