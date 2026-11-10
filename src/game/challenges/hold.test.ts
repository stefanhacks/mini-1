import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../../core/clock.ts";
import { HoldRule } from "./hold.ts";
import type { RuleContext } from "./rule.ts";
import { TUNING } from "./tuning.ts";

const setup = () => {
  const clock = new GameClock();
  const scope = clock.createScope();
  const doneAt: number[] = [];
  const context: RuleContext = { scope, now: () => clock.now, tuning: TUNING, onDone: () => doneAt.push(clock.now) };
  const rule = new HoldRule("up", context);

  return { clock, scope, rule, doneAt };
};

describe("HoldRule", () => {
  it("completes after 3 s held, from the timer inside the tick, with no further input", () => {
    const { clock, rule, doneAt } = setup();

    clock.tick(250);
    rule.press("up");
    clock.tick(2999);
    assert.equal(rule.done, false);
    clock.tick(10);

    assert.equal(rule.done, true);
    assert.deepEqual(doneAt, [3250]);
    assert.deepEqual(rule.progress, { kind: "hold", held: false, fraction: 1 });
  });

  it("reports held and a fraction from 0 to 1", () => {
    const { clock, rule } = setup();

    assert.deepEqual(rule.progress, { kind: "hold", held: false, fraction: 0 });
    rule.press("up");
    assert.deepEqual(rule.progress, { kind: "hold", held: true, fraction: 0 });
    clock.tick(1500);
    assert.deepEqual(rule.progress, { kind: "hold", held: true, fraction: 0.5 });
  });

  it("resets on release, and a new press needs the full 3 s again", () => {
    const { clock, rule } = setup();

    rule.press("up");
    clock.tick(2999);
    rule.release("up");
    assert.deepEqual(rule.progress, { kind: "hold", held: false, fraction: 0 });
    clock.tick(100);
    rule.press("up");
    clock.tick(2999);
    assert.equal(rule.done, false);
    clock.tick(1);
    assert.equal(rule.done, true);
  });

  it("is already done when a release arrives at exactly 3 s", () => {
    const { clock, rule, doneAt } = setup();

    rule.press("up");
    clock.tick(3000);
    rule.release("up");
    assert.equal(rule.done, true);
    assert.deepEqual(doneAt, [3000]);
  });

  it("resets on cancelAll mid-hold", () => {
    const { clock, rule } = setup();

    rule.press("up");
    clock.tick(2000);
    rule.cancelAll();
    clock.tick(5000);
    assert.equal(rule.done, false);
    assert.equal(rule.progress.held, false);
  });

  it("ignores other directions, pressed or released", () => {
    const { clock, rule } = setup();

    rule.press("down");
    clock.tick(5000);
    assert.equal(rule.progress.held, false);

    rule.press("up");
    clock.tick(1000);
    rule.press("left");
    rule.release("left");
    rule.release("down");
    clock.tick(2000);
    assert.equal(rule.done, true);
  });

  it("doesn't count a direction held since before the challenge: it needs a press after the start", () => {
    const { clock, rule } = setup();

    // The key went down before the rule existed; only its release reaches the rule.
    clock.tick(4000);
    assert.equal(rule.progress.held, false);
    rule.release("up");
    rule.press("up");
    clock.tick(3000);
    assert.equal(rule.done, true);
  });

  it("keeps the running hold on a second press of the held direction (dual pads)", () => {
    const { clock, rule } = setup();

    rule.press("up");
    clock.tick(2000);
    rule.press("up");
    clock.tick(1000);
    assert.equal(rule.done, true);
  });

  it("restarts from that frame on a release and a press in the same tick", () => {
    const { clock, rule } = setup();

    rule.press("up");
    clock.tick(2000);
    rule.release("up");
    rule.press("up");
    clock.tick(2999);
    assert.equal(rule.done, false);
    clock.tick(1);
    assert.equal(rule.done, true);
  });

  it("ignores a release or cancelAll with nothing held", () => {
    const { clock, rule } = setup();

    rule.release("up");
    rule.cancelAll();
    rule.press("up");
    clock.tick(3000);
    assert.equal(rule.done, true);
  });

  it("ignores everything after completion and calls onDone once", () => {
    const { clock, rule, doneAt } = setup();

    rule.press("up");
    clock.tick(3000);
    rule.release("up");
    rule.press("up");
    rule.cancelAll();
    clock.tick(5000);
    assert.deepEqual(doneAt, [3000]);
    assert.deepEqual(rule.progress, { kind: "hold", held: false, fraction: 1 });
  });

  it("freezes while the clock is paused", () => {
    const { clock, rule } = setup();

    rule.press("up");
    clock.tick(1000);
    clock.paused = true;
    clock.tick(10000);
    assert.deepEqual(rule.progress, { kind: "hold", held: true, fraction: 1 / 3 });
    clock.paused = false;
    clock.tick(1999);
    assert.equal(rule.done, false);
    clock.tick(1);
    assert.equal(rule.done, true);
  });

  it("never completes once its scope is disposed", () => {
    const { clock, scope, rule, doneAt } = setup();

    rule.press("up");
    scope.dispose();
    clock.tick(10000);
    assert.equal(rule.done, false);
    assert.deepEqual(doneAt, []);
  });
});
