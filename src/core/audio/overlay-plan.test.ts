import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_LEAD } from "./bar-clock.ts";
import { overlayForPart, planPerBarStarts } from "./overlay-plan.ts";

const BAR = 9.6;

describe("overlayForPart", () => {
  it("maps story parts 0..3 to the original overlay sequence", () => {
    assert.deepEqual(overlayForPart(0), { key: "overlayPhase02", mode: "loop" });
    assert.deepEqual(overlayForPart(1), { key: "overlayPhase03", mode: "loop" });
    assert.deepEqual(overlayForPart(2), { key: "overlayPhase04", mode: "per-bar" });
    assert.deepEqual(overlayForPart(3), { key: "bgm02", mode: "once" });
  });

  it("maps null to no overlay", () => {
    assert.equal(overlayForPart(null), null);
  });

  it("throws on parts that don't exist", () => {
    for (const part of [-1, 4, 1.5, NaN]) {
      assert.throws(() => overlayForPart(part), RangeError);
    }
  });
});

describe("planPerBarStarts", () => {
  const base = { anchor: 1, bar: BAR, horizon: BAR + MIN_LEAD, stopAt: Infinity };

  it("schedules the first bar at once, even when it is almost a bar plus the lead away", () => {
    const now = 1 + BAR - MIN_LEAD + 0.001; // the next usable boundary is 1 + 2 * BAR
    const plan = planPerBarStarts({ ...base, now, nextIndex: 2 });

    assert.deepEqual(plan.starts, [1 + 2 * BAR]);
    assert.equal(plan.nextIndex, 3);
  });

  it("returns nothing new when called again before the horizon moves", () => {
    const first = planPerBarStarts({ ...base, now: 2, nextIndex: 1 });
    const again = planPerBarStarts({ ...base, now: 2.016, nextIndex: first.nextIndex });

    assert.deepEqual(first.starts, [1 + BAR]);
    assert.deepEqual(again.starts, []);
    assert.equal(again.nextIndex, first.nextIndex);
  });

  it("keeps restarting bar after bar when called from each voice's end (about 7.2 s into its bar)", () => {
    let nextIndex = 1;
    const started: number[] = [];
    let plan = planPerBarStarts({ ...base, now: 1 + BAR - 1, nextIndex });

    started.push(...plan.starts);
    nextIndex = plan.nextIndex;

    for (let i = 0; i < 20; i += 1) {
      const endedAt = (started.at(-1) ?? 0) + 7.2;

      plan = planPerBarStarts({ ...base, now: endedAt, nextIndex });
      assert.equal(plan.starts.length, 1, `exactly one restart after the voice at ${started.at(-1)}`);
      started.push(...plan.starts);
      nextIndex = plan.nextIndex;
    }

    started.forEach((time, i) => assert.ok(Math.abs(time - (1 + (i + 1) * BAR)) < 1e-9));
  });

  it("with a per-frame tick, keeps at most the next bar scheduled and never a bar twice", () => {
    let nextIndex = 1;
    const started: number[] = [];

    for (let now = 1; now < 1 + 10 * BAR; now += 1 / 60) {
      const plan = planPerBarStarts({ ...base, now, nextIndex });

      started.push(...plan.starts);
      nextIndex = plan.nextIndex;
      assert.ok(started.filter((time) => time > now).length <= 2);
    }

    assert.deepEqual(started.map((time) => Math.round((time - 1) / BAR)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("skips bars that are already too close after a stall instead of starting them late", () => {
    const now = 1 + 3 * BAR - 0.05; // bar 3 is 50 ms away, under the lead
    const plan = planPerBarStarts({ ...base, now, nextIndex: 2 });

    assert.deepEqual(plan.starts, [1 + 4 * BAR]);
    assert.equal(plan.nextIndex, 5);
  });

  it("schedules nothing at or after the track's stop time", () => {
    const plan = planPerBarStarts({ ...base, now: 2, nextIndex: 1, horizon: 5 * BAR, stopAt: 1 + 3 * BAR });

    assert.deepEqual(plan.starts, [1 + BAR, 1 + 2 * BAR]);
  });
});
