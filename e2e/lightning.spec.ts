// Lightning in the real page: the bolt and the flash on every strike cue, the logo revealed at the reveal's flash
// peak, and the flash capped under `prefers-reduced-motion`, the screen tone kept with it (m5-plan, owner decision 9).
// Frame-stepped (game.ts `lockFrames`): 16 ms frames through each strike, 100 ms ones between, and the scene sampled
// after each frame, so the checks read what each rendered frame showed, against the cue log's times. Desktop only
// (untagged, playwright.config.ts): nothing here depends on the device. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import type { CueLogEntry } from "../src/debug-api.ts";
import { FLASH_REDUCED_PEAK } from "../src/game/lightning.ts";
import { STORY_PREAMBLE_CUES, TITLE_PROMPT_MS, TITLE_REVEAL_FLASH_MS } from "../src/game/states/timings.ts";
import { openToTitle, setFrameRendering } from "./game.ts";

// A small viewport at DPR 1: the checks read the scene, and every frame renders cheaper.
test.use({ deviceScaleFactor: 1, viewport: { width: 640, height: 400 } });

/** `Raio.anim` lasts 0.67 s and `Flash.anim` 0.5 s: past this, a strike's bolt and flash are hidden again. */
const STRIKE_MS = 700;

/** Game ms per frame through a strike, and between strikes (Pixi's cap). */
const FINE_MS = 16;
const COARSE_MS = 100;

interface Sample {
  readonly now: number;
  readonly state: string | undefined;
  readonly logo: boolean;
  readonly bolt: { readonly visible: boolean; readonly alpha: number };
  readonly flash: { readonly visible: boolean; readonly alpha: number };
  /** The screen tone's grey (screen-tone.ts). */
  readonly tone: number;
}

/** When a run of frames stops: before the first frame at which any of these holds, or after `frames` frames. */
interface Until {
  readonly frames?: number;
  /** Game ms on the clock. */
  readonly now?: number;
  /** The state is no longer this one. */
  readonly leave?: string;
}

/** Steps frames of `frameMs` until `until` holds, and samples the scene after each one. One round trip. */
const run = (page: Page, until: Until, frameMs: number) => page.evaluate(({ until, frameMs }) => {
  const lock = window.frameLock;
  const debug = window.debug;
  const samples: Sample[] = [];
  const reached = () => (until.now !== undefined && debug.clock.now >= until.now)
    || (until.leave !== undefined && debug.machine.current !== until.leave);

  if (lock === undefined) {
    throw new Error("frames aren't locked");
  }

  for (let index = 0; index < (until.frames ?? 2000) && !reached(); index++) {
    lock.step(frameMs);

    const parts = debug.scene?.parts;

    if (parts !== undefined) {
      samples.push({
        now: debug.clock.now,
        state: debug.machine.current,
        logo: parts.logo.visible,
        bolt: { visible: parts.bolt.visible, alpha: parts.bolt.alpha },
        flash: { visible: parts.flash.visible, alpha: parts.flash.alpha },
        tone: debug.flashes.tone,
      });
    }
  }

  if (until.frames === undefined && !reached()) {
    throw new Error(`never reached ${JSON.stringify(until)}`);
  }

  return samples;
}, { until, frameMs });

/** Coarse frames to just before a strike due at `at` (game ms), then fine ones through it. */
const throughStrike = async (page: Page, at: number) => [
  ...await run(page, { now: at - COARSE_MS }, COARSE_MS),
  ...await run(page, { now: at + STRIKE_MS + 100 }, FINE_MS),
];

const readCues = (page: Page) => page.evaluate(() => window.debug.cues.map((cue) => ({ ...cue })));

const readNow = (page: Page) => page.evaluate(() => window.debug.clock.now);

/** The frames from `from` (inclusive) to `to` (exclusive), in game ms. */
const between = (samples: readonly Sample[], from: number, to: number) =>
  samples.filter((sample) => sample.now >= from && sample.now < to);

const peak = (samples: readonly Sample[], part: "bolt" | "flash") =>
  Math.max(0, ...samples.filter((sample) => sample[part].visible).map((sample) => sample[part].alpha));

/**
 * Each strike shows the bolt and the flash, the flash peaking at `flashPeak` at most, then hides both until the next
 * one. The bolt's flickers peak for under 0.1 s: 16 ms frames catch them.
 */
