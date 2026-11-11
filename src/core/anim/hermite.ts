// Evaluates a Unity AnimationCurve, as Unity does, with no tween library. Pure TypeScript. Written by Claude Code.
//
// Between two keys Unity draws a cubic Hermite from the left key's `outSlope` to the right key's `inSlope`, both
// scaled by the interval. An infinite slope on either side (a constant tangent) holds the left value until the right
// key. A weighted side turns the segment into a cubic Bézier whose handles are `weight × interval` long (1/3 for an
// unweighted side, which gives back the Hermite). Outside the keys, every curve here clamps: their m_PreInfinity and
// m_PostInfinity are 2 (Unity's internal clamp; the importer rejects anything else). Looping is the clip's business
// (player.ts), not the curve's.
import type { Keyframe } from "./clip.ts";

const CONSTANT_TANGENT = 3;
const WEIGHTED_IN = 1;
const WEIGHTED_OUT = 2;
const DEFAULT_WEIGHT = 1 / 3;

const rightTangentMode = (key: Keyframe) => (key.tangentMode >> 5) & 0xf;
const leftTangentMode = (key: Keyframe) => (key.tangentMode >> 1) & 0xf;

const isStep = (left: Keyframe, right: Keyframe) =>
  !Number.isFinite(left.outSlope) || !Number.isFinite(right.inSlope) ||
  rightTangentMode(left) === CONSTANT_TANGENT || leftTangentMode(right) === CONSTANT_TANGENT;

const hermite = (left: Keyframe, right: Keyframe, t: number) => {
  const interval = right.time - left.time;
  const m0 = left.outSlope * interval;
  const m1 = right.inSlope * interval;
  const t2 = t * t;
  const t3 = t2 * t;

  return (2 * t3 - 3 * t2 + 1) * left.value + (t3 - 2 * t2 + t) * m0 + (t3 - t2) * m1 + (3 * t2 - 2 * t3) * right.value;
};

const bezier = (p0: number, p1: number, p2: number, p3: number, u: number) => {
  const v = 1 - u;

  return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3;
};

// The Bézier's x runs from 0 to 1 and, with handles inside [0, 1], never turns back: bisection always converges.
const solveBezierX = (x1: number, x2: number, t: number) => {
  let low = 0;
  let high = 1;

  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;

    if (bezier(0, x1, x2, 1, mid) < t) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
};

const weighted = (left: Keyframe, right: Keyframe, t: number) => {
  const interval = right.time - left.time;
  const w0 = ((left.weightedMode ?? 0) & WEIGHTED_OUT) !== 0 ? left.outWeight ?? DEFAULT_WEIGHT : DEFAULT_WEIGHT;
  const w1 = ((right.weightedMode ?? 0) & WEIGHTED_IN) !== 0 ? right.inWeight ?? DEFAULT_WEIGHT : DEFAULT_WEIGHT;
  const u = solveBezierX(w0, 1 - w1, t);

  return bezier(
    left.value,
    left.value + w0 * interval * left.outSlope,
    right.value - w1 * interval * right.inSlope,
    right.value,
    u,
  );
};

const isWeighted = (left: Keyframe, right: Keyframe) =>
  ((left.weightedMode ?? 0) & WEIGHTED_OUT) !== 0 || ((right.weightedMode ?? 0) & WEIGHTED_IN) !== 0;

/** The curve's value at `time` (seconds). Keys must be sorted by time; an empty curve gives NaN. */
export const evaluateCurve = (keys: readonly Keyframe[], time: number): number => {
  const first = keys[0];
  const last = keys[keys.length - 1];

  if (first === undefined || last === undefined) {
    return Number.NaN;
  }

  if (time <= first.time) {
    return first.value;
  }

  if (time >= last.time) {
    return last.value;
  }

  // Clips have at most a handful of keys: a linear scan is cheaper than a search.
  let index = 1;

  while (keys[index].time < time) {
    index++;
  }

  const left = keys[index - 1];
  const right = keys[index];
  const interval = right.time - left.time;

  if (interval <= 0 || isStep(left, right)) {
    return left.value;
  }

  const t = (time - left.time) / interval;

  return isWeighted(left, right) ? weighted(left, right, t) : hermite(left, right, t);
};
