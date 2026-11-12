import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Direction } from "../direction.ts";
import type { InputEvent } from "../input/pointer-map.ts";
import { drainAdvanced, hidePad } from "./common.ts";

const inputWith = (events: InputEvent[]) => {
  let queue = events;

  return {
    drain: () => {
      const drained = queue;

      queue = [];

      return drained;
    },
    beginEpoch: () => undefined,
    get queued() {
      return queue.length;
    },
  };
};

describe("drainAdvanced", () => {
  it("empties the queue and says whether it held an advance", () => {
    const withAdvance = inputWith([{ kind: "press", dir: "up" }, { kind: "advance" }]);
    const without = inputWith([{ kind: "press", dir: "up" }, { kind: "cancel" }]);

    assert.equal(drainAdvanced(withAdvance), true);
    assert.equal(drainAdvanced(without), false);
    assert.equal(withAdvance.queued, 0);
    assert.equal(without.queued, 0);
  });

  it("is false for an empty queue", () => {
    assert.equal(drainAdvanced(inputWith([])), false);
  });
});

describe("hidePad", () => {
  it("hides the pad and clears its hint", () => {
    const calls: string[] = [];

    hidePad({
      setVisible: (visible: boolean) => calls.push(`visible:${visible}`),
      setDimmed: (dimmed: boolean) => calls.push(`dimmed:${dimmed}`),
      setHint: (dir: Direction | null) => calls.push(`hint:${dir}`),
    });

    assert.deepEqual(calls, ["visible:false", "hint:null"]);
  });
});
