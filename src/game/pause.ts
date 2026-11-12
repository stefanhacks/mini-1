// Pause and resume (m5-plan, deliverable 5; 02 "Lifecycle"). Pure TypeScript with no DOM or Pixi import: the app feeds
// it the page events, the pause button and keys, and the resume tap, so it runs under `node --test` with fakes.
// Written by Claude Code.
//
// - Paused, the game clock stands still, so every timer, clip, fade and typewriter freezes with it (states only update
//   while the clock runs), audio is suspended, and "Tap to continue" shows (continue-prompt.ts, merged with the audio
//   prompt). Pausing is off at the gate, whose own tap begins the game: there `pause` does nothing.
// - The resume comes from a gesture (a tap, a key), after the caller's audio unlock in the same DOM event: `resume`
//   only hides the prompt and marks the resume. The next frame applies it, under the game-logic guard, before the
//   machine steps: it drops the queued input and makes whatever is down stale (`beginEpoch`), so the resume tap never
//   advances the story nor presses a pad, resets the current challenge's progress (02), lets the clock run, and asks
//   the frame stepper for a frame with no game time (frame-step.ts). The hidden tab's queued "cancel" is dropped with
//   the rest: the challenge reset already lets go of everything it held.
// - Audio that needs a tap while the game runs (an iOS interruption by a call or Siri) pauses it too: the audio
//   lifecycle's prompt rising is polled on each frame, so one prompt stands for both. Only its rise: a prompt still up
//   after the resume tap (its unlock settling, or never taking) doesn't pause again; the game runs under it, as in M3,
//   and the lifecycle drops its taps' advances until audio runs.
// - Nothing here outlives a game in a way a replay could see: the replay tap can't land while paused (the resume
//   drops it), and the state is a flag and a pending resume, both cleared by the resume.

import type { PauseInput } from "./input/router-core.ts";

export interface PauseDeps {
  /** The game clock: `paused` stops it. */
  readonly clock: { paused: boolean };
  /** "Tap to continue" (continue-prompt.ts). */
  readonly view: { setPaused(paused: boolean): void };
  /** The input queue: `beginEpoch` drops what was queued while paused. */
  readonly input: { beginEpoch(): void };
  /** The frame stepper: `resume` makes the next frame run no game time. */
  readonly stepper: { resume(): void };
  /** Resets the current challenge's progress, if a round runs. */
  readonly resetChallenge: () => void;
  /** Suspends audio. */
  readonly suspendAudio: () => void;
  /** Whether pausing is on: false at the gate. */
  readonly available: () => boolean;
  /** Whether the audio lifecycle's "Tap to continue" is up. */
  readonly audioPrompt: () => boolean;
  /** Called when the pause input (router-core.ts) changes: the router and the pause button follow it. */
  readonly onInput: (input: PauseInput) => void;
}

export interface Pause {
  /** Pauses the game, unless it is paused already or pausing is off. */
  readonly pause: () => void;
  /** Resumes from a gesture: hides the prompt; the next `frame` applies it. Does nothing unless paused. */
  readonly resume: () => void;
  /** Call once per frame, before the machine steps, under the game-logic guard. */
  readonly frame: () => void;
  readonly paused: boolean;
  readonly input: PauseInput;
}

export const createPause = (deps: PauseDeps): Pause => {
  const { clock, view, input, stepper } = deps;
  let paused = false;
  let resuming = false;
  let promptWasUp = false;
  let current: PauseInput = "off";

  const syncInput = () => {
    const next: PauseInput = paused ? "paused" : deps.available() ? "ready" : "off";

    if (next !== current) {
      current = next;
      deps.onInput(next);
    }
  };

  const pause = () => {
    if (paused || !deps.available()) {
      return;
    }

    paused = true;
    // A resume not applied yet is dropped: the clock never ran in between.
    resuming = false;
    clock.paused = true;
    view.setPaused(true);
    deps.suspendAudio();
    syncInput();
  };

  return {
    pause,
    resume: () => {
      if (!paused) {
        return;
      }

      paused = false;
      resuming = true;
      // The audio prompt the resume tap's unlock keeps up (audio-lifecycle.ts) is no rise: it doesn't pause again.
      promptWasUp = deps.audioPrompt();
      view.setPaused(false);
      syncInput();
    },
    frame: () => {
      if (resuming) {
        resuming = false;
        input.beginEpoch();
        deps.resetChallenge();
        clock.paused = false;
        stepper.resume();
      }

      const promptUp = deps.audioPrompt();

      if (promptUp && !promptWasUp) {
        pause();
      }

      promptWasUp = promptUp;
      syncInput();
    },
    get paused() {
      return paused;
    },
    get input() {
      return current;
    },
  };
};
