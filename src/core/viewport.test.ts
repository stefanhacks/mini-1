import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_RESOLUTION, capResolution, floorToDevicePixels, parseCssPx, parseSafeAreaInsets } from "./viewport.ts";

describe("parseCssPx", () => {
  it("reads px lengths, fractional ones included, and anything that is not a positive length as 0", () => {
    const CASES: readonly (readonly [value: string, px: number])[] = [
      ["47px", 47],
      ["20.5px", 20.5],
      [" 34px", 34],
      ...["0px", "", "auto", "px", "-12px", "NaN", "Infinitypx"].map((value) => [value, 0] as const),
    ];

    for (const [value, px] of CASES) {
      assert.equal(parseCssPx(value), px, JSON.stringify(value));
    }
  });
});

describe("parseSafeAreaInsets", () => {
  it("maps each padding side to its inset", () => {
    const style = { paddingTop: "47px", paddingRight: "0px", paddingBottom: "34px", paddingLeft: "" };

    assert.deepEqual(parseSafeAreaInsets(style), { top: 47, right: 0, bottom: 34, left: 0 });
  });
});

describe("capResolution", () => {
  it("keeps device pixel ratios up to MAX_RESOLUTION, caps higher ones, and falls back to 1 for unusable ones", () => {
    assert.equal(MAX_RESOLUTION, 3);

    const CASES: readonly (readonly [dpr: number, resolution: number])[] = [
      ...[0.5, 1, 2, 2.625, 3].map((dpr) => [dpr, dpr] as const),
      [3.5, 3],
      [4, 3],
      ...[0, -1, Number.NaN, Number.POSITIVE_INFINITY].map((dpr) => [dpr, 1] as const),
    ];

    for (const [dpr, resolution] of CASES) {
      assert.equal(capResolution(dpr), resolution, `dpr ${dpr}`);
    }
  });
});

describe("floorToDevicePixels", () => {
  it("floors a CSS length to whole device pixels, not thrown off by float noise", () => {
    const CASES: readonly (readonly [css: number, dpr: number, devicePx: number])[] = [
      // 412 CSS px at 2.625 is 1081.5 device px: 1081 of them.
      [412, 2.625, 1081],
      [915, 2.625, 2401],
      [390, 3, 1170],
      [1280, 1, 1280],
      [100.4, 1, 100],
      // Float noise: 0.1 × 3 is 0.30000000000000004, and 0.7 × 3 is 2.0999999999999996. Whole device pixels either way.
      [1 / 3, 3, 1],
      [0.7, 3, 2],
    ];

    for (const [css, dpr, devicePx] of CASES) {
      assert.equal(floorToDevicePixels(css, dpr) * dpr, devicePx, `${css} at dpr ${dpr}`);
    }
  });
});
