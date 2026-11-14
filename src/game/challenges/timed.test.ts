import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../../core/clock.ts";
import type { ChallengeSpec, RuleContext } from "./rule.ts";
import { TimedChallenge } from "./timed.ts";
import { TUNING } from "./tuning.ts";

const setup = (spec: ChallengeSpec, limitMs: number) => {
  const clock = new GameClock();
  const scope = clock.createScope();
  const events: string[] = [];
  const context: RuleContext = {
    scope,
    now: () => clock.now,
    tuning: TUNING,
    onDone: () => events.push(`done ${clock.now}`),
  };
  const timed = new TimedChallenge(spec, context, limitMs, () => events.push(`timeout ${clock.now}`));

  return { clock, timed, events };
};

const SEQUENCE: ChallengeSpec = { kind: "sequence", directions: ["up", "left", "up"] };

describe("TimedChallenge", () => {
  it("completes in time: onDone once, no timeout, the remaining time frozen", () => {
    const { clock, timed, events } = setup(SEQUENCE, 2000);

    clock.tick(500);
    timed.press("up");
    timed.press("left");
    timed.press("up");
    clock.tick(5000);

    assert.deepEqual(events, ["done 500"]);
    assert.equal(timed.done, true);
    assert.equal(timed.timedOut, false);
    assert.equal(timed.remainingMs, 1500);
    assert.equal(clock.pendingTimers, 0);
  });

  it("times out at the limit, and ignores input after it", () => {
    const { clock, timed, events } = setup(SEQUENCE, 2000);

    timed.press("up");
    clock.tick(1999);
    assert.equal(timed.remainingMs, 1);
    clock.tick(1);
    // A press drained in the frame that reached the limit is late.
    timed.press("left");
    timed.press("up");

    assert.deepEqual(events, ["timeout 2000"]);
    assert.equal(timed.done, false);
    assert.equal(timed.timedOut, true);
    assert.equal(timed.remainingMs, 0);
    assert.deepEqual(timed.progress, { kind: "sequence", pointer: 0, length: 3 });
  });

  it("lets a Hold that completes at the limit's moment count as in time", () => {
    const { clock, timed, events } = setup({ kind: "hold", direction: "up" }, TUNING.holdMs);

    timed.press("up");
    clock.tick(TUNING.holdMs);

    assert.deepEqual(events, [`done ${TUNING.holdMs}`]);
    assert.equal(clock.pendingTimers, 0);
  });

  it("drops a running hold on timeout, so it never completes afterwards", () => {
    const { clock, timed, events } = setup({ kind: "hold", direction: "up" }, 4000);

    clock.tick(2000);
    timed.press("up");
    clock.tick(5000);

    assert.deepEqual(events, ["timeout 4000"]);
    assert.equal(clock.pendingTimers, 0);
  });

  it("waits while the clock is paused", () => {
    const { clock, timed, events } = setup({ kind: "many", direction: "up" }, 1000);

    clock.tick(400);
    clock.paused = true;
    clock.tick(5000);
    clock.paused = false;
    assert.equal(timed.remainingMs, 600);
    clock.tick(600);

    assert.deepEqual(events, ["timeout 1000"]);
  });

  it("restarts the limit with the progress on reset (the pause's resume)", () => {
    const { clock, timed, events } = setup(SEQUENCE, 1000);

    timed.press("up");
    clock.tick(800);
    timed.reset();
    assert.deepEqual(timed.progress, { kind: "sequence", pointer: 0, length: 3 });
    assert.equal(timed.remainingMs, 1000);
    clock.tick(999);
    assert.deepEqual(events, []);
    clock.tick(1);

    assert.deepEqual(events, ["timeout 1800"]);
  });

  it("rejects a limit that isn't positive", () => {
    const clock = new GameClock();
    const context: RuleContext = { scope: clock.createScope(), now: () => clock.now, tuning: TUNING };

    assert.throws(() => new TimedChallenge(SEQUENCE, context, 0, () => {}), RangeError);
  });
});
