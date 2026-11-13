// The screen tone and the "reduce flashes" toggle in the real page (m5-plan deliverable 3, owner decisions 7–9): the
// letterbox flashes with the square, grey `a` at the flash's alpha `a`, and the square's own pixels don't change with
// it; with the toggle on, the letterbox stays black and the flash peaks at FLASH_REDUCED_PEAK. Frame-stepped (game.ts
// `lockFrames`): an init script holds every requestAnimationFrame and the test runs Pixi's ticker itself, reading the
// canvas right after each frame renders. The toggle's tap path and its reload are in gate.spec.ts. Written by Claude
// Code.
import { expect, test, type Page } from "@playwright/test";
import { FLASH_REDUCED_PEAK } from "../src/game/lightning.ts";
import { openToTitle } from "./game.ts";

interface FlashFrame {
  readonly now: number;
  readonly flash: number;
  readonly tone: number;
  /** The letterbox's red channel, 0..255, under the square. */
  readonly letterbox: number;
  /** At the first frame past `compareAbove`: whether the square's pixels match a render with a black clear colour. */
  readonly squareUnchanged?: boolean;
  /** The letterbox's red channel in that black-cleared render. */
  readonly blackLetterbox?: number;
}

/**
 * Runs locked frames until the clock reaches `until` (game ms), `frameMs` each, and reads the canvas right after each
 * one renders (WebGL's drawing buffer is still there within the task). At the first frame whose flash is above
 * `compareAbove`, the stage is drawn a second time with a black clear colour, to compare the square's pixels.
 */
const run = (page: Page, until: number, frameMs = 16, compareAbove = Infinity) => page.evaluate(({
  until,
  frameMs,
  compareAbove,
}) => {
  const lock = window.frameLock;
  const debug = window.debug;
  const { app } = debug;

  if (lock === undefined) {
    throw new Error("frames aren't locked");
  }

  const { square, dpr } = debug.layout;

  if (square.y + square.height >= app.canvas.height / dpr - 3) {
    throw new Error("no letterbox under the square");
  }
  const probe = document.createElement("canvas");

  probe.width = app.canvas.width;
  probe.height = app.canvas.height;

  const context = probe.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    throw new Error("no 2d context");
  }

  const read = () => {
    context.drawImage(app.canvas, 0, 0);

    return context;
  };
  // The canvas's bottom-left corner: in portrait the square sits at the top, and the pad below keeps clear of it.
  const letterboxAt = { x: 2, y: app.canvas.height - 3 };
  const box = {
    x: Math.round(square.x * dpr),
    y: Math.round(square.y * dpr),
    width: Math.round(square.width * dpr),
    height: Math.round(square.height * dpr),
  };
  // One pixel, copied alone: most frames read nothing else.
  const letterbox = () => {
    context.drawImage(app.canvas, letterboxAt.x, letterboxAt.y, 1, 1, 0, 0, 1, 1);

    return context.getImageData(0, 0, 1, 1).data[0] ?? -1;
  };
  const squarePixels = () => read().getImageData(box.x, box.y, box.width, box.height).data;
  const samples: FlashFrame[] = [];
  let compared = false;

  for (let index = 0; index < 1000 && debug.clock.now < until; index++) {
    lock.step(frameMs);

    const flash = debug.scene?.parts.flash;
    const alpha = flash?.visible === true ? flash.alpha : 0;
    const sample: FlashFrame = {
      now: debug.clock.now,
      flash: alpha,
      tone: debug.flashes.tone,
      letterbox: letterbox(),
    };

    if (!compared && alpha > compareAbove) {
      compared = true;

      const toned = squarePixels();
      const { background } = app.renderer;
      const grey = background.color.toArray();

      background.color = 0x000000;
      app.render();

      const black = squarePixels();
      const blackLetterbox = letterbox();

      background.color = grey;
      app.render();
      samples.push({
        ...sample,
        squareUnchanged: toned.length === black.length && toned.every((value, at) => value === black[at]),
        blackLetterbox,
      });
    } else {
      samples.push(sample);
    }
  }

  return samples;
}, { until, frameMs, compareAbove });

/** The frames that show a flash. */
const strikeFrames = (samples: readonly FlashFrame[]) => samples.filter((sample) => sample.flash > 0);

const flashesCentre = async (page: Page) => {
  const rect = await page.evaluate(() => window.debug.router.flashesRect);

  if (rect === null) {
    throw new Error("no reduce-flashes button");
  }

  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

test.describe("frame-locked", () => {
  // Portrait at DPR 1: the letterbox above the square is large, and every stepped frame renders cheaply.
  test.use({ deviceScaleFactor: 1, viewport: { width: 360, height: 640 } });

  test("the letterbox follows the flash and the square doesn't change; reduce flashes keeps it black", async ({
    page,
  }) => {
    const enteredAt = await openToTitle(page);

    // Title's first strike, at 2 s: 100 ms frames up to it, then 16 ms ones. Every frame's letterbox is the flash's
    // alpha in grey, within a level.
    await run(page, enteredAt + 1900, 100);

    const full = await run(page, enteredAt + 2700, 16, 0.8);
    const lit = strikeFrames(full);

    expect(full.every((sample) => sample.flash > 0 || (sample.letterbox === 0 && sample.tone === 0))).toBe(true);
    expect(lit.length).toBeGreaterThan(20);
    expect(Math.max(...lit.map((sample) => sample.flash))).toBeGreaterThan(0.95);

    for (const sample of lit) {
      expect(sample.tone, `tone at ${sample.now}`).toBe(sample.flash);
      expect(Math.abs(sample.letterbox - sample.flash * 255), `letterbox at ${sample.now}`).toBeLessThanOrEqual(1);
    }

    const compared = lit.find((sample) => sample.squareUnchanged !== undefined);

    expect(compared?.letterbox).toBeGreaterThan(200);
    expect(compared?.blackLetterbox).toBe(0);
    expect(compared?.squareUnchanged).toBe(true);

    // Reduce flashes, by a click on the toggle (the router's mouse path), before the strike at 3.25 s. Its tap path,
    // and the setting kept over a reload, are in gate.spec.ts.
    const centre = await flashesCentre(page);

    await page.mouse.click(centre.x, centre.y);
    expect(await page.evaluate(() => window.debug.flashes.reduced)).toBe(true);
    await run(page, enteredAt + 3150, 100);

    const reduced = strikeFrames(await run(page, enteredAt + 4000));
    const peak = Math.max(...reduced.map((sample) => sample.flash));

    expect(reduced.length).toBeGreaterThan(20);
    expect(peak).toBeGreaterThan(0.9 * FLASH_REDUCED_PEAK);
    expect(peak).toBeLessThanOrEqual(FLASH_REDUCED_PEAK + 1e-6);
    expect(reduced.every((sample) => sample.letterbox === 0 && sample.tone === 0)).toBe(true);
    expect(await page.evaluate(() => window.debug.machine.current)).toBe("title");
  });
});
