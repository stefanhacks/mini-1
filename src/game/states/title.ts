import { generateRounds } from "../challenges/generate.ts";
import { createRng } from "../challenges/rng.ts";
import { ambientDelay, createCuePlayer } from "./cues.ts";
import type { GameSession } from "./session.ts";
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
  let enteredAt = 0;

  return {
    enter: (scope) => {
      const { input, pad, scene, nextSeed, tuning } = deps;

      input.beginEpoch();
      enteredAt = deps.clock.now;
      session.seed = nextSeed();
      session.games += 1;
      session.rounds = generateRounds(createRng(session.seed), tuning);
      session.part = 0;
      session.phase = "title";
      session.round = null;
      session.cursor = null;

      const view = scene();

      pad.setVisible(false);
      pad.setHint(null);
      view.reset();
      view.setTitle(true);
      view.setPrompt(TAP_TO_BEGIN);

      const cues = createCuePlayer(deps, "title");
      const rng = createRng((session.seed ^ AMBIENT_SALT) >>> 0);
      // Times from the enter, as the cues'.
      let nextAt = TITLE_AMBIENT.from + ambientDelay(rng, TITLE_AMBIENT.first);
      const strike = () => {
        cues.fire("lightning");
        nextAt += ambientDelay(rng, TITLE_AMBIENT.next);
        cues.at(scope, nextAt, strike);
      };

      cues.schedule(scope, TITLE_CUES, () => cues.at(scope, nextAt, strike));
    },
    update: (_deltaMS, machine) => {
      const advanced = deps.input.drain().some((event) => event.kind === "advance");

      if (advanced && deps.clock.now - enteredAt >= TITLE_DEBOUNCE_MS) {
        machine.request("story");
      }
    },
    exit: () => {
      deps.scene().setTitle(false);
      deps.scene().setPrompt(null);
    },
  };
};
