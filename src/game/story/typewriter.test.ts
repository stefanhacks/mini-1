import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTypewriter } from "./typewriter.ts";

const FRAME = 1000 / 60;

describe("typewriter", () => {
  it("shows the first character at once, then one per msPerChar", () => {
    const typer = createTypewriter(10, FRAME);

    assert.equal(typer.revealed, 1);
    typer.update(FRAME - 1);
    assert.equal(typer.revealed, 1);
    typer.update(1);
    assert.equal(typer.revealed, 2);

    for (let frame = 0; frame < 7; frame++) {
      typer.update(FRAME);
    }

    assert.equal(typer.revealed, 9);
    assert.equal(typer.done, false);
    typer.update(FRAME);
    assert.deepEqual([typer.revealed, typer.done], [10, true]);
  });

  it("types about 60 characters a second at 1000/60 ms each, whatever the frame lengths", () => {
    const steady = createTypewriter(200, FRAME);
    const uneven = createTypewriter(200, FRAME);
    const deltas = [7, 33, 16.7, 2, 41.3];

    for (let frame = 0; frame < 60; frame++) {
      steady.update(FRAME);
    }

    for (let frame = 0; frame < 10; frame++) {
      deltas.forEach((delta) => uneven.update(delta));
    }

    assert.equal(steady.revealed, 61, "60 frames of 1000/60 ms: 60 characters after the first");
    assert.equal(uneven.revealed, 61, "1000 ms in uneven frames types the same");
  });

  it("reveals several characters in one long frame (the accumulator)", () => {
    const typer = createTypewriter(50, FRAME);

    typer.update(100);
    assert.equal(typer.revealed, 7);
  });

  it("types a whisper at 100 ms a character", () => {
    const typer = createTypewriter(15, 100);

    typer.update(99);
    assert.equal(typer.revealed, 1);
    typer.update(1);
    assert.equal(typer.revealed, 2);
    typer.update(1300);
    assert.equal(typer.revealed, 15);
    assert.equal(typer.done, true);
  });

  it("completes at once, and stays complete", () => {
    const typer = createTypewriter(40, 100);

    typer.complete();
    assert.deepEqual([typer.revealed, typer.done], [40, true]);
    typer.update(500);
    assert.equal(typer.revealed, 40);
  });

  it("is done at once on an empty page", () => {
    const typer = createTypewriter(0, FRAME);

    assert.deepEqual([typer.revealed, typer.length, typer.done], [0, 0, true]);
    typer.update(FRAME);
    assert.equal(typer.revealed, 0);
  });

  it("ignores time once done, so a later resize doesn't jump ahead", () => {
    const typer = createTypewriter(3, 100);

    typer.update(10_000);
    assert.equal(typer.done, true);
    typer.resize(10);
    assert.deepEqual([typer.revealed, typer.done], [10, true], "a complete page stays complete");
  });

  it("keeps what shows across a resize while typing, and types on from there", () => {
    const typer = createTypewriter(30, 100);

    typer.update(450);
    assert.equal(typer.revealed, 5);
    typer.resize(60);
    assert.deepEqual([typer.revealed, typer.length, typer.done], [5, 60, false]);
    typer.update(50);
    assert.equal(typer.revealed, 6, "the time into the next character carries over");
  });

  it("completes when a resize cuts the page to what already shows", () => {
    const typer = createTypewriter(30, 100);

    typer.update(900);
    typer.resize(8);
    assert.deepEqual([typer.revealed, typer.done], [8, true]);
    typer.resize(30);
    assert.equal(typer.revealed, 30, "complete stays complete");
  });

  it("rejects a speed that never types", () => {
    assert.throws(() => createTypewriter(5, 0), RangeError);
  });
});
