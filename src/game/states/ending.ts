import type { TimerScope } from "../../core/clock.ts";
import { drainAdvanced, hidePad } from "./common.ts";
import { createCuePlayer } from "./cues.ts";
import type { EndingPhase, GameSession } from "./session.ts";
import { ENDING_CUES, ENDING_MS } from "./timings.ts";
import type { GameDeps, GameState, SceneView } from "./types.ts";

export const TAP_TO_PLAY_AGAIN = "Tap to play again";

/**
 * Ending: the original's `Fim` timeline and GameEnd, as instant cuts on the clock (M4 adds the tweens):
 * at once the broken boat replaces the whole one and the black overlay of the last part lifts; the kraken at 1.5 s,
 * with its roar (ENDING_CUES); black at 8 s; at 10 s the scene is cleared to the empty sea; 3.5 s later the logo, the
 * credits and, new in this port, "Tap to play again" (owner decision 2). Each phase begins an input epoch, and only a
 * tap after the last one counts: it goes to Title, which starts a new game.
 */
export const createEnding = (deps: GameDeps, session: GameSession): GameState => {
  const { input, pad, scene } = deps;

  /** At `ms` from the enter: the phase changes, begins an input epoch, and `cut` shows it. */
  const enterPhaseAt = (scope: TimerScope, name: EndingPhase, ms: number, cut: () => void) => {
    scope.after(ms, () => {
      session.phase = name;
      input.beginEpoch();
      cut();
    });
  };

  /** Back to the empty sea under the storm, for the card. */
  const clearToSea = (view: SceneView) => {
    view.setKraken(false);
    view.setBoat("none");
    view.setBackdrop("pillars", false);
    view.setBackdrop("tentacles", false);
    view.setBlack(false);
  };

  return {
    enter: (scope) => {
      input.beginEpoch();

      const view = scene();

      hidePad(pad);
      session.phase = "boat";
      view.setStoryPage(null);
      view.setBlack(false);
      view.setBoat("broken");

      createCuePlayer(deps, session, "ending").schedule(scope, ENDING_CUES);
      enterPhaseAt(scope, "thrown", ENDING_MS.thrown, () => undefined);
      enterPhaseAt(scope, "kraken", ENDING_MS.kraken, () => view.setKraken(true));
      enterPhaseAt(scope, "black", ENDING_MS.black, () => view.setBlack(true));
      enterPhaseAt(scope, "sea", ENDING_MS.sea, () => clearToSea(view));
      enterPhaseAt(scope, "card", ENDING_MS.card, () => {
        view.setTitle(true);
        view.setPrompt(TAP_TO_PLAY_AGAIN);
      });
    },
    update: (_deltaMS, machine) => {
      const advanced = drainAdvanced(input);

      // Only once the card is up: earlier taps were dropped by each phase's epoch, and this drops the rest.
      if (session.phase === "card" && advanced) {
        machine.request("title");
      }
    },
  };
};
