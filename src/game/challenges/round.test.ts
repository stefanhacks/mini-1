import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../../core/clock.ts";
import { generateRounds } from "./generate.ts";
import { createRng } from "./rng.ts";
import { Round } from "./round.ts";
import type { ChallengeSpec, RuleContext } from "./rule.ts";
import { TUNING } from "./tuning.ts";

const FRAME_MS = 16;

const setup = (specs: readonly ChallengeSpec[]) => {
  const clock = new GameClock();
  const scope = clock.createScope();
  const log: string[] = [];
  const onDone = () => log.push(`round@${clock.now}`);
  const context: RuleContext = { scope, now: () => clock.now, tuning: TUNING, onDone };
  const round = new Round(specs, context, (index) => log.push(`challenge ${index}@${clock.now}`));

  return { clock, scope, context, round, log };
};

const SPECS: ChallengeSpec[] = [
  { kind: "sequence", directions: ["up", "left"] },
  { kind: "hold", direction: "left" },
  { kind: "many", direction: "down" },
];

// Answers the round's current challenge the way a player would, one frame at a time.
const answer = (clock: GameClock, round: Round) => {
  const spec = round.current?.spec;

  if (spec?.kind === "sequence") {
    for (const dir of spec.directions) {
      round.press(dir);
      clock.tick(FRAME_MS);
      round.release(dir);
      clock.tick(FRAME_MS);
    }
  } else if (spec?.kind === "hold") {
    round.press(spec.direction);

    while (round.current?.spec === spec) {
      clock.tick(FRAME_MS);
    }

    round.release(spec.direction);
  } else if (spec?.kind === "many") {
    for (let i = 0; i < TUNING.manyPresses; i++) {
      round.press(spec.direction);
      clock.tick(FRAME_MS);
      round.release(spec.direction);
      clock.tick(FRAME_MS);
    }
  }
};

describe("Round", () => {
  it("runs its challenges in order and reports each, then the round, once", () => {
    const { clock, round, log } = setup(SPECS);

    assert.equal(round.index, 0);
    assert.deepEqual(round.current?.spec, SPECS[0]);
    round.press("up");
    round.press("left");
    assert.equal(round.index, 1);
    assert.deepEqual(round.current?.spec, SPECS[1]);

    round.press("left");
    clock.tick(3000);
    assert.equal(round.index, 2);
    assert.deepEqual(round.current?.progress, { kind: "many", count: 0, target: 10, windowRemainingMs: 0 });

    for (let i = 0; i < 10; i++) {
      round.press("down");
    }

    assert.equal(round.done, true);
    assert.equal(round.index, 3);
    assert.equal(round.current, undefined);
    assert.deepEqual(log, ["challenge 0@0", "challenge 1@3000", "challenge 2@3000", "round@3000"]);
  });

  it("advances from a Hold's timer inside the tick", () => {
    const { clock, round } = setup([{ kind: "hold", direction: "up" }, { kind: "sequence", directions: ["up"] }]);

    round.press("up");
    clock.tick(3000);
    assert.equal(round.index, 1);
    round.press("up");
    assert.equal(round.done, true);
  });

  it("doesn't let the press that finished a challenge count as the start of the next Hold", () => {
    const { clock, round } = setup([
      { kind: "sequence", directions: ["left"] },
      { kind: "hold", direction: "left" },
    ]);

    round.press("left");
    assert.equal(round.index, 1);
    clock.tick(5000);
    assert.equal(round.current?.progress.kind === "hold" && round.current.progress.held, false);
    round.release("left");
    round.press("left");
    clock.tick(3000);
    assert.equal(round.done, true);
  });

  it("sends the rest of a frame's events to the next challenge, in order", () => {
    const { round } = setup([
      { kind: "sequence", directions: ["up"] },
      { kind: "sequence", directions: ["down", "right"] },
    ]);

    for (const dir of ["up", "down", "right"] as const) {
      round.press(dir);
    }

    assert.equal(round.done, true);
  });

  it("doesn't carry the finishing press into a next Sequence starting with the same arrow", () => {
    const { round } = setup([
      { kind: "sequence", directions: ["up"] },
      { kind: "sequence", directions: ["up", "down"] },
    ]);

    round.press("up");
    assert.equal(round.index, 1);
    assert.deepEqual(round.current?.progress, { kind: "sequence", pointer: 0, length: 2 });
  });

  it("doesn't carry the finishing press into a next Many of the same arrow", () => {
    const { round } = setup([
      { kind: "sequence", directions: ["up"] },
      { kind: "many", direction: "up" },
    ]);

    round.press("up");
    assert.equal(round.index, 1);
    assert.deepEqual(round.current?.progress, { kind: "many", count: 0, target: 10, windowRemainingMs: 0 });
  });

  it("starts a Many after a Many with count 0 and no window", () => {
    const { round } = setup([
      { kind: "many", direction: "up" },
      { kind: "many", direction: "up" },
    ]);

    for (let i = 0; i < 10; i++) {
      round.press("up");
    }

    assert.equal(round.index, 1);
    assert.deepEqual(round.current?.progress, { kind: "many", count: 0, target: 10, windowRemainingMs: 0 });
  });

  it("ignores input once done", () => {
    const { round, log } = setup([{ kind: "sequence", directions: ["up"] }]);

    round.press("up");
    round.press("up");
    round.release("up");
    round.cancelAll();
    assert.deepEqual(log, ["challenge 0@0", "round@0"]);
  });

  it("forwards cancelAll to the current challenge", () => {
    const { clock, round } = setup([{ kind: "hold", direction: "right" }]);

    round.press("right");
    clock.tick(2500);
    round.cancelAll();
    clock.tick(1000);
    assert.equal(round.done, false);
  });

  it("rejects an empty round", () => {
    assert.throws(() => setup([]), RangeError);
  });

  it("plays every generated round of several seeds to the end", () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      for (const specs of generateRounds(createRng(seed), TUNING)) {
        const { clock, round, log } = setup(specs);
        let guard = 0;

        while (!round.done && guard++ < specs.length) {
          answer(clock, round);
        }

        assert.equal(round.done, true, `seed ${seed}`);
        assert.equal(log.filter((entry) => entry.startsWith("round@")).length, 1);
      }
    }
  });
});

