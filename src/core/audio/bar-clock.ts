// BGM01's bar grid on the AudioContext clock (seconds). Pure. Written by Claude Code.
//
// Every music change lands on `anchor + n * bar`, where `anchor` is the context time BGM01 was started at (its
// `offset`, the loop start, plays at `anchor`) and `bar` is BGM01's loop length. Times are always computed from the
// integer bar index, never accumulated, so float error doesn't grow over a long session.
//
// Suspend: `AudioContext.currentTime` stands still while the context is suspended (or interrupted), and so does every
// scheduled source, so the grid stays valid across a hidden tab with no re-anchoring.
import type { LoopAudioAsset } from "../../assets/manifest.ts";

/**
 * The least time between "now" and a scheduled change, in seconds. A boundary closer than this goes to the next bar.
 * `currentTime` advances in render quanta and the main thread can stall between reading it and calling `start`, so a
 * `start(t)` with `t` at or just past "now" starts late and out of phase with BGM01. 0.1 s covers a long frame; the
 * cost is that a change asked for in the last 0.1 s of a bar waits one more bar.
 */
export const MIN_LEAD = 0.1;

// Times this close to a boundary count as on it, in seconds. Far above float error (~1e-12 s after hours), far
// below one sample (~2e-5 s).
const SNAP = 1e-6;

/**
 * The bar length: BGM01's loop length, `loopEnd - loopStart`. The same subtraction the Web Audio engine makes for the
 * loop, so the grid and the playing loop agree.
 */
export const barLength = (asset: LoopAudioAsset): number => asset.loopEnd - asset.loopStart;

/** The context time of bar `index` (0 is the anchor). */
export const barTime = (anchor: number, bar: number, index: number): number => anchor + index * bar;

/** The index of the first bar at or after `time` (within SNAP), never below 0. */
export const barIndexAtOrAfter = (time: number, anchor: number, bar: number): number => {
  if (time <= anchor) {
    return 0;
  }

  return Math.max(0, Math.ceil((time - anchor - SNAP) / bar));
};

/**
 * The first bar boundary at least `lead` seconds after `now`: the time a change asked for at `now` takes effect.
 * Before the anchor that is the anchor itself (when it is far enough ahead). A boundary exactly `lead` away counts.
 */
export const nextBarTime = (now: number, anchor: number, bar: number, lead = MIN_LEAD): number =>
  barTime(anchor, bar, barIndexAtOrAfter(now + lead, anchor, bar));

/** How many bars `time` is after the anchor, as a float. Whole numbers mean "on a boundary" (for debug and e2e). */
export const barsFromAnchor = (time: number, anchor: number, bar: number): number => (time - anchor) / bar;

/**
 * When a change asked for at `now` takes effect if it must also wait for `notBefore` (a one-shot overlay's natural
 * end; owner decision: `bgm02` is never cut): the later of the next bar and the first bar at or after `notBefore`.
 */
export const changeBarTime = (now: number, anchor: number, bar: number, notBefore = -Infinity, lead = MIN_LEAD) =>
  Math.max(nextBarTime(now, anchor, bar, lead), barTime(anchor, bar, barIndexAtOrAfter(notBefore, anchor, bar)));
