import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_RESOLUTION, capResolution, parseCssPx, parseSafeAreaInsets } from "./viewport.ts";

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