describe("Round.resetCurrent (the pause's resume)", () => {
  it("starts a Sequence over: the pointer goes back to 0 and its timeout is cancelled", () => {
    const { clock, scope, round } = setup([{ kind: "sequence", directions: ["up", "left", "down"] }]);

    round.press("up");
    round.press("left");
    round.resetCurrent();
    assert.deepEqual(round.current?.progress, { kind: "sequence", pointer: 0, length: 3 });
    assert.equal(clock.pendingTimers, 0);

    // A fresh attempt still completes.
    round.press("up");
    round.press("left");
    round.press("down");
    assert.equal(round.done, true);
    scope.dispose();
  });

  it("lets a Hold go: it doesn't complete on its own, and a new press starts it over", () => {
    const { clock, round } = setup([{ kind: "hold", direction: "up" }]);

    round.press("up");
    clock.tick(TUNING.holdMs - 1);
    round.resetCurrent();
    assert.deepEqual(round.current?.progress, { kind: "hold", held: false, fraction: 0 });
    clock.tick(TUNING.holdMs * 2);
    assert.equal(round.done, false);

    round.press("up");
    clock.tick(TUNING.holdMs);
    assert.equal(round.done, true);
  });

  it("closes a Many's window: the count goes back to 0 and the next press opens a new window", () => {
    const { clock, round } = setup([{ kind: "many", direction: "up" }]);

    for (let i = 0; i < TUNING.manyPresses - 1; i++) {
      round.press("up");
    }

    round.resetCurrent();
    assert.deepEqual(round.current?.progress, {
      kind: "many",
      count: 0,
      target: TUNING.manyPresses,
      windowRemainingMs: 0,
    });
    assert.equal(clock.pendingTimers, 0);
    round.press("up");
    assert.equal(round.done, false);
    assert.deepEqual(round.current?.progress, {
      kind: "many",
      count: 1,
      target: TUNING.manyPresses,
      windowRemainingMs: TUNING.manyWindowMs,
    });
  });

  it("does nothing once the round is done", () => {
    const { round } = setup([{ kind: "sequence", directions: ["up"] }]);

    round.press("up");
    round.resetCurrent();
    assert.equal(round.done, true);
    assert.equal(round.index, 1);
  });
});
