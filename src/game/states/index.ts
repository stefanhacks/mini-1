// The game flow, as in the original: Gate → Title → Story 0 → Transition → Round 0 → Story 1 → ... → Story 3 → Ending,
// and from the Ending back to Title for a new game. Endless mode (endless-plan.md): Title or the Ending → Endless →
// Ending → Title. Pure TypeScript with no Pixi import: the states drive the scene,
// the pad and the input through the interfaces in types.ts.
//
// Rules every state follows (m2-plan, Rules for wave 2):
// - It drains the input queue on every update and drops what doesn't apply to it.
// - It calls `input.beginEpoch()` on enter and at every phase change inside it.
// - Its timers live in its own scope, so they die with it; it creates no listeners.
import { createEndless } from "./endless.ts";
import { createEnding } from "./ending.ts";
import { createGate, type GateControl } from "./gate.ts";
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
  /** The start gate: app/audio-wiring.ts wires `activate` to the input router's `onActivate`. */
  readonly gate: GateControl;
  /**
   * Resets the current challenge's progress while a round or endless mode runs (endless mode restarts its time limit
   * too), else does nothing (the pause's resume, pause.ts).
   */
  readonly resetChallenge: () => void;
}

export const createGame = (deps: GameDeps): Game => {
  const session = createSession();
  const gate = createGate(deps);

  return {
    states: {
      gate,
      title: createTitle(deps, session),
      story: createStory(deps, session),
      transition: createTransition(deps, session),
      round: createRound(deps, session),
      endless: createEndless(deps, session),
      ending: createEnding(deps, session),
    },
    session,
    gate,
    resetChallenge: () => {
      session.round?.resetCurrent();
      session.timed?.reset();
    },
  };
};
