import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type InputEvent, MAX_QUEUED_EVENTS, PointerMap } from "./pointer-map.ts";

const press = (dir: "up" | "down" | "left" | "right"): InputEvent => ({ kind: "press", dir });
const release = (dir: "up" | "down" | "left" | "right"): InputEvent => ({ kind: "release", dir });
const ADVANCE: InputEvent = { kind: "advance" };
const CANCEL: InputEvent = { kind: "cancel" };

describe("PointerMap: one pointer", () => {
  it("presses on down, releases then advances on up", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    assert.deepEqual(map.drain(), [press("up")]);
    assert.ok(map.isHeld("up"));

    map.pointerUp(1);
    assert.deepEqual(map.drain(), [release("up"), ADVANCE]);
    assert.ok(!map.isHeld("up"));
  });

  it("advances on the up of a tap that hit no button, and nothing on its down", () => {
    const map = new PointerMap();

    map.pointerDown(1, null);
    assert.deepEqual(map.drain(), []);
    map.pointerUp(1);
    assert.deepEqual(map.drain(), [ADVANCE]);
  });

  it("drain empties the queue", () => {
    const map = new PointerMap();

    map.pointerDown(1, "left");
    map.drain();
    assert.deepEqual(map.drain(), []);
  });

  it("ignores ups and cancels of unknown pointers", () => {
    const map = new PointerMap();

    map.pointerUp(7);
    map.pointerCancel(7);
    assert.deepEqual(map.drain(), []);
  });

  it("releases a cancelled pointer without advancing", () => {
    const map = new PointerMap();

    map.pointerDown(1, "down");
    map.pointerCancel(1);
    map.pointerUp(1);
    assert.deepEqual(map.drain(), [press("down"), release("down")]);
  });

  it("cancels a live pointer whose up was lost when its id goes down again", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.pointerDown(1, "left");
    assert.deepEqual(map.drain(), [press("up"), release("up"), press("left")]);
    assert.ok(!map.isHeld("up"));
  });
});

describe("PointerMap: multi-touch and the dual pads", () => {
  it("presses different directions on both pads independently", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.pointerDown(2, "left");
    map.pointerUp(2);
    map.pointerUp(1);
    assert.deepEqual(map.drain(), [press("up"), press("left"), release("left"), ADVANCE, release("up"), ADVANCE]);
  });

  it("presses once per new pointer on the same direction, and releases only when the last one lifts", () => {
    const map = new PointerMap();

    map.pointerDown(1, "right");
    map.pointerDown(2, "right");
    assert.deepEqual(map.drain(), [press("right"), press("right")]);

    map.pointerUp(1);
    assert.deepEqual(map.drain(), [ADVANCE]);
    assert.ok(map.isHeld("right"));

    map.pointerUp(2);
    assert.deepEqual(map.drain(), [release("right"), ADVANCE]);
  });

  it("keeps holding when one of two holders is cancelled", () => {
    const map = new PointerMap();

    map.pointerDown(1, "down");
    map.pointerDown(2, "down");
    map.pointerCancel(2);
    assert.ok(map.isHeld("down"));
    map.pointerCancel(1);
    assert.deepEqual(map.drain(), [press("down"), press("down"), release("down")]);
  });

  it("keeps event order for presses in the same frame", () => {
    const map = new PointerMap();

    map.pointerDown(3, "left");
    map.pointerDown(1, "up");
    map.pointerDown(2, "left");
    assert.deepEqual(map.drain(), [press("left"), press("up"), press("left")]);
  });
});

describe("PointerMap: keyboard", () => {
  it("is one more holder of a direction", () => {
    const map = new PointerMap();

    map.keyDown("up", true);
    map.pointerDown(1, "up");
    map.keyUp("up");
    assert.ok(map.isHeld("up"));
    map.pointerUp(1);
    assert.deepEqual(map.drain(), [press("up"), ADVANCE, press("up"), release("up"), ADVANCE]);
  });

  it("releases a direction a pointer held first when the key lifts last", () => {
    const map = new PointerMap();

    map.pointerDown(1, "left");
    map.keyDown("left", true);
    map.pointerUp(1);
    map.keyUp("left");
    assert.deepEqual(map.drain(), [press("left"), press("left"), ADVANCE, ADVANCE, release("left")]);
  });

  it("does not press again a key that is already down (a second non-repeat keydown with no keyup between)", () => {
    const map = new PointerMap();

    map.keyDown("down", false);
    map.keyDown("down", false);
    assert.deepEqual(map.drain(), [press("down")]);
  });

  it("releaseAllKeys lets go of every key whose keyup was lost, as their keyups would", () => {
    const map = new PointerMap();

    map.keyDown("down", false);
    map.keyDown("left", false);
    map.pointerDown(1, "left");
    map.releaseAllKeys();
    assert.ok(!map.isHeld("down"));
    assert.ok(map.isHeld("left"));
    map.keyDown("down", false);
    assert.deepEqual(map.drain(), [press("down"), press("left"), press("left"), release("down"), press("down")]);
  });

  it("releaseAllKeys forgets stale keys silently", () => {
    const map = new PointerMap();

    map.keyDown("up", false);
    map.beginEpoch();
    map.releaseAllKeys();
    map.keyDown("up", false);
    assert.deepEqual(map.drain(), [press("up")]);
  });

  it("advances for non-arrow keys and ignores keyups of keys it never saw", () => {
    const map = new PointerMap();

    map.keyDown(null, true);
    map.keyUp("right");
    assert.deepEqual(map.drain(), [ADVANCE]);
  });
});

