import { createCuePlayer } from "./cues.ts";
import type { GameSession } from "./session.ts";
import { TRANSITION_CUES, TRANSITION_MS } from "./timings.ts";
import type { GameDeps, GameState } from "./types.ts";

/**
 * Transition: the original's `Troca` timeline, the strike at 0.167 s and the round at 0.5 s. The pad is
 * already shown, dimmed until the round's first challenge appears. Input is drained and dropped.
 */
export const createTransition = (deps: GameDeps, session: GameSession): GameState => ({
  enter: (scope, machine) => {
    deps.input.beginEpoch();
    deps.pad.setVisible(true);
    deps.pad.setDimmed(true);
    deps.pad.setHint(null);
    session.phase = "transition";
    createCuePlayer(deps, "transition").schedule(scope, TRANSITION_CUES);
    scope.after(TRANSITION_MS, () => machine.request("round"));
  },
  update: () => {
    deps.input.drain();
  },
});
