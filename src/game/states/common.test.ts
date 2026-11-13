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
  it("empties the queue and says whether it held an advance, false for an empty one", () => {
    const CASES: readonly (readonly [name: string, events: InputEvent[], advanced: boolean])[] = [
      ["with an advance", [{ kind: "press", dir: "up" }, { kind: "advance" }], true],
      ["without", [{ kind: "press", dir: "up" }, { kind: "cancel" }], false],
      ["empty", [], false],
    ];

    for (const [name, events, advanced] of CASES) {
      const input = inputWith(events);

      assert.equal(drainAdvanced(input), advanced, name);
      assert.equal(input.queued, 0, `${name}: emptied`);
    }
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
