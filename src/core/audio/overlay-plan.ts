// The overlay layer per story part, and the bar-by-bar plan for the overlay that restarts on every bar. Pure.
// Written by Claude Code.
import { barIndexAtOrAfter, barTime, MIN_LEAD } from "./bar-clock.ts";

/**
 * How an overlay plays:
 * - `loop`: one looping source from its bar on, in phase with BGM01 (same 9.6 s loop);
 * - `per-bar`: a one-shot restarted on every bar (`overlayPhase04`, 7.18 s, rests ~2.4 s per bar; M2 owner decision);
 * - `once`: one one-shot from its bar on, then silence (`bgm02`).
 */
export type OverlayMode = "loop" | "per-bar" | "once";

export type OverlayKey = "overlayPhase02" | "overlayPhase03" | "overlayPhase04" | "bgm02";

export interface OverlayPlan {
  readonly key: OverlayKey;
  readonly mode: OverlayMode;
}

/** Index = story part (01: SoundManager's overlaySequence; part 3 plays once). */
export const OVERLAY_PLANS: readonly OverlayPlan[] = [
  { key: "overlayPhase02", mode: "loop" },
  { key: "overlayPhase03", mode: "loop" },
  { key: "overlayPhase04", mode: "per-bar" },
  { key: "bgm02", mode: "once" },
];

/** The overlay gain, reached with a fade from 0 at 1/s when the layer starts from silence (original `FadeIn`). */
export const OVERLAY_GAIN = 0.9;
export const OVERLAY_FADE = OVERLAY_GAIN;

/** The overlay for a story part; `null` (no part) is no overlay. Throws on a part that doesn't exist. */
export const overlayForPart = (part: number | null): OverlayPlan | null => {
  if (part === null) {
    return null;
  }

  const plan = Number.isInteger(part) ? OVERLAY_PLANS[part] : undefined;

  if (plan === undefined) {
    throw new RangeError(`No overlay for story part ${part}`);
  }

  return plan;
};

export interface PerBarRequest {
  /** The next bar index not yet scheduled. */
  readonly nextIndex: number;
  /** The context's current time. */
  readonly now: number;
  readonly anchor: number;
  readonly bar: number;
  /** Bars starting before `now + horizon` are scheduled. */
  readonly horizon: number;
  /** The track's stop time (Infinity while it plays on): no start at or after it. */
  readonly stopAt: number;
  readonly lead?: number;
}

export interface PerBarPlan {
  /** Bar start times to schedule now, ascending. */
  readonly starts: readonly number[];
  /** The next bar index to schedule on a later call. */
  readonly nextIndex: number;
}

/**
 * The restarts to schedule for a `per-bar` overlay. Called from the engine's `tick` and from each voice's `ended`, it
 * keeps every bar inside the horizon scheduled; calling it again before anything is due returns no starts. Bars that
 * are already too close (less than `lead` ahead, after a long stall) are skipped rather than started late and out of
 * phase.
 */
export const planPerBarStarts = (request: PerBarRequest): PerBarPlan => {
  const { now, anchor, bar, horizon, stopAt, lead = MIN_LEAD } = request;
  const starts: number[] = [];
  let index = Math.max(request.nextIndex, barIndexAtOrAfter(now + lead, anchor, bar));

  const end = Math.min(now + horizon, stopAt);

  while (barTime(anchor, bar, index) < end) {
    starts.push(barTime(anchor, bar, index));
    index += 1;
  }

  return { starts, nextIndex: index };
};
