import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAYFIELD_SIZE } from "../../core/layout.ts";
import {
  ARROW_ROW,
  ARROW_SPACING,
  arrowX,
  CHALLENGE_PROMPT,
  GATE_PROMPT,
  RING_RADIUS,
  TAP_PROMPT,
  WORLD_SPRITES,
} from "./positions.ts";

describe("arrowX", () => {
  it("centres an odd row on the playfield", () => {
    assert.deepEqual([0, 1, 2].map((i) => arrowX(i, 3)), [200, 250, 300]);
    assert.equal(arrowX(0, 1), ARROW_ROW.x);
  });

  it("sits an even row half a step right, as KeyManager's integer division did", () => {
    assert.deepEqual([0, 1, 2, 3].map((i) => arrowX(i, 4)), [150, 200, 250, 300]);
  });

  it("spaces arrows ARROW_SPACING apart, and fits 7 inside the playfield", () => {
    const row = [0, 1, 2, 3, 4, 5, 6].map((i) => arrowX(i, 7));

    assert.deepEqual(row, [100, 150, 200, 250, 300, 350, 400]);
    row.slice(1).forEach((x, i) => assert.equal(x - row[i], ARROW_SPACING));
    assert.ok(row.every((x) => x > 0 && x < PLAYFIELD_SIZE));
  });
});

describe("WORLD_SPRITES", () => {
  it("lists the world back to front, by the original's sortingOrder", () => {
    const orders = WORLD_SPRITES.map(({ sortingOrder }) => sortingOrder);

    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it("keeps the labels the tests and the debug overlay look up", () => {
    assert.deepEqual(WORLD_SPRITES.map(({ label }) => label), [
      "tentacles",
      "pillars",
      "seaB",
      "kraken-tail",
      "boat",
      "seaM",
      "clouds",
      "kraken-body",
      "seaF",
      "broken-boat",
    ]);
  });
});

describe("ui text specs", () => {
  it("anchors the challenge prompt just above the hold ring", () => {
    assert.equal(CHALLENGE_PROMPT.anchorY, 1);
    assert.equal(CHALLENGE_PROMPT.at.y, ARROW_ROW.y - RING_RADIUS - 4);
  });

  it("puts the gate's prompt where Title shows its own", () => {
    assert.deepEqual({ ...GATE_PROMPT, label: TAP_PROMPT.label }, TAP_PROMPT);
    assert.equal(GATE_PROMPT.label, "gate-prompt");
  });
});
