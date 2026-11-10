import type { GameSession } from "./session.ts";
import { ENDING_MS } from "./timings.ts";
import type { GameDeps, GameState } from "./types.ts";

export const TAP_TO_PLAY_AGAIN = "Tap to play again";

/**
 * Ending: the original's `Fim` timeline and GameEnd, as instant cuts on the clock (M4 adds the tweens):
 * at once the broken boat replaces the whole one and the black overlay of the last part lifts; the kraken at 1.5 s;
 * black at 8 s; at 10 s the scene is cleared to the empty sea; 3.5 s later the logo, the credits and, new in this port,
 * "Tap to play again" (owner decision 2). Each phase begins an input epoch, and only a tap after the last one counts:
 * it goes to Title, which starts a new game.
 */
export const createEnding = (deps: GameDeps, session: GameSession): GameState => {
  let accepting = false;

  return {
    enter: (scope) => {
      const { input, pad } = deps;
      const scene = deps.scene();
      const phase = (name: string, ms: number, cut: () => void) => {
        scope.after(ms, () => {
          session.phase = name;
          input.beginEpoch();
          cut();
        });
      };

      accepting = false;
      input.beginEpoch();
      pad.setVisible(false);
      pad.setHint(null);
      session.phase = "boat";
      scene.setStoryPage(null);
      scene.setBlack(false);
      scene.setBoat("broken");

      phase("thrown", ENDING_MS.thrown, () => undefined);
      phase("kraken", ENDING_MS.kraken, () => scene.setKraken(true));
      phase("black", ENDING_MS.black, () => scene.setBlack(true));
      phase("sea", ENDING_MS.sea, () => {
        scene.setKraken(false);
        scene.setBoat("none");
        scene.setBackdrop("pillars", false);
        scene.setBackdrop("tentacles", false);
        scene.setBlack(false);
      });
      phase("card", ENDING_MS.card, () => {
        scene.setTitle(true);
        scene.setPrompt(TAP_TO_PLAY_AGAIN);
        accepting = true;
      });
    },
    update: (_deltaMS, machine) => {
      const advanced = deps.input.drain().some((event) => event.kind === "advance");

      if (accepting && advanced) {
        machine.request("title");
      }
    },
    exit: () => {
      accepting = false;
    },
  };
};
