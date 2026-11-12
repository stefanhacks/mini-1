// The error guards around the per-frame work (game logic, audio tick, render passes) and the sink they report to.
// Pure TypeScript. Written by Claude Code.
//
// A ticker listener that throws stops Pixi's frame loop for good (the Ticker skips its next requestAnimationFrame), so
// each guard catches the first throw, reports it once and skips its work from then on: the rest of the frame keeps
// running.

export interface ErrorSink {
  /** The first error reported, for `debug.error` (owner decision 2: the first error wins). */
  readonly error: unknown;
  /** Keeps `error` if it is the first, then passes it to the reporter (an uncaught error in the browser). */
  readonly report: (error: unknown) => void;
}

/** `reporter` is called with every error, the first and the later ones. */
export const createErrorSink = (reporter: (error: unknown) => void): ErrorSink => {
  let first: unknown;

  return {
    get error() {
      return first;
    },
    report: (error) => {
      first ??= error;
      reporter(error);
    },
  };
};

/**
 * Wraps `run` so its first throw calls `onHalt` with the error, and every later call does nothing. Arguments go through
 * to `run`.
 */
export const createHaltingGuard = <Args extends unknown[]>(
  run: (...args: Args) => void,
  onHalt: (error: unknown) => void,
) => {
  let halted = false;

  return (...args: Args) => {
    if (halted) {
      return;
    }

    try {
      run(...args);
    } catch (error) {
      halted = true;
      onHalt(error);
    }
  };
};
