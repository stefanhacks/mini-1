import { TAP_TO_BEGIN } from "./title.ts";
import type { GameDeps, GameState } from "./types.ts";

export const LOAD_FAILED = "Couldn't load. Tap to retry";

export type GatePhase = "loading" | "ready" | "failed";

/** The gate's side main.ts uses, besides its state. */
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
      // The loader reports the error itself (main.ts: reportError); Gate only shows the retry.
      result = "failed";
    });
  };

  const show = () => {
    // The texts wait for the font, unless the load failed: then a fallback font beats a silent black screen.
    const text = loader.fontReady || phase === "failed";

    gateView.show({
      progress: phase === "loading" ? progress : null,
      warning: text,
      prompt: !text ? null : phase === "ready" ? TAP_TO_BEGIN : phase === "failed" ? LOAD_FAILED : null,
    });
  };

  const enterPhase = (next: GatePhase) => {
    phase = next;
    input.beginEpoch();
    show();
  };

  return {
    enter: () => {
      active = true;
      input.beginEpoch();

      if (!started) {
        startLoad();
      }

      show();
    },
    update: (_deltaMS, machine) => {
      const advanced = input.drain().some((event) => event.kind === "advance");

      if (phase === "loading") {
        if (result === "loaded") {
          // The scene is built now: keep it under the black overlay, as the original's black Load scene. Title's
          // reset lifts it.
          scene().setBlack(true);
          enterPhase("ready");
        } else if (result === "failed") {
          enterPhase("failed");
        } else {
          show();
        }
      } else if (advanced && phase === "ready") {
        machine.request("title");
      } else if (advanced && phase === "failed") {
        startLoad();
        enterPhase("loading");
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
