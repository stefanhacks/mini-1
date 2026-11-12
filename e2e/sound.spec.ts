// The audio lifecycle with "Tap to continue" (m3-plan, deliverable 6), merged with the pause in M5 (m5-plan,
// deliverable 5; the pause button is in lifecycle.spec.ts). The sound cues and the music per story part (deliverables
// 3, 5) are checked on a whole game in playthrough.spec.ts. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { openGame, readAudio, readGame, readLayout } from "./game.ts";

// A tap's pointer path doesn't depend on the DPR: at DPR 1 the software-rendered frames are several times cheaper. The
// presets keep their viewport, touch and user agent.
test.use({ deviceScaleFactor: 1 });

const POLL = { intervals: [20, 50, 100], timeout: 15_000 };

const hasTouch = () => test.info().project.use.hasTouch === true;

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

/** Whether game time stands still for a while: frames run, the clock doesn't. */
const expectClockFrozen = async (page: Page) => {
  const now = await page.evaluate(() => window.debug.clock.now);

  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.debug.clock.now)).toBe(now);
};

// Desktop only (untagged): no device-specific path.
test("a hidden tab pauses the game and suspends audio; back, both wait under Tap to continue", async ({ page }) => {
  await openGame(page);
  expect((await readAudio(page)).contextState).toBe("running");

  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  expect(await page.evaluate(() => window.debug.pause.paused)).toBe(true);

  // No automatic resume (02): the game and audio wait for the tap.
  await setHidden(page, false);
  expect(await promptOnScreen(page)).toBe("Tap to continue");
  await expectClockFrozen(page);
  expect((await readAudio(page)).contextState).toBe("suspended");
  expect((await readGame(page)).state).toBe("title");
});

// On the iPhone, the continuing tap is a real touch sequence (`@tap`, playwright.config.ts).
test("Tap to continue: one tap resumes audio inside the gesture and the game without advancing; mute only mutes", {
  tag: "@tap",
}, async ({ page }) => {
  await recordResumes(page);
  await openGame(page);
  // Title's prompt is up: a stray advance would leave Title.
  await expect.poll(async () => (await readGame(page)).phase, POLL).toBe("prompt");

  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  await setHidden(page, false);
  expect(await promptOnScreen(page)).toBe("Tap to continue");
  expect(await page.evaluate(() => window.debug.continuePromptShown)).toBe(true);
  expect((await readAudio(page)).status).toBe("needs-gesture");

  const before = (await readResumeEvents(page)).length;
  const pausedAt = await page.evaluate(() => window.debug.clock.now);

  await tapPlayfield(page);
  await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  // The unlock ran inside the tap's own event, and the game runs again.
  expect((await readResumeEvents(page)).slice(before)[0]).toBe("pointerup");
  await expect.poll(() => page.evaluate(() => window.debug.clock.now), POLL).toBeGreaterThan(pausedAt);
  // Give a stray advance time to land: it would leave Title.
  await page.waitForTimeout(300);
  expect(await readGame(page)).toMatchObject({ state: "title", phase: "prompt" });

  // A page restored from the bfcache takes the same path. Under the prompt the M key mutes, and nothing else: audio
  // and the game stay paused.
  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  await setHidden(page, false, false);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  expect(await promptOnScreen(page)).toBe("Tap to continue");
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(true);
  expect(await promptOnScreen(page)).toBe("Tap to continue");
  expect((await readAudio(page)).contextState).toBe("suspended");
  await expectClockFrozen(page);

  // A key continues too, without advancing; mute still toggles back.
  await page.keyboard.press("Space");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
  await page.waitForTimeout(300);
  expect((await readGame(page)).state).toBe("title");
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(false);

  // Audio interrupted while the page shows (iOS: a call, Siri): the same prompt, and the game pauses under it.
  await page.evaluate(() => window.debug.audio.suspend());
  await expect.poll(() => promptOnScreen(page), POLL).toBe("Tap to continue");
  await expect.poll(() => page.evaluate(() => window.debug.pause.paused), POLL).toBe(true);
  await tapPlayfield(page);
  await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  await page.waitForTimeout(300);
  expect((await readGame(page)).state).toBe("title");

  // With audio running and the game too, the next tap advances as usual.
  await tapPlayfield(page);
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("story");
});
