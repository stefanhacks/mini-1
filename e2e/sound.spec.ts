// Sound cues, music per story part, and the audio lifecycle with "Tap to continue" (m3-plan, deliverables 3, 5, 6).
// Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { createRng, seedFromString } from "../src/game/challenges/rng.ts";
import { ambientDelay } from "../src/game/states/cues.ts";
import { TITLE_AMBIENT, TITLE_CUES } from "../src/game/states/timings.ts";
import { AMBIENT_SALT } from "../src/game/states/title.ts";
import { keyboardDriver, openGame, playGame, readGame, readLayout, SEED, type GameSnapshot } from "./game.ts";

const POLL = { intervals: [20, 50, 100], timeout: 15_000 };

/** Long enough for a pending overlay change to reach its bar (9.6 s), with room for a busy machine. */
const BAR_POLL = { intervals: [100, 200, 300], timeout: 25_000 };

const hasTouch = () => test.info().project.use.hasTouch === true;

const readCues = (page: Page) => page.evaluate(() => window.debug.cues);

const readAudio = (page: Page) => page.evaluate(() => window.debug.audio.debug);

/** Emulates the tab being hidden or shown: `visibilityState` overridden, then the `visibilitychange` event. */
const setHidden = (page: Page, hidden: boolean, dispatch = true) => page.evaluate(([hide, send]) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hide ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hide });

  if (send) {
    document.dispatchEvent(new Event("visibilitychange"));
  }
}, [hidden, dispatch] as const);

/** Whether "Tap to continue" is drawn, read from the ui layer. */
const promptOnScreen = (page: Page) => page.evaluate(() => {
  const container = window.debug.layers.ui.getChildByLabel("continue");
  const text = container?.getChildByLabel("continue-prompt") as { text?: string } | null | undefined;

  return container?.visible === true ? text?.text ?? "" : null;
});

/** Records the DOM event type of every `AudioContext.resume()` call. */
const recordResumes = (page: Page) => page.addInitScript(() => {
  const calls: (string | null)[] = [];
  const proto = AudioContext.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "resume")?.value as (this: AudioContext) => Promise<void>;

  (window as unknown as { resumeEvents: typeof calls }).resumeEvents = calls;
  proto.resume = function resume(this: AudioContext) {
    calls.push(window.event?.type ?? null);

    return original.call(this);
  };
});

const readResumeEvents = (page: Page) =>
  page.evaluate(() => (window as unknown as { resumeEvents: (string | null)[] }).resumeEvents);

const tapPlayfield = async (page: Page) => {
  const { square } = await readLayout(page);
  const x = square.x + square.width / 2;
  const y = square.y + square.height / 2;

  if (hasTouch()) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
};

/** Title's cues for the first e2e game, from its seed, as the original's timer would strike them. */
const expectedTitleCues = (count: number) => {
  const rng = createRng((seedFromString(String(SEED)) ^ AMBIENT_SALT) >>> 0);
  const cues = TITLE_CUES.map(({ name, at }) => ({ name, at }));
  let at = TITLE_AMBIENT.from + ambientDelay(rng, true);

  while (cues.length < count) {
    cues.push({ name: "lightning", at });
    at += ambientDelay(rng, false);
  }

  return cues;
};

