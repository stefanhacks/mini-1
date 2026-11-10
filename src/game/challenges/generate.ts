// Builds every round's challenges up front, as KeyManager.PopulateCheats does. Pure TypeScript with no Pixi import.
import { DIRECTIONS, type Direction } from "../direction.ts";
import type { Rng } from "./rng.ts";
import type { ChallengeSpec } from "./rule.ts";
import type { RoundTuning, Tuning } from "./tuning.ts";

export type RoundSpec = readonly ChallengeSpec[];

const randomDirection = (rng: Rng): Direction => DIRECTIONS[rng.nextInt(DIRECTIONS.length)] ?? DIRECTIONS[0];

/**
 * Generates the rounds in the original's draw order: first the special indices of every round (round by round, Holds
 * before Manys, a repeated index redrawn, as the original's do/while), then the arrows of every challenge in order.
 * Every arrow is uniform over DIRECTIONS. Throws a RangeError if a round can't fit its Holds and Manys.
 */
export const generateRounds = (rng: Rng, tuning: Tuning): RoundSpec[] => {
  if (tuning.rounds.length === 0) {
    throw new RangeError("A game needs at least one round");
  }

  const layouts = tuning.rounds.map((round) => pickKinds(rng, round));

  return layouts.map((kinds, i) => {
    const length = tuning.rounds[i]?.length ?? 0;

    return kinds.map((kind): ChallengeSpec => {
      if (kind === "sequence") {
        return { kind, directions: Array.from({ length }, () => randomDirection(rng)) };
      }

      return { kind, direction: randomDirection(rng) };
    });
  });
};

const pickKinds = (rng: Rng, round: RoundTuning): ChallengeSpec["kind"][] => {
  const { challenges, length, holds, manys } = round;

  if (!Number.isInteger(challenges) || challenges < 1 || !Number.isInteger(length) || length < 1) {
    throw new RangeError(`A round needs at least 1 challenge of length >= 1, got ${challenges} of ${length}`);
  }

  if (!Number.isInteger(holds) || !Number.isInteger(manys) || holds < 0 || manys < 0 || holds + manys > challenges) {
    throw new RangeError(`A round of ${challenges} can't hold ${holds} Holds and ${manys} Manys`);
  }

  const kinds: ChallengeSpec["kind"][] = Array.from({ length: challenges }, () => "sequence");
  const place = (kind: "hold" | "many") => {
    let index: number;

    do {
      index = rng.nextInt(challenges);
    } while (kinds[index] !== "sequence");

    kinds[index] = kind;
  };

  for (let i = 0; i < holds; i++) {
    place("hold");
  }

  for (let i = 0; i < manys; i++) {
    place("many");
  }

  return kinds;
};
