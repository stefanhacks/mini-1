import type { TimerScope } from "../../core/clock.ts";
import type { StateMachine } from "../../core/state-machine.ts";
import { createRng } from "../challenges/rng.ts";
import { drainTaps, startFreshGame } from "./common.ts";
import { ambientDelay, createCuePlayer, type CuePlayer } from "./cues.ts";
import type { GameSession } from "./session.ts";
import { FADE, TITLE_AMBIENT, TITLE_CUES, TITLE_EXIT_MS, TITLE_PROMPT_MS } from "./timings.ts";
import type { GameDeps, GameState, GameStateId, SceneView } from "./types.ts";

export const TAP_TO_BEGIN = "Tap to begin";

/** Mixed into the game's seed for Title's ambient lightning, so it draws from its own stream, not the rounds'. */
export const AMBIENT_SALT = 0x7a11e7;

/**
 * Title: the original's title frame. Every game starts here, the first and every replay: entering it starts a new game
 * with a new seed and resets the scene, which is the soft reset of owner decision 2. Its phases:
 * - `title`, the intro: the logo shows at the reveal strike's flash peak (`SceneView.strike`); taps are dropped.
 * - `prompt`, from TITLE_PROMPT_MS: the credits and "Tap to begin" fade in, the prompt pulsing. A tap or key starts
 *   the exit; the endless-mode icon's tap (an "endless" event) does too, for endless mode (endless-plan.md).
 * - `leaving`, the exit (`Inicio.anim`, m4-plan owner decision 1): the logo, the credits and the prompt fade out over
 *   TITLE_EXIT_MS, then story part 0 starts, or endless mode. Taps are dropped.
 *
 * Its cues: the intro's strikes (TITLE_CUES), then ambient lightning at the original's random intervals
 * (TITLE_AMBIENT), drawn from the game's seed. The music is left alone: BGM01 loops on, and after a game bgm02 plays
 * out (owner decision 5); Story 0 asks for part 0's overlay again.
 */
export const createTitle = (deps: GameDeps, session: GameSession): GameState => {
  const { input, scene, endlessIcon } = deps;

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

  /** The end of the intro: the credits and the prompt fade in, and taps count from now. */
  const showPrompt = (view: SceneView) => {
    session.phase = "prompt";
    input.beginEpoch();
    view.setCredits(true, FADE);
    view.setPrompt(TAP_TO_BEGIN, FADE);
    // The endless-mode icon is offered from the first Title on (owner decision 4), not highlighted.
    endlessIcon.setAvailable(true, false);
  };

  /** `Inicio`: everything fades out, and the story (or endless mode) starts at its end (`FimInicio`). */
  const leave = (scope: TimerScope, machine: StateMachine<GameStateId>, next: "story" | "endless") => {
    const view = scene();

    session.phase = "leaving";
    input.beginEpoch();
    endlessIcon.setAvailable(false, false);
    view.setTitle(false, FADE);
    view.setPrompt(null, FADE);
    scope.after(TITLE_EXIT_MS, () => machine.request(next));
  };

  return {
    enter: (scope) => {
      input.beginEpoch();
      endlessIcon.setAvailable(false, false);
      startFreshGame(deps, session);
      session.phase = "title";

      const view = scene();

      const cues = createCuePlayer(deps, session, "title");
      const startAmbient = scheduleAmbient(scope, cues);

      // One timer pending, as the cues': the intro's strikes, then the prompt, then the ambient strikes; plus the exit
      // timer while leaving.
      cues.schedule(scope, TITLE_CUES, () => cues.at(scope, TITLE_PROMPT_MS, () => {
        showPrompt(view);
        startAmbient();
      }));
    },
    update: (_deltaMS, machine, scope) => {
      const { advanced, endless } = drainTaps(input);

      if (session.phase !== "prompt") {
        return;
      }

      // The icon's tap wins over an advance drained with it: it is the more specific choice.
      if (endless) {
        session.mode = "endless";
        leave(scope, machine, "endless");
      } else if (advanced) {
        leave(scope, machine, "story");
      }
    },
    exit: () => {
      const view = scene();

      endlessIcon.setAvailable(false, false);
      view.setTitle(false);
      view.setPrompt(null);
    },
  };
};