describe("PointerMap: cancelAll", () => {
  it("emits one cancel and no releases, and lets every holder go", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.pointerDown(2, "down");
    map.keyDown("left", false);
    map.drain();
    map.cancelAll();
    assert.deepEqual(map.drain(), [CANCEL]);
    assert.ok(!map.isHeld("up") && !map.isHeld("down") && !map.isHeld("left"));
  });

  it("makes the cancelled pointers and keys stale: their ups emit nothing", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.keyDown("left", false);
    map.cancelAll();
    map.drain();
    map.pointerUp(1);
    map.keyUp("left");
    assert.deepEqual(map.drain(), []);
  });

  it("emits nothing when nothing is held", () => {
    const map = new PointerMap();

    map.pointerDown(1, null);
    map.cancelAll();
    assert.deepEqual(map.drain(), []);
  });

  it("keeps the events queued before it", () => {
    const map = new PointerMap();

    map.pointerDown(1, "right");
    map.cancelAll();
    assert.deepEqual(map.drain(), [press("right"), CANCEL]);
  });

  it("lets a stale key be pressed again after its keyup was lost", () => {
    const map = new PointerMap();

    map.keyDown("up", false);
    map.cancelAll();
    map.drain();
    map.keyDown("up", false);
    assert.deepEqual(map.drain(), [press("up")]);
  });
});

describe("PointerMap: beginEpoch", () => {
  it("drops queued events", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.beginEpoch();
    assert.deepEqual(map.drain(), []);
  });

  it("ignores pointers that went down before it, without releasing or advancing", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.pointerDown(2, null);
    map.beginEpoch();
    assert.ok(!map.isHeld("up"));

    map.pointerUp(1);
    map.pointerCancel(2);
    assert.deepEqual(map.drain(), []);
  });

  it("does not let a stale holder keep a direction held for a new pointer", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");
    map.beginEpoch();
    map.pointerDown(2, "up");
    map.pointerUp(1);
    assert.deepEqual(map.drain(), [press("up")]);
    map.pointerUp(2);
    assert.deepEqual(map.drain(), [release("up"), ADVANCE]);
  });

  it("replaces a stale pointer whose id is reused", () => {
    const map = new PointerMap();

    map.pointerDown(1, "left");
    map.beginEpoch();
    map.pointerDown(1, "right");
    map.pointerUp(1);
    assert.deepEqual(map.drain(), [press("right"), release("right"), ADVANCE]);
  });

  it("ignores a key held before it until it is lifted and pressed again", () => {
    const map = new PointerMap();

    map.keyDown("down", false);
    map.beginEpoch();
    map.keyUp("down");
    assert.deepEqual(map.drain(), []);
    map.keyDown("down", false);
    assert.deepEqual(map.drain(), [press("down")]);
  });
});

describe("PointerMap: queue safety net", () => {
  it("keeps up to MAX_QUEUED_EVENTS events untouched", () => {
    const map = new PointerMap();

    for (let index = 0; index < MAX_QUEUED_EVENTS; index++) {
      map.keyDown(null, true);
    }

    assert.equal(map.drain().length, MAX_QUEUED_EVENTS);
  });

  it("past MAX_QUEUED_EVENTS, flushes like beginEpoch and leaves a single cancel", () => {
    const map = new PointerMap();

    map.pointerDown(1, "up");

    for (let index = 0; index < MAX_QUEUED_EVENTS; index++) {
      map.keyDown(null, true);
    }

    assert.deepEqual(map.drain(), [CANCEL]);
    assert.ok(!map.isHeld("up"));

    map.pointerUp(1);
    assert.deepEqual(map.drain(), []);
  });
});
