// The game flow, as in the original: Gate → Title → Story 0 → Transition → Round 0 → Story 1 → ... → Story 3 → Ending,
// and from the Ending back to Title for a new game. Pure TypeScript with no Pixi import: the states drive the scene,
// the pad and the input through the interfaces in types.ts.
//
// Rules every state follows (m2-plan, Rules for wave 2):
// - It drains the input queue on every update and drops what doesn't apply to it.
// - It calls `input.beginEpoch()` on enter and at every phase change inside it.
// - Its timers live in its own scope, so they die with it; it creates no listeners.
import { createEnding } from "./ending.ts";
import { createGate } from "./gate.ts";
import { createRound } from "./round.ts";
import { createSession, type GameSession } from "./session.ts";
import { createStory } from "./story.ts";
import { createTitle } from "./title.ts";
import { createTransition } from "./transition.ts";
import type { GameDeps, GameState, GameStateId } from "./types.ts";

export type { GameDeps, GameState, GameStateId } from "./types.ts";

export interface Game {
  readonly states: Record<GameStateId, GameState>;
  /** The current game, read by `window.debug`. */
  readonly session: GameSession;
}

export const createGame = (deps: GameDeps): Game => {
  const session = createSession();

  return {
    states: {
      gate: createGate(deps),
      title: createTitle(deps, session),
      story: createStory(deps, session),
      transition: createTransition(deps, session),
      round: createRound(deps, session),
      ending: createEnding(deps, session),
    },
    session,
  };
};
