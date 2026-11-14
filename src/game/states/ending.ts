import type { TimerScope } from "../../core/clock.ts";
import type { StateMachine } from "../../core/state-machine.ts";
import { drainTaps, hidePad, startFreshGame } from "./common.ts";
import { createCuePlayer } from "./cues.ts";
import type { EndingPhase, GameSession } from "./session.ts";
import { CARD_FADE, ENDING_CUES, ENDING_MS, ENDLESS_TITLE_MS, FADE, TITLE_EXIT_MS } from "./timings.ts";
import type { GameDeps, GameState, GameStateId, SceneView } from "./types.ts";

export const TAP_TO_PLAY_AGAIN = "Tap to play again";

/**
 * Ending: the original's `Fim` timeline and GameEnd, on the clock (ENDING_MS):
 * - at once the broken boat replaces the whole one; 0.5 s: the black overlay of the last part fades out;
 * - 0.583 s: the broken boat is thrown up, and stays at the top of its throw;
 * - 1.5 s: the kraken fades in, rising, with its roar (ENDING_CUES);
 * - 8.5 s: black fades in, full at 9.5 s;
 * - 10 s: the kraken, the boat and the backdrops go, under full black, which fades out to the empty sea at 10.25 s;
 * - 13.5 s: the logo and the credits fade in at half speed;
 * - 22.25 s: new in this port, "Tap to play again" fades in and pulses (m4-plan decision 6, m5-plan decision 1).
 * Each phase begins an input epoch, and only a tap from the last one, the prompt, counts: it goes to Title, which
 * starts a new game. The endless-mode icon's tap there (an "endless" event) fades the card and the prompt out
 * (`leaving`, TITLE_EXIT_MS, as Title's exit), then starts a new game in endless mode (endless-plan.md).
 *
 * After endless mode (`session.mode`), the same timeline runs up to the empty sea, then goes straight back to Title at
 * ENDLESS_TITLE_MS, with no card or prompt (owner decision 5); Title resets the difficulty.
 */
export const createEnding = (deps: GameDeps, session: GameSession): GameState => {
  const { input, pad, scene } = deps;

  /** The endless-mode icon's tap on the prompt: the card and the prompt fade out, then a new game in endless mode. */
  const leaveForEndless = (scope: TimerScope, machine: StateMachine<GameStateId>) => {
    const view = scene();

    session.phase = "leaving";
    input.beginEpoch();
    view.setTitle(false, FADE);
    view.setPrompt(null, FADE);
    scope.after(TITLE_EXIT_MS, () => {
      startFreshGame(deps, session);
      session.mode = "endless";
      machine.request("endless");
    });
  };

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
    enter: (scope, machine) => {
      input.beginEpoch();

      const view = scene();

      hidePad(pad);
      session.phase = "boat";
      view.setStoryPage(null);
      view.setBoat("broken");
      // An eye may show until the kraken (m5-plan, owner decision 11).
      view.setUndersea({ part: session.part, eyesFor: ENDING_MS.kraken });

      createCuePlayer(deps, session, "ending").schedule(scope, ENDING_CUES);
      scope.after(ENDING_MS.lift, () => view.setBlack(false, FADE));
      enterPhaseAt(scope, "thrown", ENDING_MS.thrown, () => view.setBoat("thrown"));
      enterPhaseAt(scope, "kraken", ENDING_MS.kraken, () => {
        view.setKraken(true, FADE);
        // Nothing under the sea once the kraken shows (m5-plan, owner decision 4).
        view.setUndersea(null);
      });
      enterPhaseAt(scope, "black", ENDING_MS.black, () => view.setBlack(true, FADE));
      enterPhaseAt(scope, "sea", ENDING_MS.sea, () => clearToSea(view));
      scope.after(ENDING_MS.seaLift, () => view.setBlack(false, FADE));

      if (session.mode === "endless") {
        scope.after(ENDLESS_TITLE_MS, () => machine.request("title"));
        return;
      }

      enterPhaseAt(scope, "card", ENDING_MS.card, () => view.setTitle(true, CARD_FADE));
      enterPhaseAt(scope, "replay", ENDING_MS.replay, () => view.setPrompt(TAP_TO_PLAY_AGAIN, FADE));
    },
    update: (_deltaMS, machine, scope) => {
      const { advanced, endless } = drainTaps(input);

      // Only once the prompt is up, as on Title: earlier taps were dropped by each phase's epoch, and this drops the
      // rest. The icon's tap wins over an advance drained with it.
      if (session.phase !== "replay") {
        return;
      }

      if (endless) {
        leaveForEndless(scope, machine);
      } else if (advanced) {
        machine.request("title");
      }
    },
  };
};
