// The three per-frame ticker listeners, added in one place and in order: game logic, then the audio tick, then the
// playfield's render pass, all at NORMAL priority, before Pixi renders the stage (LOW). Written by Claude Code.
import { UPDATE_PRIORITY, type Ticker } from "pixi.js";
import type { Direction } from "../game/direction.ts";
import type { FrameStepper } from "../game/frame-step.ts";
import { createHaltingGuard, type ErrorSink } from "./halting-guard.ts";

export interface FrameLoopDeps {
  readonly ticker: Ticker;
  readonly stepper: FrameStepper;
  readonly padView: { update(isHeld: (dir: Direction) => boolean): void };
  readonly router: { isHeld(dir: Direction): boolean };
  readonly audio: { tick(): void; suspend(): Promise<void> };
  readonly timescale: { readonly value: number };
  readonly errors: ErrorSink;
  /** The guarded render pass, shared with the renderer's "resize" handler (resize.ts). */
  readonly renderPlayfield: () => void;
}

/** Every call goes through its object (`audio.tick()`, not a destructured `tick`): e2e replaces them. */
export const startFrameLoop = ({ ticker, stepper, padView, router, audio, timescale, errors, renderPlayfield }:
  FrameLoopDeps) => {
  // The only thing that ticks the clock. Its first error halts the game logic: it is reported as an uncaught error and
  // kept in `debug.error` unless an earlier one is there, and the last frame keeps rendering. The pad view follows the
  // held directions inside the same guard, after the states, so a halted game freezes it too.
  const stepGame = createHaltingGuard((frame: Ticker) => {
    stepper.step(frame.deltaMS * timescale.value);
    padView.update((dir) => router.isHeld(dir));
  }, (error) => {
    errors.report(error);
    // The music would loop on over a frozen frame.
    void audio.suspend();
  });

  // The audio engine's per-frame top-up of the bar-by-bar overlay schedule. Outside the game-logic guard and
  // independent of the game clock: the music runs on the AudioContext's own clock, paused game or not.
  const tickAudio = createHaltingGuard(() => audio.tick(), errors.report);

  ticker.add(stepGame);
  ticker.add(tickAudio);
  // After the game logic (same priority, added later) and before Pixi renders the stage (LOW). Outside the game-logic
  // guard: a halted game keeps its last frame on screen.
  ticker.add(renderPlayfield, undefined, UPDATE_PRIORITY.NORMAL);

  return () => {
    ticker.remove(stepGame);
    ticker.remove(tickAudio);
    ticker.remove(renderPlayfield);
  };
};
