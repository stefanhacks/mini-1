import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeNodeOnArtGrid, toPixiRotation, toPlayfieldX, toPlayfieldY } from "./unity-space.ts";

describe("unity-space", () => {
  it("offsets from the origin, flipping y (Unity's y up, the playfield's down)", () => {
    const origin = { x: 250, y: 459 };

    assert.equal(toPlayfieldX(origin, -25), 225);
    assert.equal(toPlayfieldY(origin, 70), 389);
  });

  it("turns Unity's counter-clockwise degrees into Pixi's clockwise radians", () => {
    assert.equal(toPixiRotation(0), 0);
    assert.equal(toPixiRotation(90), -Math.PI / 2);
    assert.equal(toPixiRotation(-180), Math.PI);
  });

  it("snaps like placeOnArtGrid: anchored sprites by their edges, containers by their origin", () => {
    const boat = { position: { x: 0, y: 0 }, anchor: { x: 0.5, y: 0.5 }, width: 32, height: 32 };
    const odd = { position: { x: 0, y: 0 }, anchor: { x: 0.5, y: 0.5 }, width: 33, height: 33 };
    const container = { position: { x: 0, y: 0 }, width: 33, height: 33 };

    placeNodeOnArtGrid(boat, 250.3, 309.5);
    placeNodeOnArtGrid(odd, 250, 250);
    placeNodeOnArtGrid(container, 10.6, -3.4);
    assert.deepEqual(boat.position, { x: 250, y: 310 });
    assert.deepEqual(odd.position, { x: 250.5, y: 250.5 });
    assert.deepEqual(container.position, { x: 11, y: -3 });
  });
});
