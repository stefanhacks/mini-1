import type { TimerScope } from "../../core/clock.ts";
import { drainAdvanced, hidePad } from "./common.ts";
import { createCuePlayer } from "./cues.ts";
import type { EndingPhase, GameSession } from "./session.ts";
import { CARD_FADE, ENDING_CUES, ENDING_MS, FADE } from "./timings.ts";
import type { GameDeps, GameState, SceneView } from "./types.ts";

export const TAP_TO_PLAY_AGAIN = "Tap to play again";

/**
 * Ending: the original's `Fim` timeline and GameEnd, on the clock (ENDING_MS):
 * - at once the broken boat replaces the whole one; 0.5 s: the black overlay of the last part fades out;
 * - 0.583 s: the broken boat is thrown up, and stays at the top of its throw;
 * - 1.5 s: the kraken fades in, rising, with its roar (ENDING_CUES);
 * - 8.5 s: black fades in, full at 9.5 s;
 * - 10 s: the kraken, the boat and the backdrops go, under full black, which fades out to the empty sea at 10.25 s;
 * - 13.5 s: the logo and the credits fade in at half speed;
 * - 17.25 s: new in this port, "Tap to play again" fades in and pulses (owner decision 2, m4-plan owner decision 6).
 * Each phase begins an input epoch, and only a tap from the last one, the prompt, counts: it goes to Title, which
 * starts a new game.
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

  /** `FimFinal`: back to the empty sea under the storm, for the card, while black is full. */
  const clearToSea = (view: SceneView) => {
    view.setKraken(false);
    view.setBoat("none");
    view.setBackdrop("pillars", false);
    view.setBackdrop("tentacles", false);
  };

  return {
    enter: (scope) => {
      input.beginEpoch();

      const view = scene();

      hidePad(pad);
      session.phase = "boat";
      view.setStoryPage(null);
      view.setBoat("broken");

      createCuePlayer(deps, session, "ending").schedule(scope, ENDING_CUES);
      scope.after(ENDING_MS.lift, () => view.setBlack(false, FADE));
      enterPhaseAt(scope, "thrown", ENDING_MS.thrown, () => view.setBoat("thrown"));
      enterPhaseAt(scope, "kraken", ENDING_MS.kraken, () => view.setKraken(true, FADE));
      enterPhaseAt(scope, "black", ENDING_MS.black, () => view.setBlack(true, FADE));
      enterPhaseAt(scope, "sea", ENDING_MS.sea, () => clearToSea(view));
      scope.after(ENDING_MS.seaLift, () => view.setBlack(false, FADE));
      enterPhaseAt(scope, "card", ENDING_MS.card, () => view.setTitle(true, CARD_FADE));
      enterPhaseAt(scope, "replay", ENDING_MS.replay, () => view.setPrompt(TAP_TO_PLAY_AGAIN, FADE));
    },
    update: (_deltaMS, machine) => {
      const advanced = drainAdvanced(input);

      // Only once the prompt is up, as on Title: earlier taps were dropped by each phase's epoch, and this drops the
      // rest.
      if (session.phase === "replay" && advanced) {
        machine.request("title");
      }
    },
  };
};
