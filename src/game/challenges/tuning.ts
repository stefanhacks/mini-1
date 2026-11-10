// Every challenge tunable in one place, so device playtests change them here. Pure TypeScript.
// Values from 01-original-game.md and KeyManager.cs (sequenceDelay is 2 in code, overridden to 1 in Main.unity).

export interface RoundTuning {
  /** Challenges in the round. */
  readonly challenges: number;
  /** Arrows in each Sequence challenge. */
  readonly length: number;
  /** Hold challenges, at random distinct indices. */
  readonly holds: number;
  /** Many challenges, at random distinct indices (distinct from the Holds too). */
  readonly manys: number;
}

export interface Tuning {
  /** Sequence: a correct press must follow the previous one within this time, or the pointer resets to 0. */
  readonly sequenceTimeoutMs: number;
  /** Hold: how long the direction must stay held. */
  readonly holdMs: number;
  /** Many: presses needed within one window. */
  readonly manyPresses: number;
  /** Many: the window, from its first counted press. */
  readonly manyWindowMs: number;
  readonly rounds: readonly RoundTuning[];
}

export const TUNING: Tuning = {
  sequenceTimeoutMs: 1000,
  holdMs: 3000,
  manyPresses: 10,
  manyWindowMs: 3000,
  rounds: [
    { challenges: 3, length: 3, holds: 1, manys: 0 },
    { challenges: 5, length: 5, holds: 0, manys: 1 },
    { challenges: 7, length: 7, holds: 1, manys: 1 },
  ],
};
