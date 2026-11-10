import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_RESOLUTION, capResolution, floorToDevicePixels, parseCssPx, parseSafeAreaInsets } from "./viewport.ts";

describe("parseCssPx", () => {
  it("reads px lengths, fractional ones included", () => {
    assert.equal(parseCssPx("47px"), 47);
    assert.equal(parseCssPx("20.5px"), 20.5);
    assert.equal(parseCssPx(" 34px"), 34);
  });

  it("reads anything that is not a positive length as 0", () => {
    for (const value of ["0px", "", "auto", "px", "-12px", "NaN", "Infinitypx"]) {
      assert.equal(parseCssPx(value), 0, JSON.stringify(value));
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
  it("keeps device pixel ratios up to MAX_RESOLUTION", () => {
    assert.equal(MAX_RESOLUTION, 3);

    for (const dpr of [0.5, 1, 2, 2.625, 3]) {
      assert.equal(capResolution(dpr), dpr);
    }
  });

  it("caps higher ratios", () => {
    assert.equal(capResolution(3.5), 3);
    assert.equal(capResolution(4), 3);
  });

  it("falls back to 1 when the ratio is unusable", () => {
    for (const dpr of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(capResolution(dpr), 1);
    }
  });
});

describe("floorToDevicePixels", () => {
  it("floors a CSS length to whole device pixels", () => {
    // 412 CSS px at 2.625 is 1081.5 device px: 1081 of them.
    assert.equal(floorToDevicePixels(412, 2.625) * 2.625, 1081);
    assert.equal(floorToDevicePixels(915, 2.625) * 2.625, 2401);
    assert.equal(floorToDevicePixels(390, 3), 390);
    assert.equal(floorToDevicePixels(1280, 1), 1280);
    assert.equal(floorToDevicePixels(100.4, 1), 100);
  });

  it("is not thrown off by float noise", () => {
    // 0.1 × 3 is 0.30000000000000004, and 0.7 × 3 is 2.0999999999999996: whole device pixels either way.
    assert.equal(floorToDevicePixels(1 / 3, 3) * 3, 1);
    assert.equal(floorToDevicePixels(0.7, 3) * 3, 2);
  });
});
