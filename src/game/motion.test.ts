import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followMotion, FULL_MOTION, motionPolicy, REDUCED_MOTION, type MotionPolicy } from "./motion.ts";

describe("motionPolicy", () => {
  it("keeps the original's motion without reduced motion, and slows the ambient loops (not stilled) with it", () => {
    assert.equal(motionPolicy(false), FULL_MOTION);
    assert.equal(motionPolicy(true), REDUCED_MOTION);
    assert.ok(REDUCED_MOTION.ambientSpeed > 0 && REDUCED_MOTION.ambientSpeed < 1);
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
