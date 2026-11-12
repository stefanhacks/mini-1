// The weather in the real page (m5-plan, deliverables 1–2): rain, splashes and bubbles fall on Title, drawn in the
// world layer at their sortingOrder rows, on pools that never grow over replays, and the same seed gives the same
// weather. Frame-stepped like motion.spec: an init script holds every requestAnimationFrame and the test runs Pixi's
// ticker itself. Desktop only (untagged, playwright.config.ts): nothing here depends on the device.
// Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { ENDING_MS } from "../src/game/states/timings.ts";
import { SEED } from "./game.ts";

test.use({ deviceScaleFactor: 1, viewport: { width: 640, height: 400 } });

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

/** Runs `frames` ticker frames of `frameMs` game ms each (Pixi caps a frame at 100), with the other held callbacks. */
const step = (page: Page, frames: number, frameMs = 16) => page.evaluate(({ frames, frameMs }) => {
  const lock = window.frameLock;
  const { ticker } = window.debug.app;

  if (lock === undefined) {
    throw new Error("frames aren't locked");
  }

  if (!lock.started) {
    lock.started = true;
    ticker.lastTime = 0;
  }

  for (let index = 0; index < frames; index++) {
    lock.time += frameMs;
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
  }
}, { frames, frameMs });

/** The weather's containers and what they show: pool sizes, live particles, and the live ones' positions. */
const readWeather = (page: Page) => page.evaluate(() => {
  type Pool = { particleChildren: { x: number; y: number; alpha: number }[] };
  const { layers, scene } = window.debug;
  const pool = (label: string) => {
    const container = layers.world.getChildByLabel(label) as unknown as Pool | null;

    if (container === null || scene === undefined) {
      throw new Error(`no ${label}`);
    }

    const live = container.particleChildren.filter((particle) => particle.alpha > 0);

    return {
      size: container.particleChildren.length,
      live: live.length,
      onGrid: live.every((particle) => Number.isInteger(particle.x) && Number.isInteger(particle.y)),
      positions: live.map((particle) => `${particle.x},${particle.y}`).sort().join(" "),
    };
  };

  return {
    order: layers.world.children.map((child) => child.label),
    worldChildren: layers.world.children.length,
    rain: pool("rain"),
    splash: pool("splash"),
    bubbles: pool("bubbles"),
    stats: { ...scene?.weather.stats },
  };
});

const openToTitle = async (page: Page) => {
  await lockFrames(page);
  await page.goto(`/?debug&seed=${SEED}&timescale=1`);
  await page.waitForFunction(() => window.debug?.scene !== undefined && window.debug.gate.progress === 1, undefined, {
    polling: 50,
    timeout: 45_000,
  });

  for (let attempt = 0; attempt < 200 && (await page.evaluate(() => window.debug.gate.phase)) !== "ready"; attempt++) {
    await step(page, 1);
    await page.waitForTimeout(10);
  }

  await page.keyboard.press("Space");
  await step(page, 1);
  expect(await page.evaluate(() => window.debug.machine.current)).toBe("title");
};

test("rain, splashes and bubbles fall from Title on, on fixed pools that don't grow over replays", async ({ page }) => {
  await openToTitle(page);
  await step(page, 30);

  const title = await readWeather(page);

  expect(title.order).toEqual(["tentacles", "pillars", "seaB", "kraken-tail", "boat", "seaM", "clouds", "clouds-2",
    "splash", "kraken-body", "rain", "seaF", "bubbles", "eye-small", "eye-large", "broken-boat"]);
  // Prewarmed: the rain at its steady state from Title's first frame, splashes on the sea, a couple of bubbles.
  expect(title.rain.live).toBeGreaterThan(120);
  expect(title.splash.live).toBeGreaterThan(60);
  expect(title.bubbles.live).toBeGreaterThanOrEqual(1);
  expect([title.rain.onGrid, title.splash.onGrid, title.bubbles.onGrid]).toEqual([true, true, true]);
  expect([title.rain.size, title.splash.size, title.bubbles.size]).toEqual([224, 256, 32]);

  for (let replay = 0; replay < 3; replay++) {
    // The ending's kraken stops the bubbles, which fade out with it; the rain falls on.
    await page.evaluate(() => window.debug.machine.request("ending"));
    await step(page, Math.ceil((ENDING_MS.kraken + 1100) / 100), 100);

    const ending = await readWeather(page);

    expect(ending.bubbles.live, `replay ${replay}`).toBe(0);
    expect(ending.rain.live).toBeGreaterThan(120);

    // A new game restarts the weather.
    await page.evaluate(() => window.debug.machine.request("title"));
    await step(page, 10);

    const back = await readWeather(page);

    expect(back.bubbles.live, `replay ${replay}`).toBeGreaterThanOrEqual(1);
    expect(back.rain.live).toBeGreaterThan(120);
    expect([back.worldChildren, back.rain.size, back.splash.size, back.bubbles.size])
      .toEqual([title.worldChildren, 224, 256, 32]);
    expect(back.stats.dropped).toBe(0);
  }
});

test("the same seed gives the same weather", async ({ page }) => {
  await openToTitle(page);

  // Without the boat, which bobs on the clock: drops that hit it would depend on when each run starts.
  await page.evaluate(() => {
    const boat = window.debug.layers.world.getChildByLabel("boat");

    if (boat !== null) {
      boat.visible = false;
    }
  });

  const weatherFrom = async (seed: number) => {
    await page.evaluate((value) => window.debug.scene?.startWeather(value), seed);
    await step(page, 45);

    const { rain, splash, bubbles } = await readWeather(page);

    return [rain.positions, splash.positions, bubbles.positions];
  };

  const first = await weatherFrom(7);

  expect(first[0].length).toBeGreaterThan(0);
  expect(await weatherFrom(7)).toEqual(first);
  expect(await weatherFrom(8)).not.toEqual(first);
});
