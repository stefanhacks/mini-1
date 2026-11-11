import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createErrorSink, createHaltingGuard } from "./halting-guard.ts";

describe("createErrorSink", () => {
  it("keeps the first error and reports every one, in order", () => {
    const reported: unknown[] = [];
    const sink = createErrorSink((error) => reported.push(error));
    const first = new Error("first");
    const second = new Error("second");

    assert.equal(sink.error, undefined);
    sink.report(first);
    sink.report(second);

    assert.equal(sink.error, first);
    assert.deepEqual(reported, [first, second]);
  });
});

describe("createHaltingGuard", () => {
  it("passes the arguments through while nothing threw", () => {
    const seen: number[] = [];
    const guarded = createHaltingGuard((value: number) => seen.push(value), () => assert.fail("halted"));

    guarded(1);
    guarded(2);

    assert.deepEqual(seen, [1, 2]);
  });

  it("halts on the first throw: onHalt gets the error once, and later calls do nothing", () => {
    const halts: unknown[] = [];
    const failure = new Error("boom");
    let calls = 0;
    const guarded = createHaltingGuard(() => {
      calls += 1;
      throw failure;
    }, (error) => halts.push(error));

    guarded();
    guarded();

    assert.equal(calls, 1);
    assert.deepEqual(halts, [failure]);
  });

  it("guards are independent, and share a sink's first error", () => {
    const sink = createErrorSink(() => undefined);
    const render = createHaltingGuard(() => {
      throw new Error("render");
    }, sink.report);
    let logicRuns = 0;
    let logicFails = false;
    const logic = createHaltingGuard(() => {
      logicRuns += 1;

      if (logicFails) {
        throw new Error("logic");
      }
    }, sink.report);

    render();
    logic();
    logicFails = true;
    logic();
    logic();

    assert.equal(logicRuns, 2);
    assert.equal((sink.error as Error).message, "render");
  });
});
