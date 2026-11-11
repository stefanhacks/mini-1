import type { TimerScope } from "../../core/clock.ts";
import { createRng } from "../challenges/rng.ts";
import { drainAdvanced, hidePad } from "./common.ts";
import { ambientDelay, createCuePlayer, type CuePlayer } from "./cues.ts";
import { startNewGame, type GameSession } from "./session.ts";
import { TITLE_AMBIENT, TITLE_CUES, TITLE_DEBOUNCE_MS } from "./timings.ts";
import type { GameDeps, GameState } from "./types.ts";

export const TAP_TO_BEGIN = "Tap to begin";

/** Mixed into the game's seed for Title's ambient lightning, so it draws from its own stream, not the rounds'. */
export const AMBIENT_SALT = 0x7a11e7;

/**
 * Title: the static frame of the original's title (the logo, the credits and the prompt; M4 adds the visuals of the
 * timed lightning and the reveal). Every game starts here, the first and every replay: entering it starts a new game
 * with a new seed and resets the scene, which is the soft reset of owner decision 2. Any tap or key goes to story
 * part 0, once TITLE_DEBOUNCE_MS have passed.
 *
 * Its cues: the intro's strikes (TITLE_CUES), then ambient lightning at the original's random intervals
 * (TITLE_AMBIENT), drawn from the game's seed. The music is left alone: BGM01 loops on, and after a game bgm02 plays
 * out (owner decision 5); Story 0 asks for part 0's overlay again.
 */
export const createTitle = (deps: GameDeps, session: GameSession): GameState => {
  const { clock, input, pad, scene, nextSeed, tuning } = deps;
  let enteredAt = 0;

  /**
   * Ambient lightning after the intro's strikes, from its own RNG stream. Draws the first delay now, at the enter (the
   * draw order is part of a seed's replay), and returns what starts the strikes.
   */
  const scheduleAmbient = (scope: TimerScope, cues: CuePlayer) => {
    const rng = createRng((session.seed ^ AMBIENT_SALT) >>> 0);
    // Times from the enter, as the cues'.
    let nextAt = TITLE_AMBIENT.from + ambientDelay(rng, TITLE_AMBIENT.first);
    const strike = () => {
      cues.fire("lightning");
      nextAt += ambientDelay(rng, TITLE_AMBIENT.next);
      cues.at(scope, nextAt, strike);
    };

    return () => cues.at(scope, nextAt, strike);
  };

  return {
    enter: (scope) => {
      input.beginEpoch();
      enteredAt = clock.now;
      startNewGame(session, nextSeed(), tuning);
      session.phase = "title";

      const view = scene();

      hidePad(pad);
      view.reset();
      view.setTitle(true);
      view.setPrompt(TAP_TO_BEGIN);

      const cues = createCuePlayer(deps, "title");

      cues.schedule(scope, TITLE_CUES, scheduleAmbient(scope, cues));
    },
    update: (_deltaMS, machine) => {
      if (drainAdvanced(input) && clock.now - enteredAt >= TITLE_DEBOUNCE_MS) {
        machine.request("story");
      }
    },
    exit: () => {
      const view = scene();

      view.setTitle(false);
      view.setPrompt(null);
    },
  };
};
