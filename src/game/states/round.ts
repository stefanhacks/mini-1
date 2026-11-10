import { Round } from "../challenges/round.ts";
import { ruleContext } from "../challenges/rule.ts";
import type { GameSession } from "./session.ts";
import { AFTER_ROUND_MS } from "./timings.ts";
import type { Backdrop, GameDeps, GameState } from "./types.ts";

/** The backdrop each round reveals when won: pillars after the first, tentacles after the second. */
const BACKDROPS: readonly (Backdrop | null)[] = ["pillars", "tentacles", null];

/**
 * Round `session.part`: its challenges one after another (challenges/round.ts), on this state's clock and scope.
 *
 * Every update drains the input queue and feeds the round through an explicit switch: press, release and cancel go to
 * the challenge, advance is dropped (challenges/ must not import input/). Once the last challenge is done the arrows
 * go, the pad dims, the round's backdrop appears at once (M4 fades it in over the wait, as the original starts its
 * fade there) and AFTER_ROUND_MS later the next story part starts. Events after that are dropped.
 */
export const createRound = (deps: GameDeps, session: GameSession): GameState => {
  const { clock, input, pad } = deps;

  const showChallenge = () => {
    const spec = session.round?.current?.spec ?? null;

    deps.scene().setChallenge(spec);
    deps.scene().setProgress(session.round?.current?.progress ?? null);
    // Only the single-arrow challenges get the hint: on a Sequence it would give the order away.
    pad.setHint(spec !== null && spec.kind !== "sequence" ? spec.direction : null);
  };

  return {
    enter: (scope, machine) => {
      const specs = session.rounds[session.part];

      if (specs === undefined) {
        throw new Error(`No round ${session.part} in this game`);
      }

      input.beginEpoch();
      pad.setVisible(true);
      pad.setDimmed(false);
      session.phase = "play";

      const won = () => {
        const backdrop = BACKDROPS[session.part] ?? null;

        session.phase = "won";
        input.beginEpoch();
        pad.setDimmed(true);
        pad.setHint(null);
        deps.scene().setChallenge(null);

        if (backdrop !== null) {
          deps.scene().setBackdrop(backdrop, true);
        }

        scope.after(AFTER_ROUND_MS, () => {
          session.part += 1;
          machine.request("story");
        });
      };

      session.round = new Round(specs, ruleContext(clock, scope, deps.tuning, won), showChallenge);
      showChallenge();
    },
    update: () => {
      const round = session.round;

      for (const event of input.drain()) {
        if (round === null || round.done) {
          break;
        }

        switch (event.kind) {
        case "press":
          round.press(event.dir);
          break;
        case "release":
          round.release(event.dir);
          break;
        case "cancel":
          round.cancelAll();
          break;
        case "advance":
          break;
        }
      }

      deps.scene().setProgress(round?.current?.progress ?? null);
    },
    exit: () => {
      deps.scene().setChallenge(null);
      pad.setHint(null);
      session.round = null;
    },
  };
};
