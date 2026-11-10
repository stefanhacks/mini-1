import type { GameSession } from "./session.ts";
import { TRANSITION_MS } from "./timings.ts";
import type { GameDeps, GameState } from "./types.ts";

/**
 * Transition: the original's `Troca` timeline, the round at 0.5 s (the thunder at 0.167 s comes in M4). The pad is
 * already shown, dimmed until the round's first challenge appears. Input is drained and dropped.
 */
export const createTransition = (deps: GameDeps, session: GameSession): GameState => ({
  enter: (scope, machine) => {
    deps.input.beginEpoch();
    deps.pad.setVisible(true);
    deps.pad.setDimmed(true);
    deps.pad.setHint(null);
    session.phase = "transition";
    scope.after(TRANSITION_MS, () => machine.request("round"));
  },
  update: () => {
    deps.input.drain();
  },
});
