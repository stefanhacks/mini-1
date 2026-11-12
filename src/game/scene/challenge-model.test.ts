import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChallengeProgress } from "../challenges/rule.ts";
import { cursorKey, directionsOf, progressKey } from "./challenge-model.ts";

const sequence = (pointer: number): ChallengeProgress => ({ kind: "sequence", pointer, length: 3 });
const hold = (fraction: number): ChallengeProgress => ({ kind: "hold", held: fraction > 0, fraction });
const many = (count: number): ChallengeProgress => ({ kind: "many", count, target: 5, windowRemainingMs: 0 });

describe("directionsOf", () => {
  it("shows no arrows without a challenge", () => {
    assert.deepEqual(directionsOf(null), []);
  });

  it("shows a sequence's directions, in order", () => {
    const directions = ["up", "left", "down"] as const;

    assert.equal(directionsOf({ kind: "sequence", directions }), directions);
  });

  it("shows the one arrow of a hold or many", () => {
    assert.deepEqual(directionsOf({ kind: "hold", direction: "right" }), ["right"]);
    assert.deepEqual(directionsOf({ kind: "many", direction: "down" }), ["down"]);
  });
});

describe("progressKey", () => {
  it("is empty without progress", () => {
    assert.equal(progressKey(null), "");
  });

  it("changes with what is drawn: the pointer, the count, the fraction to 3 decimals", () => {
    assert.equal(progressKey(sequence(2)), "s2");
    assert.equal(progressKey(many(4)), "m4");
    assert.equal(progressKey(hold(0.5)), "h0.500");
  });

  it("ignores what isn't drawn", () => {
    assert.equal(progressKey(hold(0.12341)), progressKey(hold(0.12344)));
    assert.equal(
      progressKey({ kind: "many", count: 1, target: 5, windowRemainingMs: 10 }),
      progressKey({ kind: "many", count: 1, target: 5, windowRemainingMs: 900 }),
    );
    assert.equal(progressKey({ kind: "sequence", pointer: 1, length: 3 }), progressKey(sequence(1)));
  });

  it("tells the kinds apart", () => {
    const keys = [progressKey(sequence(0)), progressKey(hold(0)), progressKey(many(0))];

    assert.equal(new Set(keys).size, 3);
  });
});

describe("cursorKey", () => {
  it("marks a sequence's arrows done, current and pending around its pointer", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((i) => cursorKey(i, sequence(2))),
      ["cursorPast", "cursorPast", "cursorSelected", "cursorEmpty"],
    );
  });

  it("keeps a hold or many's one cursor current, whatever its progress", () => {
    assert.equal(cursorKey(0, hold(0.9)), "cursorSelected");
    assert.equal(cursorKey(0, many(4)), "cursorSelected");
    assert.equal(cursorKey(1, many(4)), "cursorEmpty");
  });
});
