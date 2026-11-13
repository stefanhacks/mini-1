// The audio side of the page lifecycle, and the "Tap to continue" prompt (m3-plan, deliverable 5). Pure TypeScript
// with no DOM or Pixi import: main.ts feeds it the page events and the router's activations, so it runs under
// `node --test` with fakes. Written by Claude Code.
//
// - Hidden: suspend the context. Visible again (or a `pageshow` from the bfcache): try `resume()` without a gesture.
//   If that settles false and the engine says "needs-gesture", show the prompt. `resume()` is never awaited by anyone
//   else: the game goes on while it settles (wave-1 note: on some iOS it may never settle outside a gesture).
// - The engine reports "needs-gesture" right after `suspend()`, while hidden. That is not shown: the prompt waits for
//   the resume attempt. A status change to "needs-gesture" while visible and no attempt is running (iOS "interrupted"
//   by a call or Siri) shows it at once.
// - A status change shows nothing before audio has run once: the begin tap's unlock goes "locked" → "needs-gesture"
//   while its resume settles, and that window must not flash the prompt. A failed resume on becoming visible shows it
//   either way ("needs-gesture" means an unlock happened; before the begin tap the status is "locked").
// - Any activation (router.onActivate, inside the DOM gesture) calls `unlock()` while the engine needs a gesture
//   (unlock is idempotent), and keeps the prompt up, or shows it, until audio runs (M5: the resume tap of a pause).
//   That also rescues a begin tap whose unlock never took. main.ts calls it only once Gate is left: at the gate, the
//   begin tap's unlock and its touchend retry are Gate's. The prompt hides on "running".
// - The prompt's tap only continues: it must not also advance the game (a Story page, Title, the Ending's replay).
//   `filter` runs over every drain and drops the "advance" events while the prompt is up, and in the first drain after
//   a tap made it go away, since the tap's advance is queued before its unlock resumes the context. Only "advance" is
//   dropped: presses, releases and cancels pass, so a Round's held directions stay consistent, and the queued
//   "cancel" of a hidden tab reaches the state on the frame stepper's guard frame (frame-step.ts) as before. No
//   `beginEpoch()` here, which would drop that cancel. So a "continue" tap during a Round can still press a pad, on
//   purpose: the full pause is M5.
// - Known limit: a tap queued just before an interruption shows the prompt (both between two drains) has its advance
//   dropped too.

import type { AudioStatus } from "../core/audio/audio-rules.ts";
import type { InputEvent } from "./input/pointer-map.ts";

/** The engine's side the lifecycle uses (audio-engine.ts satisfies it). */
export interface LifecycleAudio {
  suspend(): Promise<void>;
  resume(): Promise<boolean>;
  unlock(): void;
  readonly status: AudioStatus;
  onStatusChange(listener: (status: AudioStatus) => void): () => void;
}

/** The "Tap to continue" view. Idempotent. */
export interface ContinuePromptView {
  setVisible(visible: boolean): void;
}

export interface AudioLifecycle {
  /** The page was hidden. */
  readonly hidden: () => void;
  /** The page is visible again (`visibilitychange`, or `pageshow` with `persisted`). */
  readonly visible: () => void;
  /** Call from the router's `onActivate`, inside the gesture. Idempotent, as that hook requires. */
  readonly activate: () => void;
  /** Filters a drain of the input queue: drops the prompt tap's advance (see the top of this file). */
  readonly filter: (events: InputEvent[]) => InputEvent[];
  /** Whether "Tap to continue" is up. */
  readonly prompting: boolean;
  /** Unsubscribes from the engine. */
  readonly destroy: () => void;
}

export const createAudioLifecycle = (
  audio: LifecycleAudio,
  view: ContinuePromptView,
  isVisible: () => boolean,
): AudioLifecycle => {
  let prompting = false;
  // Whether a tap came while the prompt was up: its advance may still be queued when the prompt goes away.
  let tapped = false;
  // Drop advances in the next drain: the prompt went away after a tap.
  let dropNext = false;
  // Counts resume attempts, so a stale attempt (hidden again before it settled) is ignored.
  let attempt = 0;
  let resuming = false;
  // Whether audio has run since the begin tap. Until then there is nothing to continue.
  let ran = audio.status === "running";

  const show = () => {
    if (!prompting) {
      prompting = true;
      view.setVisible(true);
    }
  };

  const hide = () => {
    if (prompting) {
      prompting = false;
      dropNext = tapped;
      tapped = false;
      view.setVisible(false);
    }
  };

  const unsubscribe = audio.onStatusChange((status) => {
    if (status === "running") {
      ran = true;
      hide();
    } else if (status === "needs-gesture" && ran && isVisible() && !resuming) {
      show();
    }
  });

  return {
    hidden: () => {
      attempt += 1;
      resuming = false;
      void audio.suspend();
    },
    visible: () => {
      const current = ++attempt;

      resuming = true;
      void audio.resume().then((running) => {
        if (current !== attempt) {
          return;
        }

        resuming = false;

        if (running) {
          hide();
        } else if (audio.status === "needs-gesture") {
          show();
        }
      });
    },
    activate: () => {
      tapped ||= prompting;

      if (audio.status === "needs-gesture") {
        audio.unlock();

        // The unlock settles later, or never (a gesture the browser doesn't count): until audio runs the prompt stays
        // up, or comes up, and this tap counts as its tap. That is the resume tap of a pause (pause.ts), whose prompt
        // was the pause's alone: a hidden tab skips `visible` while paused. A normal unlock hides it again in a few ms,
        // under the pause's prompt, so nothing flashes. Not before audio has run: the begin tap's unlock is Gate's.
        if (ran && audio.status === "needs-gesture") {
          show();
          tapped = true;
        }
      }
    },
    filter: (events) => {
      if (!prompting && !dropNext) {
        return events;
      }

      // A drain while the prompt is up drops that tap's advance itself: the drain after the hide has nothing to drop
      // unless the tap and the hide both fell between two drains.
      if (prompting) {
        tapped = false;
      }

      dropNext = false;

      return events.filter((event) => event.kind !== "advance");
    },
    get prompting() {
      return prompting;
    },
    destroy: unsubscribe,
  };
};
