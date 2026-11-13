import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followMotion, FULL_MOTION, REDUCED_MOTION, type MotionPolicy } from "./motion.ts";

describe("followMotion", () => {
  it("applies the policy on the first step, then only when the setting changes; reduced slows (not stills)", () => {
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
    assert.ok(REDUCED_MOTION.ambientSpeed > 0 && REDUCED_MOTION.ambientSpeed < 1, "reduced ambient speed");
  });
});
