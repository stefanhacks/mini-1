// The page being hidden, shown again, or restored from the bfcache. Written by Claude Code.
import type { AudioLifecycle } from "../game/audio-lifecycle.ts";
import type { FrameStepper } from "../game/frame-step.ts";
import type { Pause } from "../game/pause.ts";

/**
 * Precondition: the input router exists (input-wiring.ts), so its own `visibilitychange` listener, which cancels held
 * input on hidden, runs before this one. See frame-step.ts: the first frame back runs no game time, so that cancel is
 * applied first.
 *
 * Hidden (`visibilitychange`, or `pagehide`, which some engines send alone): the game pauses (pause.ts), which also
 * suspends audio; at the gate, where pausing is off, audio is suspended alone. Visible again: a paused game waits for
 * "Tap to continue", whose tap resumes audio inside the gesture and the game (02: no automatic resume). At the gate,
 * audio tries to resume as before, without blocking anything.
 */
export const wirePageLifecycle = (stepper: FrameStepper, lifecycle: AudioLifecycle, pause: Pause) => {
  const pageHidden = () => {
    pause.pause();

    if (!pause.paused) {
      lifecycle.hidden();
    }
  };

  const pageVisible = () => {
    stepper.resume();

    if (!pause.paused) {
      lifecycle.visible();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pageVisible();
    } else {
      pageHidden();
    }
  });

  window.addEventListener("pagehide", pageHidden);

  // A page restored from the bfcache: the same as becoming visible (its visibilitychange may not come on every engine).
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      pageVisible();
    }
  });
};
