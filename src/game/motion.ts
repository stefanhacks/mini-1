// The reduced-motion policy (m5-plan, deliverable 4): one row of rules for `prefers-reduced-motion: reduce`, one for
// without it. Pure data and a follower: the scene reads the setting live each frame, through the same query the flash
// cap reads at each strike (scene/lightning.ts `watchReducedMotion`), and applies the row that matches when it changes,
// so switching the OS setting mid-game applies without a reload. Written by Claude Code.
//
// What the rows don't hold, because reduced motion leaves it to its own code or as it is:
// - the lightning flash and its screen tone: capped at FLASH_REDUCED_PEAK (lightning.ts), read at each strike;
// - the thrown boat and the kraken's rise: kept, they are story beats;
// - the bubbles and the eyes: kept, they are slow.

export interface MotionPolicy {
  /** Clip seconds per game second for the ambient loops: the sea strips, the clouds and the boat's bob. */
  readonly ambientSpeed: number;
  /** The prompt's (`TMPIdle`) and the arrows' (`ArrowHold`, `ArrowMany`) pulses held at full alpha, at scale 1. */
  readonly holdPulses: boolean;
  /** The rain's emission, times the original's 220 drops a second (scene/particles/weather.ts `WeatherMotion`). */
  readonly rainRate: number;
}

/** The original's motion. */
export const FULL_MOTION: MotionPolicy = {
  ambientSpeed: 1,
  holdPulses: false,
  rainRate: 1,
};

/**
 * Under `prefers-reduced-motion: reduce`. The sea, clouds and boat move slower, not stilled (owner decision 5), at a
 * factor tuned by eye; the rain falls at half the rate, at the same speed and slant.
 */
export const REDUCED_MOTION: MotionPolicy = {
  ambientSpeed: 0.5,
  holdPulses: true,
  rainRate: 0.5,
};

export const motionPolicy = (reduced: boolean): MotionPolicy => (reduced ? REDUCED_MOTION : FULL_MOTION);

/**
 * Returns a step, to call once a frame, that reads `reduced` and calls `apply` with its policy: on the first step, then
 * only when the setting changes.
 */
export const followMotion = (reduced: () => boolean, apply: (policy: MotionPolicy) => void) => {
  let applied: MotionPolicy | null = null;

  return () => {
    const policy = motionPolicy(reduced());

    if (policy !== applied) {
      applied = policy;
      apply(policy);
    }
  };
};
