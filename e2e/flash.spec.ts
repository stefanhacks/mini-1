// The screen tone and the "reduce flashes" toggle in the real page (m5-plan deliverable 3, owner decisions 7–9): the
// letterbox flashes with the square, grey `a` at the flash's alpha `a`, and the square's own pixels don't change with
// it; with the toggle on, the letterbox stays black and the flash peaks at FLASH_REDUCED_PEAK, after a reload too.
// Frame-stepped like particles.spec: an init script holds every requestAnimationFrame and the test runs Pixi's ticker
// itself, reading the canvas right after each frame renders. The toggle's tap path is `@tap` (desktop and iPhone).
// Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { FLASH_REDUCED_PEAK } from "../src/game/lightning.ts";
import { openGame, SEED, waitFrames } from "./game.ts";

declare global {
  interface Window {
    frameLock?: { held: Map<number, FrameRequestCallback>; time: number; started: boolean };
  }
}

/** Holds every requestAnimationFrame callback: Pixi's ticker runs only when the test steps it. */
const lockFrames = (page: Page) => page.addInitScript(() => {
  const held = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  window.frameLock = { held, time: 0, started: false };
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;

    held.set(id, callback);

    return id;
  };
  window.cancelAnimationFrame = (id) => {
    held.delete(id);
  };
});

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
 * Runs `frames` ticker frames of 16 game ms, each followed by the other held callbacks, and reads the canvas right
 * after each one renders (WebGL's drawing buffer is still there within the task). At the first frame whose flash is
 * above `compareAbove`, the stage is drawn a second time with a black clear colour, to compare the square's pixels.
 */
const run = (page: Page, frames: number, compareAbove = Infinity) => page.evaluate(({ frames, compareAbove }) => {
  const lock = window.frameLock;
  const debug = window.debug;
  const { app } = debug;
  const { ticker } = app;

  if (lock === undefined) {
    throw new Error("frames aren't locked");
  }

  if (!lock.started) {
    lock.started = true;
    ticker.lastTime = 0;
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

  for (let index = 0; index < frames; index++) {
    lock.time += 16;
    ticker.update(lock.time);

    const pending = [...lock.held.entries()];

    lock.held.clear();

    for (const [id, callback] of pending) {
      // Pixi's own frame request stays held, for the next step.
      if (callback === (ticker as unknown as { _tick: FrameRequestCallback })._tick) {
        lock.held.set(id, callback);
      } else {
        callback(lock.time);
      }
    }

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
}, { frames, compareAbove });

const openToTitle = async (page: Page) => {
  await lockFrames(page);
  await page.goto(`/?debug&seed=${SEED}&timescale=1`);
  await page.waitForFunction(() => window.debug?.scene !== undefined && window.debug.gate.progress === 1, undefined, {
    polling: 50,
    timeout: 45_000,
  });

  for (let attempt = 0; attempt < 200 && (await page.evaluate(() => window.debug.gate.phase)) !== "ready"; attempt++) {
    await run(page, 1);
    await page.waitForTimeout(10);
  }

  await page.keyboard.press("Space");
  await run(page, 1);
  expect(await page.evaluate(() => window.debug.machine.current)).toBe("title");
};

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

  test("the letterbox follows the flash and the square doesn't change; reduce flashes keeps it black, after reload",
    async ({ page }) => {
      await openToTitle(page);

      // Title's first strike, at 2 s: every frame's letterbox is the flash's alpha in grey, within a level.
      const full = await run(page, 170, 0.8);
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

      // Reduce flashes, by a click on the toggle (the router's mouse path), before the strike at 3.25 s.
      const centre = await flashesCentre(page);

      await page.mouse.click(centre.x, centre.y);
      expect(await page.evaluate(() => window.debug.flashes.reduced)).toBe(true);

      const reduced = strikeFrames(await run(page, 80));
      const peak = Math.max(...reduced.map((sample) => sample.flash));

      expect(reduced.length).toBeGreaterThan(20);
      expect(peak).toBeGreaterThan(0.9 * FLASH_REDUCED_PEAK);
      expect(peak).toBeLessThanOrEqual(FLASH_REDUCED_PEAK + 1e-6);
      expect(reduced.every((sample) => sample.letterbox === 0 && sample.tone === 0)).toBe(true);
      expect(await page.evaluate(() => window.debug.machine.current)).toBe("title");

      // Stored: after a reload, Title's first strike is capped and the letterbox stays black.
      await page.reload();
      await openToTitle(page);
      expect(await page.evaluate(() => window.debug.flashes.reduced)).toBe(true);

      const reloaded = strikeFrames(await run(page, 170));

      expect(reloaded.length).toBeGreaterThan(20);
      expect(Math.max(...reloaded.map((sample) => sample.flash))).toBeLessThanOrEqual(FLASH_REDUCED_PEAK + 1e-6);
      expect(reloaded.every((sample) => sample.letterbox === 0)).toBe(true);
    });
});

const hasTouch = () => test.info().project.use.hasTouch === true;

const tapAt = async (page: Page, x: number, y: number) => {
  if (hasTouch()) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
};

const readToggle = (page: Page) => page.evaluate(() => ({
  reduced: window.debug.flashes.reduced,
  state: window.debug.machine.current,
  paused: window.debug.pause.paused,
}));

// On the iPhone, a real touch sequence (playwright.config.ts).
test("a tap on the reduce-flashes toggle only toggles it, paused or not", { tag: "@tap" }, async ({ page }) => {
  await openGame(page);

  const centre = await flashesCentre(page);

  await tapAt(page, centre.x, centre.y);
  await expect.poll(() => readToggle(page)).toEqual({ reduced: true, state: "title", paused: false });
  // A stray advance would leave Title.
  await waitFrames(page);
  expect(await readToggle(page)).toEqual({ reduced: true, state: "title", paused: false });

  // While paused it still only toggles: the game stays paused.
  await page.evaluate(() => window.debug.pause.pause());
  await tapAt(page, centre.x, centre.y);
  await expect.poll(() => readToggle(page)).toEqual({ reduced: false, state: "title", paused: true });
  await waitFrames(page);
  expect(await readToggle(page)).toEqual({ reduced: false, state: "title", paused: true });
});