test("a game plays its cues at the plan's times, and each part's music on a bar", async ({ page, isMobile }) => {
  // A game that waits for every part's bar: about 40 s of wall time. The music and the clock don't depend on the
  // device, so one project is enough.
  test.skip(isMobile, "desktop only");
  test.setTimeout(150_000);

  await openGame(page);

  // At FAST time the intro takes ~0.2 s of wall time; a second more gives several ambient strikes.
  await expect.poll(async () => (await readCues(page)).length, POLL).toBeGreaterThanOrEqual(6);

  const title = (await readCues(page)).filter((cue) => cue.state === "title");

  const expected = expectedTitleCues(title.length);

  // `at` is clock.now minus the enter time: whole ms, give or take float error on a long-running clock.
  expect(title.map(({ name, at }) => ({ name, at: Math.round(at) }))).toEqual(expected);
  title.forEach((cue, index) => expect(cue.at).toBeCloseTo(expected[index]?.at ?? Number.NaN, 6));

  // The log's clock times agree with the timeline times: one Title enter for all of them.
  for (const cue of title) {
    expect(cue.time - cue.at).toBeCloseTo((title[0]?.time ?? 0) - (title[0]?.at ?? 0), 6);
  }

  // Before each part's first page, wait for its overlay to have started, so every part's music plays.
  let waitedFor = -1;
  const waitForPartMusic = async (game: GameSnapshot) => {
    if (game.part === waitedFor) {
      return;
    }

    waitedFor = game.part;
    await expect.poll(async () => {
      const overlay = (await readAudio(page)).overlay;

      return overlay !== null && overlay.part === game.part && !overlay.pending;
    }, BAR_POLL).toBe(true);
  };

  await playGame(page, await keyboardDriver(page), waitForPartMusic);

  const game = (await readCues(page)).filter((cue) => cue.state !== "title").map(({ name, state, at }) => ({
    name,
    state,
    at: Math.round(at),
  }));

  expect(game).toEqual([
    { name: "lightning", state: "story", at: 1250 },
    { name: "lightning", state: "transition", at: 167 },
    { name: "lightning", state: "transition", at: 167 },
    { name: "lightning", state: "transition", at: 167 },
    { name: "kraken", state: "ending", at: 1500 },
  ]);
  expect((await readGame(page)).games).toBe(2);

  const audio = await readAudio(page);
  const anchor = audio.barAnchor ?? Number.NaN;

  expect(audio.overlayStarts.length).toBeGreaterThanOrEqual(4);

  for (const start of audio.overlayStarts) {
    expect(Math.abs(start.bars - Math.round(start.bars))).toBeLessThan(1e-6);
    expect(start.time).toBeCloseTo(anchor + Math.round(start.bars) * audio.bar, 6);
  }

  // One key per part, in order (overlayPhase04 restarts on every bar, so it can repeat).
  const keys = audio.overlayStarts.map((start) => start.key).filter((key, index, all) => key !== all[index - 1]);

  expect(keys).toEqual(["overlayPhase02", "overlayPhase03", "overlayPhase04", "bgm02"]);
  expect(audio.storyPart).toBe(3);
});

test("a hidden tab suspends audio, and showing it again resumes it", async ({ page }) => {
  await openGame(page);
  expect((await readAudio(page)).contextState).toBe("running");

  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  expect(await promptOnScreen(page)).toBeNull();

  await setHidden(page, false);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("running");
  await page.waitForTimeout(500);
  expect(await promptOnScreen(page)).toBeNull();
  expect((await readGame(page)).state).toBe("title");
});

test("a failed resume shows Tap to continue; its tap resumes audio without advancing, and mute still works", async ({
  page,
}) => {
  await recordResumes(page);
  await openGame(page);

  // The browser refuses to resume without a gesture: the engine's resume() settles false and the context stays
  // suspended, as on iOS or under a strict autoplay policy.
  await page.evaluate(() => {
    window.debug.audio.resume = () => Promise.resolve(false);
  });
  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  await setHidden(page, false);
  await expect.poll(() => promptOnScreen(page), POLL).toBe("Tap to continue");
  expect(await page.evaluate(() => window.debug.continuePrompt)).toBe(true);
  expect((await readAudio(page)).status).toBe("needs-gesture");

  // The mute button works under the prompt and doesn't dismiss it.
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(true);
  expect(await promptOnScreen(page)).toBe("Tap to continue");

  const before = (await readResumeEvents(page)).length;

  await tapPlayfield(page);
  await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  // The unlock ran inside the tap's own event.
  expect((await readResumeEvents(page)).slice(before)[0]).toBe("pointerup");
  // Give a stray advance time to land: it would leave Title.
  await page.waitForTimeout(300);
  expect((await readGame(page)).state).toBe("title");

  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(false);

  // A page restored from the bfcache takes the same path.
  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  await setHidden(page, false, false);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(() => promptOnScreen(page), POLL).toBe("Tap to continue");
  await page.keyboard.press("Space");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  await page.waitForTimeout(300);
  expect((await readGame(page)).state).toBe("title");

  // With audio running, the next tap advances as usual.
  await tapPlayfield(page);
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("story");
});
