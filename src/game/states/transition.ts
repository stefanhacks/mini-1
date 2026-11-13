import { createCuePlayer } from "./cues.ts";
import type { GameSession } from "./session.ts";
import { TRANSITION_CUES, TRANSITION_MS } from "./timings.ts";
import type { GameDeps, GameState } from "./types.ts";

/**
 * Transition: the original's `Troca` timeline, the strike at 0.167 s and the round at 0.5 s. The pad is
 * already shown, dimmed until the round's first challenge appears. Input is drained and dropped.
 */
export const createTransition = (deps: GameDeps, session: GameSession): GameState => {
  const { input, pad, scene } = deps;

  return {
    enter: (scope, machine) => {
      input.beginEpoch();
      pad.setVisible(true);
      pad.setDimmed(true);
      pad.setHint(null);
      session.phase = "transition";
      // An eye may show until the round's first challenge (m5-plan, owner decision 11).
      scene().setUndersea({ part: session.part, eyesFor: TRANSITION_MS });
      createCuePlayer(deps, session, "transition").schedule(scope, TRANSITION_CUES);
      scope.after(TRANSITION_MS, () => machine.request("round"));
    },
    update: () => {
      input.drain();
    },
  };
};
