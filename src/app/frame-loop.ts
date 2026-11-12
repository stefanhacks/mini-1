// The per-frame ticker listeners, added in one place and in order: game logic (with the animation clips), then the
// audio tick, then the screen tone and the playfield's render pass, all at NORMAL priority, before Pixi renders the
// stage (LOW).
// Written by Claude Code.
import { UPDATE_PRIORITY, type Ticker } from "pixi.js";
import type { Direction } from "../game/direction.ts";
import type { FrameStepper } from "../game/frame-step.ts";
import { createHaltingGuard, type ErrorSink } from "./halting-guard.ts";

export interface FrameLoopDeps {
  readonly ticker: Ticker;
  readonly stepper: FrameStepper;
  /** The pause: a resume applies on the frame after its tap, before the machine steps. */
  readonly pause: { frame(): void };
  readonly padView: { update(isHeld: (dir: Direction) => boolean): void };
  readonly router: { isHeld(dir: Direction): boolean };
  readonly audio: { tick(): void; suspend(): Promise<void> };
  readonly timescale: { readonly value: number };
  readonly clock: { readonly now: number };
  readonly clips: { sync(now: number): void };
  /** The scene's weather once it is built (scene/particles), synced like the clips. */
  readonly weather: { sync(now: number): void };
  /** The renderer's clear colour from the flash (game/screen-tone.ts), once the clips have synced. */
  readonly screenTone: { sync(): void };
  readonly errors: ErrorSink;
  /** The guarded render pass, shared with the renderer's "resize" handler (resize.ts). */
  readonly renderPlayfield: () => void;
}

/** Every call goes through its object (`audio.tick()`, not a destructured `tick`): e2e replaces them. */
export const startFrameLoop = ({
  ticker, stepper, pause, padView, router, audio, timescale, clock, clips, weather, screenTone, errors, renderPlayfield,
}: FrameLoopDeps) => {
  // The only thing that ticks the clock. Its first error halts the game logic: it is reported as an uncaught error and
  // kept in `debug.error` unless an earlier one is there, and the last frame keeps rendering. The pad view follows the
  // held directions inside the same guard, after the states, so a halted game freezes it too.
  // The clips follow the game clock right after the step, in the same guard: their event and end callbacks are game
  // logic (the ending's timeline, say), so a throw in one halts the game like a throw in a state would, and nothing
  // animates on over a halted game. The ticker survives either way. The weather follows the clock the same way, after
  // the clips (the boat it rains on has its pose for this frame by then).
  // A resume's pause.frame() runs first: it drops the input queued while paused, resets the challenge and lets the
  // clock run before the machine steps.
  const stepGame = createHaltingGuard((frame: Ticker) => {
    pause.frame();
    stepper.step(frame.deltaMS * timescale.value);
    clips.sync(clock.now);
    weather.sync(clock.now);
    padView.update((dir) => router.isHeld(dir));
  }, (error) => {
    errors.report(error);
    // The music would loop on over a frozen frame.
    void audio.suspend();
  });

  // The audio engine's per-frame top-up of the bar-by-bar overlay schedule. Outside the game-logic guard and
  // independent of the game clock: the music runs on the AudioContext's own clock, paused game or not.
  const tickAudio = createHaltingGuard(() => audio.tick(), errors.report);

  // The clear colour follows the flash's alpha as the clips left it, before the stage renders. Behind its own guard,
  // outside the game logic's: a halted game keeps its last tone with its last frame.
  const syncTone = createHaltingGuard(() => screenTone.sync(), errors.report);

  ticker.add(stepGame);
  ticker.add(tickAudio);
  ticker.add(syncTone);
  // After the game logic (same priority, added later) and before Pixi renders the stage (LOW). Outside the game-logic
  // guard: a halted game keeps its last frame on screen.
  ticker.add(renderPlayfield, undefined, UPDATE_PRIORITY.NORMAL);
};
