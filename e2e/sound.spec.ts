// The audio lifecycle with "Tap to continue" (m3-plan, deliverable 6). The sound cues and the music per story part
// (deliverables 3, 5) are checked on a whole game in playthrough.spec.ts. Written by Claude Code.
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

// Desktop only (untagged): no device-specific path.
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

// On the iPhone, the unlocking tap is a real touch sequence (`@tap`, playwright.config.ts).
test("a failed resume shows Tap to continue; its tap resumes audio without advancing, and mute still works", {
  tag: "@tap",
}, async ({ page }) => {
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
  expect(await page.evaluate(() => window.debug.continuePromptShown)).toBe(true);
  expect((await readAudio(page)).status).toBe("needs-gesture");

  const before = (await readResumeEvents(page)).length;

  await tapPlayfield(page);
  await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  // The unlock ran inside the tap's own event.
  expect((await readResumeEvents(page)).slice(before)[0]).toBe("pointerup");
  // Give a stray advance time to land: it would leave Title.
  await page.waitForTimeout(300);
  expect((await readGame(page)).state).toBe("title");

  // A page restored from the bfcache takes the same path. Under the prompt, the M key both mutes and, being a
  // gesture, resumes audio; it never advances.
  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  await setHidden(page, false, false);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(() => promptOnScreen(page), POLL).toBe("Tap to continue");
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(true);
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  expect((await readAudio(page)).status).toBe("running");

  // A key continues too, without advancing; mute still toggles back.
  await setHidden(page, true);
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");
  await setHidden(page, false);
  await expect.poll(() => promptOnScreen(page), POLL).toBe("Tap to continue");
  await page.keyboard.press("Space");
  await expect.poll(() => promptOnScreen(page), POLL).toBeNull();
  await page.waitForTimeout(300);
  expect((await readGame(page)).state).toBe("title");
  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(false);

  // With audio running, the next tap advances as usual.
  await tapPlayfield(page);
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("story");
});
