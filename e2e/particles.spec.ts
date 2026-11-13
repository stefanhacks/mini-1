// The weather in the real page (m5-plan, deliverables 1–2): rain, splashes and bubbles fall on Title, drawn in the
// world layer at their sortingOrder rows, on pools that never grow over replays, and the same seed gives the same
// weather; with `?debug&eyes=always`, an eye in part 0's preamble, before the text box. Frame-stepped (game.ts
// `lockFrames`): an init script holds every requestAnimationFrame and the test runs Pixi's ticker itself. Desktop only
// (untagged, playwright.config.ts): nothing here depends on the device. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { ENDING_MS } from "../src/game/states/timings.ts";
import { openToTitle, setFrameRendering, stepFrames } from "./game.ts";

test.use({ deviceScaleFactor: 1, viewport: { width: 640, height: 400 } });

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
    tickerListeners: window.debug.counts.tickerListeners,
    layoutListeners: window.debug.counts.layoutListeners,
  };
});

/**
 * Steps part 0's preamble in 100 ms frames, up to its first page: whether an eye showed in it, and whether one still
 * showed once the page was up.
 */
const stepPreamble = (page: Page) => page.evaluate(() => {
  const { debug, frameLock } = window;
  const eyeShown = () => ["eye-small", "eye-large"].some((label) => {
    const eye = debug.layers.world.getChildByLabel(label);

    return eye !== null && eye.visible && eye.alpha > 0;
  });
  let before = false;

  if (frameLock === undefined) {
    throw new Error("frames aren't locked");
  }

  for (let index = 0; index < 40 && debug.game.page === null; index++) {
    frameLock.step(100);
    before ||= debug.game.page === null && eyeShown();
  }

  return { before, onPage: debug.game.page !== null && eyeShown(), eyes: debug.scene?.weather.stats.eyes ?? 0 };
});

test("the weather falls from Title on, on pools that don't grow, the same for the same seed; eyes=always", async ({
  page,
}) => {
  await openToTitle(page, "&eyes=always");
  await setFrameRendering(page, false);
  await stepFrames(page, 30);

  const title = await readWeather(page);

  expect(title.order).toEqual(["tentacles", "pillars", "seaB", "kraken-tail", "boat", "seaM", "clouds", "clouds-2",
    "splash", "kraken-body", "rain", "seaF", "bubbles", "eye-small", "eye-large", "broken-boat"]);
  // Prewarmed: the rain at its steady state from Title's first frame, splashes on the sea, a couple of bubbles.
  expect(title.rain.live).toBeGreaterThan(120);
  expect(title.splash.live).toBeGreaterThan(60);
  expect(title.bubbles.live).toBeGreaterThanOrEqual(1);
  expect([title.rain.onGrid, title.splash.onGrid, title.bubbles.onGrid]).toEqual([true, true, true]);
  expect([title.rain.size, title.splash.size, title.bubbles.size]).toEqual([224, 256, 32]);

  // `?debug&eyes=always`, end to end: an eye in part 0's preamble, a window between pages, gone once the page shows.
  await page.evaluate(() => window.debug.machine.request("story"));

  const preamble = await stepPreamble(page);

  expect(preamble).toEqual({ before: true, onPage: false, eyes: 1 });
  await page.evaluate(() => window.debug.machine.request("title"));
  await stepFrames(page, 10);

  for (let replay = 0; replay < 3; replay++) {
    // The ending's kraken stops the bubbles, which fade out with it; the rain falls on.
    await page.evaluate(() => window.debug.machine.request("ending"));
    await stepFrames(page, Math.ceil((ENDING_MS.kraken + 1100) / 100), 100);

    const ending = await readWeather(page);

    expect(ending.bubbles.live, `replay ${replay}`).toBe(0);
    expect(ending.rain.live).toBeGreaterThan(120);

    // A new game restarts the weather.
    await page.evaluate(() => window.debug.machine.request("title"));
    await stepFrames(page, 10);

    const back = await readWeather(page);

    expect(back.bubbles.live, `replay ${replay}`).toBeGreaterThanOrEqual(1);
    expect(back.rain.live).toBeGreaterThan(120);
    expect([back.worldChildren, back.rain.size, back.splash.size, back.bubbles.size])
      .toEqual([title.worldChildren, 224, 256, 32]);
    // Nothing a replay adds is left behind on the ticker or the layout.
    expect([back.tickerListeners, back.layoutListeners]).toEqual([title.tickerListeners, title.layoutListeners]);
    expect(back.stats.dropped).toBe(0);
  }

  // The same seed gives the same weather, on the same page load. Without the boat, which bobs on the clock: drops that
  // hit it would depend on when each run starts.
  await page.evaluate(() => {
    const boat = window.debug.layers.world.getChildByLabel("boat");

    if (boat !== null) {
      boat.visible = false;
    }
  });

  const weatherFrom = async (seed: number) => {
    await page.evaluate((value) => window.debug.scene?.startWeather(value), seed);
    await stepFrames(page, 45);

    const { rain, splash, bubbles } = await readWeather(page);

    return [rain.positions, splash.positions, bubbles.positions];
  };

  const first = await weatherFrom(7);

  expect(first[0].length).toBeGreaterThan(0);
  expect(await weatherFrom(7)).toEqual(first);
  expect(await weatherFrom(8)).not.toEqual(first);
});
