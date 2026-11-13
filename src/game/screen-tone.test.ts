import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ColorSource } from "pixi.js";
import { createScreenTone, toneGrey } from "./screen-tone.ts";

describe("toneGrey", () => {
  it("is white at the flash's alpha over black: the alpha itself, clamped to 0..1", () => {
    assert.deepEqual([0, 0.25, 0.4, 1].map(toneGrey), [0, 0.25, 0.4, 1]);
    assert.deepEqual([-0.1, 1.2, Number.NaN].map(toneGrey), [0, 1, 0]);
  });
});

const setUp = (shown = true) => {
  const colors: ColorSource[] = [];
  const background = {
    set color(value: ColorSource) {
      colors.push(value);
    },
  };
  const flash = { visible: false, alpha: 0 };
  const state = { built: true, shown, paused: false };
  const tone = createScreenTone({
    background,
    flash: () => (state.built ? flash : undefined),
    shown: () => state.shown,
    paused: () => state.paused,
  });

  return { colors, flash, state, tone };
};

describe("createScreenTone", () => {
  it("sets the clear colour to grey a while the flash shows, black once it hides, only on a change", () => {
    const { colors, flash, tone } = setUp();

    tone.sync();
    assert.deepEqual(colors, []);

    flash.visible = true;
    flash.alpha = 0.6;
    tone.sync();
    tone.sync();
    assert.equal(tone.grey, 0.6);
    flash.alpha = 1;
    tone.sync();
    flash.visible = false;
    tone.sync();
    assert.equal(tone.grey, 0);
    assert.deepEqual(colors, [[0.6, 0.6, 0.6], [1, 1, 1], [0, 0, 0]]);
  });

  it("stays black without a scene, and while it isn't shown (\"reduce flashes\"), read live", () => {
    const { colors, flash, state, tone } = setUp(false);

    flash.visible = true;
    flash.alpha = 0.4;
    tone.sync();
    assert.equal(tone.grey, 0);

    state.shown = true;
    tone.sync();
    assert.equal(tone.grey, 0.4);

    state.built = false;
    tone.sync();
    assert.equal(tone.grey, 0);
    assert.deepEqual(colors, [[0.4, 0.4, 0.4], [0, 0, 0]]);
  });

  it("while paused mid-flash, goes black when hidden but doesn't re-light until the resume", () => {
    const { colors, flash, state, tone } = setUp();

    flash.visible = true;
    flash.alpha = 0.5;
    tone.sync();
    state.paused = true;

    for (let tap = 0; tap < 3; tap++) {
      state.shown = false;
      tone.sync();
      state.shown = true;
      tone.sync();
    }

    assert.equal(tone.grey, 0, "the frozen flash stays dark however often it's toggled");
    state.paused = false;
    tone.sync();
    assert.equal(tone.grey, 0.5, "the resume reads the toggle again");
    assert.deepEqual(colors, [[0.5, 0.5, 0.5], [0, 0, 0], [0.5, 0.5, 0.5]]);
  });
});
