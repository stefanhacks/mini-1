import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIPS } from "../../assets/anims.ts";
import type { Keyframe } from "./clip.ts";
import { evaluateCurve } from "./hermite.ts";

// The expected values are worked out by hand from the YAML keys (Assets/Graphics/Animations), not with the evaluator.
const curveOf = (clip: keyof typeof CLIPS, attribute: string) => {
  const curve = CLIPS[clip].curves.find((candidate) => candidate.attribute === attribute);

  assert.ok(curve !== undefined, `${clip} has ${attribute}`);

  return curve.keys;
};

const key = (time: number, value: number, slopes: Partial<Keyframe> = {}): Keyframe => ({
  time, value, inSlope: 0, outSlope: 0, tangentMode: 0, ...slopes,
});

const close = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not ${expected}`);

describe("evaluateCurve", () => {
  it("is a straight line between linear keys (Clouds x: 0 → −84 over 10 s, tangent modes 65/5)", () => {
    const keys = curveOf("clouds", "m_AnchoredPosition.x");

    close(evaluateCurve(keys, 2.5), -21);
    close(evaluateCurve(keys, 7.5), -63);
  });

  it("eases between flat clamped-auto keys (SeaAnim y: 50, 47, 50, tangent mode 136)", () => {
    const keys = curveOf("seaAnim", "m_AnchoredPosition.y");

    // Zero slopes leave the Hermite's smoothstep: 50 − 3·(3u² − 2u³).
    close(evaluateCurve(keys, 0.5), 48.5);
    close(evaluateCurve(keys, 0.25), 50 - 3 * 0.15625);
    close(evaluateCurve(keys, 1), 47);
    close(evaluateCurve(keys, 1.5), 48.5);
  });

  it("uses the left key's outSlope and the right key's inSlope, scaled by the interval (Barco)", () => {
    // y, 0 → 0.8 s: 0 (slope −1.875, mode 34) to −1.5 (slope 0, mode 136). At u = ½ the Hermite basis is ½, ⅛, ½, −⅛:
    // ⅛ · (−1.875 · 0.8) + ½ · (−1.5) = −0.9375.
    close(evaluateCurve(curveOf("barco", "m_LocalPosition.y"), 0.4), -0.9375);
    // Tilt, 0 → 0.8 s: 0 (slope 8.32778) to 7 (slope −0.025031256): ⅛·6.662224 + ½·7 + ⅛·0.020025 = 4.3352811.
    close(evaluateCurve(curveOf("barco", "localEulerAnglesRaw.z"), 0.4), 4.3352811256);
  });

  it("holds the left value across a constant tangent, as an infinite slope or as the tangent mode", () => {
    const infinite = [key(0, 1, { outSlope: Infinity }), key(1, 0, { inSlope: Infinity })];
    // Right tangent constant (3 << 5) on the left key, finite slopes.
    const moded = [key(0, 1, { tangentMode: 96, outSlope: -1 }), key(1, 0, { inSlope: -1 })];

    for (const keys of [infinite, moded]) {
      assert.equal(evaluateCurve(keys, 0.5), 1);
      assert.equal(evaluateCurve(keys, 0.999), 1);
      assert.equal(evaluateCurve(keys, 1), 0);
    }
  });

  it("follows a weighted out tangent as a Bézier (ArrowHold alpha, out weight 0.26367918)", () => {
    // Forward from the Bézier at u = ½ (handles w·Δt long, the unweighted side at ⅓): x(½) = ⅜·w₀ + ⅜·⅔ + ⅛ of the
    // interval, y(½) = ⅜·(w₀·Δt·m₀) + ⅜ + ⅛.
    close(evaluateCurve(curveOf("arrowHold", "m_Color.a"), 0.4896756664540103), 0.60984580282173, 1e-5);
  });

  it("gives the Hermite back when both weights are ⅓", () => {
    const plain = [key(0, 0, { outSlope: 2 }), key(1, 1, { inSlope: -1 })];
    const weighted = [
      key(0, 0, { outSlope: 2, weightedMode: 2, outWeight: 1 / 3 }),
      key(1, 1, { inSlope: -1, weightedMode: 1, inWeight: 1 / 3 }),
    ];

    for (const t of [0.1, 0.37, 0.5, 0.82]) {
      close(evaluateCurve(weighted, t), evaluateCurve(plain, t), 1e-9);
    }
  });

  it("clamps before the first key and after the last, and gives NaN for no keys", () => {
    const keys = curveOf("clouds", "m_AnchoredPosition.x");

    assert.equal(evaluateCurve(keys, -1), 0);
    assert.equal(evaluateCurve(keys, 12), -84);
    assert.equal(evaluateCurve([key(1, 5)], 0), 5);
    assert.ok(Number.isNaN(evaluateCurve([], 0)));
  });
});
