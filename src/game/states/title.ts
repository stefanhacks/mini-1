import { generateRounds } from "../challenges/generate.ts";
import { createRng } from "../challenges/rng.ts";
import type { GameSession } from "./session.ts";
import type { GameDeps, GameState } from "./types.ts";

export const TAP_TO_BEGIN = "Tap to begin";

/**
 * Title: the static frame of the original's title (the logo, the credits and the prompt; M4 adds the timed lightning
 * and the reveal). Every game starts here, the first and every replay: entering it starts a new game with a new seed
 * and resets the scene, which is the soft reset of owner decision 2. Any tap or key goes to story part 0.
 */
export const createTitle = (deps: GameDeps, session: GameSession): GameState => ({
  enter: () => {
    const { input, pad, scene, nextSeed, tuning } = deps;

    input.beginEpoch();
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
  },
  update: (_deltaMS, machine) => {
    if (deps.input.drain().some((event) => event.kind === "advance")) {
      machine.request("story");
    }
  },
  exit: () => {
    deps.scene().setTitle(false);
    deps.scene().setPrompt(null);
  },
});
