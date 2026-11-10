// The state of one game, shared by the states, and a plain-data snapshot of it for `window.debug`. Pure TypeScript.
import type { Round } from "../challenges/round.ts";
import type { ChallengeProgress, ChallengeSpec } from "../challenges/rule.ts";
import type { RoundSpec } from "../challenges/generate.ts";
import type { StoryCursor } from "../story/cursor.ts";

export interface GameSession {
  /** The current game's seed. */
  seed: number;
  /** Games started, this one included: 1 for the first, 2 after one replay. */
  games: number;
  /** Every round's challenges, generated from `seed` when the game starts. */
  rounds: readonly RoundSpec[];
  /** The story part being read, or the round being played after it: 0–3 (rounds 0–2). */
  part: number;
  /** The current state's phase, for tests: "preamble", "page", "play", "won", or an ending phase. */
  phase: string;
  /** The running round, while in Round. */
  round: Round | null;
  /** The story cursor, while in Story. */
  cursor: StoryCursor | null;
}

export const createSession = (): GameSession => ({
  seed: 0,
  games: 0,
  rounds: [],
  part: 0,
  phase: "",
  round: null,
  cursor: null,
});

export interface SessionSnapshot {
  readonly seed: number;
  readonly games: number;
  readonly part: number;
  readonly phase: string;
  /** The current challenge's index in the round, its spec and progress, while a round runs. */
  readonly challenge: {
    readonly index: number;
    readonly count: number;
    readonly spec: ChallengeSpec;
    readonly progress: ChallengeProgress;
  } | null;
  /** The story page shown, while reading. */
  readonly page: {
    readonly line: number;
    readonly page: number;
    readonly text: string;
    readonly whisper: boolean;
  } | null;
}

/** Plain data, safe to hand to `page.evaluate` in e2e. */
export const snapshotSession = (session: GameSession): SessionSnapshot => {
  const rule = session.round?.current;
  const page = session.cursor?.page ?? null;

  return {
    seed: session.seed,
    games: session.games,
    part: session.part,
    phase: session.phase,
    challenge: session.round && rule
      ? { index: session.round.index, count: session.round.specs.length, spec: rule.spec, progress: rule.progress }
      : null,
    page: session.cursor && page
      ? { line: session.cursor.lineIndex, page: session.cursor.pageIndex, text: page.text, whisper: page.whisper }
      : null,
  };
};
