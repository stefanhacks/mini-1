import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMuted, randomPitch, serializeMuted, sourceParams, statusFor } from "./audio-rules.ts";

describe("sourceParams", () => {
  it("passes a loop's offset and loop points with no duration, and plays a one-shot to the buffer's end", () => {
    const loop = sourceParams({ url: "a", offset: 0.1, duration: 9.6, loop: true, loopStart: 0.1, loopEnd: 9.7 });

    assert.deepEqual(loop, { offset: 0.1, loop: true, loopStart: 0.1, loopEnd: 9.7 }, "loop");
    assert.equal("duration" in loop, false, "loop: no duration");

    const once = sourceParams({ url: "a", offset: 0.1, duration: 2.7, loop: false });

    assert.deepEqual(once, { offset: 0.1, loop: false, loopStart: 0, loopEnd: 0 }, "one-shot");
  });
});

describe("mute persistence", () => {
  it("round-trips, and defaults to unmuted for missing or unknown values", () => {
    for (const muted of [true, false]) {
      assert.equal(parseMuted(serializeMuted(muted)), muted, `round-trip ${muted}`);
    }

    for (const raw of [null, "", "true", "yes", "01", " 1"]) {
      assert.equal(parseMuted(raw), false, `raw ${JSON.stringify(raw)}`);
    }
  });
});

describe("statusFor", () => {
  it("is locked until unlocked, then running or needs-gesture; closed is closed, locked or not", () => {
    const CASES = [
      ["running", false, "locked"],
      ["suspended", false, "locked"],
      ["running", true, "running"],
      ["suspended", true, "needs-gesture"],
      ["interrupted", true, "needs-gesture"],
      ["something-new", true, "needs-gesture"],
      ["closed", true, "closed"],
      ["closed", false, "closed"],
    ] as const;

    for (const [state, unlocked, status] of CASES) {
      assert.equal(statusFor(state, unlocked), status, `${state}, unlocked ${unlocked}`);
    }
  });
});

describe("randomPitch", () => {
  it("maps the RNG's [0, 1) onto 0.95..1.05, clamping an RNG that leaves [0, 1]", () => {
    const CASES: readonly (readonly [draw: number, pitch: number, tolerance: number])[] = [
      [0, 0.95, 0],
      [0.5, 1, 1e-12],
      [0.999999, 1.05, 1e-6],
      [-3, 0.95, 0],
      [7, 1.05, 1e-12],
    ];

    for (const [draw, pitch, tolerance] of CASES) {
      const actual = randomPitch(() => draw);

      assert.ok(Math.abs(actual - pitch) <= tolerance, `draw ${draw}: ${actual}, not ${pitch}`);
    }
  });
});
