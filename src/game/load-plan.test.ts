import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLoadPlan, type LoadPart } from "./load-plan.ts";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

// A part the test drives: each `load` call can report progress, then succeed or fail.
const fakePart = (weight: number) => {
  let progress: (fraction: number) => void = () => undefined;
  let finish: (error?: Error) => void = () => undefined;
  let calls = 0;
  const part: LoadPart = {
    weight,
    load: (onProgress) => {
      calls += 1;
      progress = onProgress;

      return new Promise<void>((resolve, reject) => {
        finish = (error) => (error === undefined ? resolve() : reject(error));
      });
    },
  };

  return {
    part,
    progress: (fraction: number) => progress(fraction),
    finish: (error?: Error) => finish(error),
    get calls() {
      return calls;
    },
  };
};

describe("createLoadPlan", () => {
  it("reports weighted progress that never goes down, and resolves when every part is loaded", async () => {
    const a = fakePart(1);
    const b = fakePart(3);
    const plan = createLoadPlan({ a: a.part, b: b.part });
    const seen: number[] = [];
    const done = plan.load((fraction) => seen.push(fraction));

    a.progress(0.5);
    b.progress(0.5);
    b.progress(0.25);
    a.finish();
    await settle();
    assert.equal(plan.isLoaded("a"), true);
    assert.equal(plan.isLoaded("b"), false);
    b.finish();
    await done;

    assert.deepEqual(seen, [0, 0.125, 0.5, 0.625, 1]);
  });

  it("rejects after every part settled, and retries only the failed ones", async () => {
    const a = fakePart(1);
    const b = fakePart(1);
    const plan = createLoadPlan({ a: a.part, b: b.part });
    const first = plan.load();

    b.finish(new Error("b failed"));
    await settle();
    a.finish();
    await assert.rejects(first, /b failed/);

    const seen: number[] = [];
    const second = plan.load((fraction) => seen.push(fraction));

    assert.equal(a.calls, 1);
    assert.equal(b.calls, 2);
    b.finish();
    await second;
    assert.deepEqual(seen, [0.5, 1]);
  });

  it("shares one run between concurrent calls", async () => {
    const a = fakePart(1);
    const plan = createLoadPlan({ a: a.part });
    const first = plan.load();
    const second = plan.load();

    assert.equal(first, second);
    assert.equal(a.calls, 1);
    a.finish();
    await first;
    await plan.load();
    assert.equal(a.calls, 1);
  });

  it("refuses a part without a positive weight", () => {
    assert.throws(() => createLoadPlan({ a: { weight: 0, load: () => Promise.resolve() } }), RangeError);
  });
});
