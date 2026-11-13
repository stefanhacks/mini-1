import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIRECTIONS } from "../direction.ts";
import { generateRounds } from "./generate.ts";
import { createRng, type Rng } from "./rng.ts";
import type { ChallengeSpec } from "./rule.ts";
import { TUNING, type Tuning } from "./tuning.ts";

// An Rng that returns scripted integers, checking each one against the asked range.
const scripted = (values: number[]): Rng & { readonly left: number } => {
  const queue = [...values];

  return {
    next: () => {
      throw new Error("generateRounds should only use nextInt");
    },
    nextInt: (max) => {
      const value = queue.shift();

      if (value === undefined || value >= max) {
        throw new Error(`scripted rng: ${value} for nextInt(${max})`);
      }

      return value;
    },
    get left() {
      return queue.length;
    },
  };
};

const kinds = (round: readonly ChallengeSpec[]) => round.map((spec) => spec.kind);

describe("generateRounds", () => {
  it("has the original's tuning", () => {
    assert.deepEqual(TUNING, {
      sequenceTimeoutMs: 1000,
      holdMs: 3000,
      manyPresses: 10,
      manyWindowMs: 3000,
      rounds: [
        { challenges: 3, length: 3, holds: 1, manys: 0 },
        { challenges: 5, length: 5, holds: 0, manys: 1 },
        { challenges: 7, length: 7, holds: 1, manys: 1 },
      ],
    });
  });

  it("builds 3 rounds of 3/5/7 with 1 Hold, 1 Many, then 1 of each, for 20 seeds", () => {
    for (let seed = 0; seed < 20; seed++) {
      const rounds = generateRounds(createRng(seed), TUNING);

      assert.deepEqual(rounds.map((round) => round.length), [3, 5, 7]);

      rounds.forEach((round, i) => {
        const count = (kind: string) => round.filter((spec) => spec.kind === kind).length;
        const expected = TUNING.rounds[i];

        assert.equal(count("hold"), expected?.holds);
        assert.equal(count("many"), expected?.manys);

        for (const spec of round) {
          if (spec.kind === "sequence") {
            assert.equal(spec.directions.length, expected?.length);
            spec.directions.forEach((dir) => assert.ok(DIRECTIONS.includes(dir)));
          } else {
            assert.ok(DIRECTIONS.includes(spec.direction));
          }
        }
      });
    }
  });

  it("draws in the original's order: special indices for every round, redrawing repeats, then arrows in order", () => {
    // Round 1 Hold at 1; round 2 Many at 4; round 3 Hold at 3, Many at 3 (redrawn) then 0.
    const indices = [1, 4, 3, 3, 0];
    // Round 1: seq 3 arrows, hold 1, seq 3 → 7 draws. Round 2: 4 seqs of 5 + many → 21. Round 3: 5 seqs of 7 + 2 → 37.
    const arrows = Array.from({ length: 7 + 21 + 37 }, (_, i) => i % 4);
    const rng = scripted([...indices, ...arrows]);
    const rounds = generateRounds(rng, TUNING);

    assert.equal(rng.left, 0);
    assert.deepEqual(rounds.map(kinds), [
      ["sequence", "hold", "sequence"],
      ["sequence", "sequence", "sequence", "sequence", "many"],
      ["many", "sequence", "sequence", "hold", "sequence", "sequence", "sequence"],
    ]);
    // DIRECTIONS is the original's order (Down, Left, Right, Up), so index i maps to DIRECTIONS[i].
    assert.deepEqual(rounds[0], [
      { kind: "sequence", directions: ["down", "left", "right"] },
      { kind: "hold", direction: "up" },
      { kind: "sequence", directions: ["down", "left", "right"] },
    ]);
    // Round 3's first draw is arrow draw 28 (after 7 + 21), so 28 % 4 = 0: down.
    assert.deepEqual(rounds[2]?.[0], { kind: "many", direction: "down" });
    assert.deepEqual(rounds[2]?.[1], {
      kind: "sequence",
      directions: ["left", "right", "up", "down", "left", "right", "up"],
    });
  });

  it("supports other tunings, keeping the specials on distinct indices", () => {
    const tuning: Tuning = { ...TUNING, rounds: [{ challenges: 4, length: 2, holds: 2, manys: 2 }] };

    for (let seed = 0; seed < 50; seed++) {
      const [round = []] = generateRounds(createRng(seed), tuning);

      assert.deepEqual([...kinds(round)].sort(), ["hold", "hold", "many", "many"]);
    }
  });

  it("throws on a game with no rounds, or a round that can't fit its specials or is empty", () => {
    const CASES: readonly (readonly [name: string, rounds: Tuning["rounds"]])[] = [
      ["no rounds", []],
      ["specials don't fit", [{ challenges: 2, length: 3, holds: 2, manys: 1 }]],
      ["no challenges", [{ challenges: 0, length: 3, holds: 0, manys: 0 }]],
      ["empty sequences", [{ challenges: 3, length: 0, holds: 0, manys: 0 }]],
      ["negative holds", [{ challenges: 3, length: 3, holds: -1, manys: 0 }]],
    ];

    for (const [name, rounds] of CASES) {
      assert.throws(() => generateRounds(createRng(1), { ...TUNING, rounds }), RangeError, name);
    }
  });
});
