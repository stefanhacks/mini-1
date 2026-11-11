// Lightning in the real page: the bolt and the flash on every strike cue, the logo revealed at the reveal's flash
// peak, and the flash capped under `prefers-reduced-motion`. A recorder on the ticker samples every frame after the
// game step and the clips' sync, so the checks read what each rendered frame showed, against the cue log's times.
// Desktop only: nothing here depends on the device. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import type { CueLogEntry } from "../src/debug-api.ts";
import { FLASH_REDUCED_PEAK } from "../src/game/lightning.ts";
import { TITLE_REVEAL_FLASH_MS } from "../src/game/states/timings.ts";
import { keyboardDriver, leaveTitle, readStory, SEED, waitFor, waitForGateReady } from "./game.ts";

test.use({ deviceScaleFactor: 1 });

const DESKTOP_ONLY = "lightning doesn't depend on the device";

/** `Raio.anim` lasts 0.67 s and `Flash.anim` 0.5 s: past this, a strike's bolt and flash are hidden again. */
const STRIKE_MS = 700;

const POLL = { intervals: [50, 100, 200], timeout: 30_000 };

interface Sample {
  readonly now: number;
  readonly state: string | undefined;
  readonly logo: boolean;
  readonly bolt: { readonly visible: boolean; readonly alpha: number };
  readonly flash: { readonly visible: boolean; readonly alpha: number };
}

declare global {
  interface Window {
    lightningSamples?: Sample[];
  }
}

/** Samples every frame from now on, after the frame loop's own listeners (same priority, added later). */
const startRecording = (page: Page) => page.evaluate(() => {
  const debug = window.debug;
  const samples: Sample[] = [];

  window.lightningSamples = samples;
  debug.app.ticker.add(() => {
    const parts = debug.scene?.parts;

    if (parts === undefined) {
      return;
    }

    samples.push({
      now: debug.clock.now,
      state: debug.machine.current,
      logo: parts.logo.visible,
      bolt: { visible: parts.bolt.visible, alpha: parts.bolt.alpha },
      flash: { visible: parts.flash.visible, alpha: parts.flash.alpha },
    });
  });
});

const readSamples = (page: Page) => page.evaluate(() => window.lightningSamples ?? []);

const readCues = (page: Page) => page.evaluate(() => window.debug.cues.map((cue) => ({ ...cue })));

/** The frames from `from` (inclusive) to `to` (exclusive), in game ms. */
const between = (samples: readonly Sample[], from: number, to: number) =>
  samples.filter((sample) => sample.now >= from && sample.now < to);

const peak = (samples: readonly Sample[], part: "bolt" | "flash") =>
  Math.max(0, ...samples.filter((sample) => sample[part].visible).map((sample) => sample[part].alpha));

/** Opens the game at real time (timescale 1) and taps through the gate, recording from before Title. */
const openAtRealTime = async (page: Page, reducedMotion: boolean) => {
  await page.goto(`/?debug&seed=${SEED}&timescale=1`);
  await waitForGateReady(page);

  // Set after the page loaded: the scene reads the media query at each strike, so a change while it runs counts.
  if (reducedMotion) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }

  await startRecording(page);
  await page.keyboard.press("Space");
  await waitFor(page, (game) => game.state === "title");
};

/** Waits for Title's three intro strikes and the reveal's flash to end; returns the cues and the frames. */
const recordTitleIntro = async (page: Page) => {
  await expect.poll(async () => {
    const reveal = (await readCues(page)).find((cue) => cue.name === "title-reveal");
    const now = await page.evaluate(() => window.debug.clock.now);

    return reveal !== undefined && now > reveal.time + STRIKE_MS;
  }, POLL).toBe(true);

  const cues = (await readCues(page)).filter((cue) => cue.state === "title");

  expect(cues.map(({ name, at }) => ({ name, at: Math.round(at) }))).toEqual([
    { name: "lightning", at: 2000 },
    { name: "lightning", at: 3250 },
    { name: "title-reveal", at: 5250 },
  ]);

  return { cues, samples: (await readSamples(page)).filter((sample) => sample.state === "title") };
};

