import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followMotion, FULL_MOTION, motionPolicy, REDUCED_MOTION, type MotionPolicy } from "./motion.ts";

describe("motionPolicy", () => {
  it("keeps the original's motion without reduced motion", () => {
    assert.equal(motionPolicy(false), FULL_MOTION);
    assert.deepEqual(FULL_MOTION, { ambientSpeed: 1, holdPulses: false, rainRate: 1, weatherSpeed: 1 });
  });

  it("slows the ambient loops (not stilled), holds the pulses and halves the rain, at the same speed", () => {
    assert.equal(motionPolicy(true), REDUCED_MOTION);
    assert.deepEqual(REDUCED_MOTION, { ambientSpeed: 0.5, holdPulses: true, rainRate: 0.5, weatherSpeed: 1 });
    assert.ok(REDUCED_MOTION.ambientSpeed > 0 && REDUCED_MOTION.ambientSpeed < 1);
    assert.ok(REDUCED_MOTION.rainRate > 0 && REDUCED_MOTION.rainRate < 1);
  });
});

describe("followMotion", () => {
  it("applies the policy on the first step, then only when the setting changes", () => {
    let reduced = false;
    const applied: MotionPolicy[] = [];
    const step = followMotion(() => reduced, (policy) => applied.push(policy));

    step();
    step();
    assert.deepEqual(applied, [FULL_MOTION]);
    reduced = true;
    step();
    step();
    reduced = false;
    step();
    assert.deepEqual(applied, [FULL_MOTION, REDUCED_MOTION, FULL_MOTION]);
  });
});