const expectStrikes = (cues: readonly CueLogEntry[], samples: readonly Sample[], flashPeak: number) => {
  cues.forEach((cue, index) => {
    const during = between(samples, cue.time, cue.time + STRIKE_MS);
    const after = between(samples, cue.time + STRIKE_MS, cues[index + 1]?.time ?? Infinity);

    expect(during.length, `frames during the strike at ${cue.at}`).toBeGreaterThan(20);
    expect(peak(during, "bolt"), `bolt peak at ${cue.at}`).toBeGreaterThan(0.5);
    expect(peak(during, "flash"), `flash peak at ${cue.at}`).toBeGreaterThan(flashPeak * 0.9);
    expect(peak(during, "flash"), `flash peak at ${cue.at}`).toBeLessThanOrEqual(flashPeak + 1e-6);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((sample) => !sample.bolt.visible && !sample.flash.visible), `hidden after ${cue.at}`).toBe(true);
  });
};

// One game: the intro under reduced motion, then the story with it turned off again.
test("Title strikes and reveals the logo at the flash peak, capped by reduced motion; then the story strikes", async ({
  page,
}) => {
  // The OS setting, before the page loads; the scene reads the media query at each strike, so the switch below counts.
  await page.emulateMedia({ reducedMotion: "reduce" });

  const enteredAt = await openToTitle(page);

  await setFrameRendering(page, false);
  const samples: Sample[] = [];

  // Title's three intro strikes, the last the logo's reveal.
  for (const at of [2000, 3250, 5250]) {
    samples.push(...await throughStrike(page, enteredAt + at));
  }

  const cues = (await readCues(page)).filter((cue) => cue.state === "title");

  expect(cues.map(({ name, at }) => ({ name, at: Math.round(at) }))).toEqual([
    { name: "lightning", at: 2000 },
    { name: "lightning", at: 3250 },
    { name: "title-reveal", at: 5250 },
  ]);

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
  expect(after[0].flash.alpha).toBeGreaterThan(0.6 * FLASH_REDUCED_PEAK);

  // Reduced motion caps the flash's peak, the reveal's included, and leaves the bolt.
  expectStrikes(cues, samples, FLASH_REDUCED_PEAK);

  // And keeps the screen tone (owner decision 9), capped with the flash: grey at its alpha, black without it.
  const lit = samples.filter((sample) => sample.flash.visible && sample.flash.alpha > 0);

  expect(lit.length).toBeGreaterThan(20);
  expect(lit.every((sample) => sample.tone === sample.flash.alpha)).toBe(true);
  expect(Math.max(...lit.map((sample) => sample.tone))).toBeGreaterThan(0.9 * FLASH_REDUCED_PEAK);
  expect(Math.max(...samples.map((sample) => sample.tone))).toBeLessThanOrEqual(FLASH_REDUCED_PEAK + 1e-6);
  expect(samples.filter((sample) => !sample.flash.visible).every((sample) => sample.tone === 0)).toBe(true);

  // Turned off while the game runs: the next strikes flash in full. The tap at the prompt, then the exit fade.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await run(page, { now: enteredAt + TITLE_PROMPT_MS + COARSE_MS }, COARSE_MS);
  await page.keyboard.press("Space");
  await run(page, { leave: "title" }, COARSE_MS);

  // Part 0's preamble strike: its enter time is within a coarse frame before now.
  const storyAt = await readNow(page);
  const story = await throughStrike(page, storyAt + STORY_PREAMBLE_CUES[0].at - COARSE_MS);

  // The pages, a tap per 300 ms (past the 200 ms debounce), until the transition, then fine frames through its strike
  // at 167 ms.
  for (let guard = 0; guard < 300 && (await page.evaluate(() => window.debug.machine.current)) === "story"; guard++) {
    await page.keyboard.press("Space");
    story.push(...await run(page, { frames: 3, leave: "story" }, COARSE_MS));
  }

  story.push(...await run(page, { now: (await readNow(page)) + 167 + STRIKE_MS + 100 }, FINE_MS));

  const later = (await readCues(page)).filter((cue) => cue.state !== "title");

  expect(later.map(({ name, state, at }) => ({ name, state, at: Math.round(at) }))).toEqual([
    { name: "lightning", state: "story", at: 1250 },
    { name: "lightning", state: "transition", at: 167 },
  ]);
  expectStrikes(later, story, 1);
});