/**
 * Each strike shows the bolt and the flash, the flash peaking at `flashPeak` at most, then hides both until the next
 * one. Headless Chromium can run at 15–20 fps here, and the bolt's flickers peak for under 0.1 s, so the lower bounds
 * leave room for frames that straddle a peak.
 */
const expectStrikes = (cues: readonly CueLogEntry[], samples: readonly Sample[], flashPeak: number) => {
  cues.forEach((cue, index) => {
    const during = between(samples, cue.time, cue.time + STRIKE_MS);
    const after = between(samples, cue.time + STRIKE_MS, cues[index + 1]?.time ?? Infinity);

    expect(during.length, `frames during the strike at ${cue.at}`).toBeGreaterThan(5);
    expect(peak(during, "bolt"), `bolt peak at ${cue.at}`).toBeGreaterThan(0.5);
    expect(peak(during, "flash"), `flash peak at ${cue.at}`).toBeGreaterThan(flashPeak * 0.7);
    expect(peak(during, "flash"), `flash peak at ${cue.at}`).toBeLessThanOrEqual(flashPeak + 1e-6);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((sample) => !sample.bolt.visible && !sample.flash.visible), `hidden after ${cue.at}`).toBe(true);
  });
};

test("Title strikes twice, then reveals the logo at the reveal's flash peak", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", DESKTOP_ONLY);

  await openAtRealTime(page, false);

  const { cues, samples } = await recordTitleIntro(page);
  const reveal = cues[2];
  const peakAt = reveal.time + TITLE_REVEAL_FLASH_MS;
  const before = samples.filter((sample) => sample.now < peakAt - 1);
  const after = samples.filter((sample) => sample.now > peakAt + 1);

  // Hidden from Title's first frame to the flash peak, then shown on.
  expect(before.length).toBeGreaterThan(30);
  expect(before.every((sample) => !sample.logo)).toBe(true);
  expect(after.length).toBeGreaterThan(5);
  expect(after.every((sample) => sample.logo)).toBe(true);
  // The first frame with the logo is within a frame of the flash's peak, past it.
  expect(after[0].flash.alpha).toBeGreaterThan(0.6);

  expectStrikes(cues, samples, 1);
});

test("reduced motion caps the flash's peak, and leaves the bolt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", DESKTOP_ONLY);

  await openAtRealTime(page, true);

  const { cues, samples } = await recordTitleIntro(page);

  expectStrikes(cues, samples, FLASH_REDUCED_PEAK);
  expect(samples.at(-1)?.logo).toBe(true);
});

test("story part 0's preamble and the Transition strike too", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", DESKTOP_ONLY);

  const driver = await keyboardDriver(page);

  await openAtRealTime(page, false);
  // The intro runs at FAST time (leaveTitle), the tap, the exit fade and the rest at real time.
  await leaveTitle(page, driver);
  // At real time throughout: a faster clock would sample the 0.5 s flash in a few coarse frames.
  await readStory(page, driver);
  await waitFor(page, (game) => game.state === "round");

  const transitionCue = async () => (await readCues(page)).find((cue) => cue.state === "transition");

  await expect.poll(async () => {
    const cue = await transitionCue();
    const now = await page.evaluate(() => window.debug.clock.now);

    return cue !== undefined && now > cue.time + STRIKE_MS + 100;
  }, POLL).toBe(true);

  const cues = (await readCues(page)).filter((cue) => cue.state !== "title");

  expect(cues.map(({ name, state, at }) => ({ name, state, at: Math.round(at) }))).toEqual([
    { name: "lightning", state: "story", at: 1250 },
    { name: "lightning", state: "transition", at: 167 },
  ]);
  expectStrikes(cues, await readSamples(page), 1);
});
