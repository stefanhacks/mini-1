import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../../core/clock.ts";
import { generateRounds } from "./generate.ts";
import { HoldRule } from "./hold.ts";
import { ManyRule } from "./many.ts";
import { createRng } from "./rng.ts";
import { createRule, Round } from "./round.ts";
import type { ChallengeSpec, RuleContext } from "./rule.ts";
import { SequenceRule } from "./sequence.ts";
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

describe("createRule", () => {
  it("builds the rule for each kind", () => {
    const { context } = setup(SPECS);

    assert.ok(createRule({ kind: "sequence", directions: ["up"] }, context) instanceof SequenceRule);
    assert.ok(createRule({ kind: "hold", direction: "up" }, context) instanceof HoldRule);
    assert.ok(createRule({ kind: "many", direction: "up" }, context) instanceof ManyRule);
  });
});

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
