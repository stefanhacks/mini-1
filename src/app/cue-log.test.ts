import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUE_LOG_SIZE, createCueLog } from "./cue-log.ts";

describe("createCueLog", () => {
  it("logs each cue with the clock's time, oldest first", () => {
    let now = 100;
    const log = createCueLog(() => now);

    log.onCue({ name: "lightning", state: "title", at: 0 });
    now = 250;
    log.onCue({ name: "kraken", state: "ending", at: 1500 });

    assert.deepEqual(log.entries(), [
      { name: "lightning", state: "title", at: 0, time: 100 },
      { name: "kraken", state: "ending", at: 1500, time: 250 },
    ]);
  });

  it(`keeps the last ${CUE_LOG_SIZE}`, () => {
    let now = 0;
    const log = createCueLog(() => now);

    for (let index = 0; index < CUE_LOG_SIZE + 5; index++) {
      now = index;
      log.onCue({ name: "lightning", state: "title", at: index });
    }

    const entries = log.entries();

    assert.equal(entries.length, CUE_LOG_SIZE);
    assert.equal(entries[0]?.time, 5);
    assert.equal(entries.at(-1)?.time, CUE_LOG_SIZE + 4);
  });

  it("hands out copies", () => {
    const log = createCueLog(() => 0);

    log.onCue({ name: "lightning", state: "title", at: 0 });

    const [entry] = log.entries();

    assert.notEqual(entry, log.entries()[0]);
  });
});
