import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { controlZoneRect, fitPlayfield, PLAYFIELD_SIZE } from "./layout.ts";

describe("fitPlayfield", () => {
  it("fits the shorter side and centres on the longer one in portrait", () => {
    assert.deepEqual(fitPlayfield(250, 800), { scale: 250 / PLAYFIELD_SIZE, x: 0, y: 275 });
  });

  it("fits the shorter side and centres on the longer one in landscape", () => {
    assert.deepEqual(fitPlayfield(1280, 720), { scale: 720 / PLAYFIELD_SIZE, x: 280, y: 0 });
  });

  it("fills a square screen exactly", () => {
    assert.deepEqual(fitPlayfield(500, 500), { scale: 1, x: 0, y: 0 });
  });

  it("collapses to scale 0 on an empty screen", () => {
    assert.deepEqual(fitPlayfield(0, 600), { scale: 0, x: 0, y: 300 });
  });
});

describe("controlZoneRect", () => {
  it("is the bottom 35% of the screen in portrait", () => {
    assert.deepEqual(controlZoneRect(400, 800), [{ x: 0, y: 520, width: 400, height: 280 }]);
  });

  it("counts a square screen as portrait", () => {
    assert.deepEqual(controlZoneRect(600, 600), [{ x: 0, y: 390, width: 600, height: 210 }]);
  });

  it("is the two side bands beside the centred square in landscape", () => {
    assert.deepEqual(controlZoneRect(1280, 720), [
      { x: 0, y: 0, width: 280, height: 720 },
      { x: 1000, y: 0, width: 280, height: 720 },
    ]);
  });

  it("leaves the playfield square uncovered in landscape", () => {
    const fit = fitPlayfield(1000, 600);
    const [left, right] = controlZoneRect(1000, 600);
    const side = PLAYFIELD_SIZE * fit.scale;

    assert.equal(left?.width, fit.x);
    assert.equal(right?.x, fit.x + side);
  });
});
