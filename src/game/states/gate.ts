import type { StateMachine } from "../../core/state-machine.ts";
import { drainAdvanced } from "./common.ts";
import { TAP_TO_BEGIN } from "./title.ts";
import type { GameDeps, GameState, GameStateId } from "./types.ts";

export const LOAD_FAILED = "Couldn't load. Tap to retry";

export type GatePhase = "loading" | "ready" | "failed";

/** The line under the warning in each phase, once the texts show. */
const GATE_PROMPTS: Readonly<Record<GatePhase, string | null>> = {
  loading: null,
  ready: TAP_TO_BEGIN,
  failed: LOAD_FAILED,
};

/** The gate's side the app uses (app/audio-wiring.ts), besides its state. */
export interface GateControl {
  /**
   * Call synchronously from the input router's `onActivate` hook (inside the DOM gesture). On the begin tap, the one
   * whose "advance" Gate turns into Title, it unlocks audio and starts the music; otherwise it does nothing.
   */
  activate(): void;
  /** What the gate shows: for `window.debug` and e2e. */
  readonly phase: GatePhase;
  /** The last progress reported (0..1). */
  readonly progress: number;
}

/**
 * The start gate, replacing the original 5 s load screen (m3-plan, deliverable 2): load progress and the
 * flashing-lights warning, then "Tap to begin", whose tap unlocks audio and goes to Title. A failed load shows
 * "Couldn't load. Tap to retry", and the tap retries just what failed. Written by Claude Code.
 *
 * Phases change only in `update`, each with `input.beginEpoch()`, so a tap made in one phase never acts in the next.
 * That is also why `activate` (DOM time) and the advance it comes with (drained in `update`) always see the same phase:
 * an activation while "ready" is shown is followed by an "advance" drained while "ready", which requests Title.
 * Loading starts on the first enter and is never restarted by a re-enter.
 */
export const createGate = (
  { loader, gateView, audio, input, scene }: Pick<GameDeps, "loader" | "gateView" | "audio" | "input" | "scene">,
): GameState & GateControl => {
  let phase: GatePhase = "loading";
  let progress = 0;
  // The settled result of the current load run, applied on the next update.
  let result: "pending" | "loaded" | "failed" = "pending";
  let started = false;
  let active = false;

  const startLoad = () => {
    started = true;
    result = "pending";
    progress = 0;
    loader.load((fraction) => {
      progress = fraction;
    }).then(() => {
      result = "loaded";
    }, () => {
      // The loader reports the error itself (app/game-loader.ts: reportError); Gate only shows the retry.
      result = "failed";
    });
  };

  const showScreen = () => {
    // The texts wait for the font, unless the load failed: then a fallback font beats a silent black screen.
    const text = loader.fontReady || phase === "failed";

    gateView.show({
      progress: phase === "loading" ? progress : null,
      warning: text,
      prompt: text ? GATE_PROMPTS[phase] : null,
    });
  };

  const enterPhase = (next: GatePhase) => {
    phase = next;
    input.beginEpoch();
    showScreen();
  };

  /** While loading: the settled result moves the phase on; until then the bar follows the progress. */
  const applyLoadResult = () => {
    if (result === "loaded") {
      // The scene is built now: keep it under the black overlay, as the original's black Load scene. Title's reset
      // lifts it.
      scene().setBlack(true);
      enterPhase("ready");
    } else if (result === "failed") {
      enterPhase("failed");
    } else {
      showScreen();
    }
  };

  /** A tap once loading is over: "Tap to begin" goes to Title, "Tap to retry" retries what failed. */
  const onAdvance = (machine: StateMachine<GameStateId>) => {
    if (phase === "ready") {
      machine.request("title");
    } else if (phase === "failed") {
      startLoad();
      enterPhase("loading");
    }
  };

  return {
    enter: () => {
      active = true;
      input.beginEpoch();

      if (!started) {
        startLoad();
      }

      showScreen();
    },
    update: (_deltaMS, machine) => {
      const advanced = drainAdvanced(input);

      if (phase === "loading") {
        applyLoadResult();
      } else if (advanced) {
        onAdvance(machine);
      }
    },
    exit: () => {
      active = false;
      gateView.show(null);
    },
    activate: () => {
      if (active && phase === "ready") {
        audio.unlock();
        audio.startMusic();
      }
    },
    get phase() {
      return phase;
    },
    get progress() {
      return progress;
    },
  };
};
