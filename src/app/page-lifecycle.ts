// The page being hidden, shown again, or restored from the bfcache. Written by Claude Code.
import type { AudioLifecycle } from "../game/audio-lifecycle.ts";
import type { FrameStepper } from "../game/frame-step.ts";

/**
 * Precondition: the input router exists (input-wiring.ts), so its own `visibilitychange` listener, which cancels held
 * input on hidden, runs before this one. See frame-step.ts: the first frame back runs no game time, so that cancel is
 * applied first. Audio suspends while hidden and tries to resume when visible, without blocking anything.
 */
export const wirePageLifecycle = (stepper: FrameStepper, lifecycle: AudioLifecycle) => {
  const pageVisible = () => {
    stepper.resume();
    lifecycle.visible();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pageVisible();
    } else {
      lifecycle.hidden();
    }
  });

  // A page restored from the bfcache: the same as becoming visible (its visibilitychange may not come on every engine).
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      pageVisible();
    }
  });
};
