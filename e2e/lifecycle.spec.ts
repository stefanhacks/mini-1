// The pause button and keys, and the text cache housekeeping (m5-plan, deliverables 5 and 6). The hidden tab and the
// merged "Tap to continue" are in sound.spec.ts. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import type { Rect } from "../src/core/layout.ts";
import { computePads } from "../src/game/input/pad-geometry.ts";
import {
  keyboardDriver,
  leaveTitle,
  openGame,
  readAudio,
  readGame,
  readLayout,
  SEED,
  waitFor,
  waitForGateReady,
} from "./game.ts";

// A tap's pointer path doesn't depend on the DPR: at DPR 1 the software-rendered frames are several times cheaper.
test.use({ deviceScaleFactor: 1 });

const POLL = { intervals: [20, 50, 100], timeout: 15_000 };

const hasTouch = () => test.info().project.use.hasTouch === true;

const tapAt = async (page: Page, x: number, y: number) => {
  if (hasTouch()) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
};

const readPauseRect = async (page: Page) => {
  const rect = await page.evaluate(() => window.debug.router.pauseRect);

  if (rect === null) {
    throw new Error("no pause button");
  }

  return rect;
};

const tapPause = async (page: Page) => {
  const rect = await readPauseRect(page);

  await tapAt(page, rect.x + rect.width / 2, rect.y + rect.height / 2);
};

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

const readPause = (page: Page) => page.evaluate(() => {
  const { pause, layers, continuePromptShown } = window.debug;

  return {
    paused: pause.paused,
    input: pause.input,
    button: layers.ui.getChildByLabel("pause-button")?.visible ?? false,
    prompt: continuePromptShown,
    // The overlay sits above everything in ui.
    onTop: layers.ui.children.at(-1)?.label === "continue",
  };
});

const readNow = (page: Page) => page.evaluate(() => window.debug.clock.now);

const pageKey = async (page: Page) => {
  const game = await readGame(page);

  return `${game.state}:${game.part}:${game.page?.line}:${game.page?.page}:${game.page?.revealed}`;
};

const overlaps = (a: Rect, b: Rect) =>
  a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
  && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("the pause button freezes a story page under Tap to continue; a tap on it resumes audio and the game", {
  tag: "@tap",
}, async ({ page }) => {
  await recordResumes(page);
  await openGame(page);
  await expect.poll(async () => (await readPause(page)).input, POLL).toBe("ready");

  const driver = await keyboardDriver(page);

  await leaveTitle(page, driver);
  await waitFor(page, (game) => game.state === "story" && game.page !== null && game.page.typed);

  const shown = await pageKey(page);

  await tapPause(page);
  await expect.poll(() => readPause(page), POLL)
    .toEqual({ paused: true, input: "paused", button: true, prompt: true, onTop: true });
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");

  const pausedAt = await readNow(page);

  await page.waitForTimeout(300);
  expect(await readNow(page)).toBe(pausedAt);

  // While paused its square is an ordinary tap: the one that continues, with the unlock inside its own event.
  const before = (await readResumeEvents(page)).length;

  await tapPause(page);
  await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
  await expect.poll(() => readPause(page), POLL)
    .toMatchObject({ paused: false, input: "ready", button: true, prompt: false });
  expect((await readResumeEvents(page)).slice(before)[0]).toBe("pointerup");
  await expect.poll(() => readNow(page), POLL).toBeGreaterThan(pausedAt);
  // Give a stray advance time to land: it would turn the page.
  await page.waitForTimeout(300);
  expect(await pageKey(page)).toBe(shown);
});

// Keys: the same code on every device, desktop only (untagged).
test("Escape and P pause and resume, never advancing; at the gate they and the button are off", async ({ page }) => {
  await recordResumes(page);
  await page.goto(`/?debug&seed=${SEED}&timescale=32`);
  await waitForGateReady(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  expect(await readPause(page)).toMatchObject({ paused: false, input: "off", button: false });
  expect((await readGame(page)).state).toBe("gate");

  // P is an ordinary key at the gate: it begins.
  await page.keyboard.press("p");
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("title");
  await expect.poll(async () => (await readGame(page)).phase, POLL).toBe("prompt");
  await expect.poll(() => readPause(page), POLL).toMatchObject({ input: "ready", button: true });

  for (const key of ["p", "Escape"]) {
    await page.keyboard.press(key);
    await expect.poll(() => readPause(page), POLL).toMatchObject({ paused: true, prompt: true });
    await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");

    const before = (await readResumeEvents(page)).length;

    await page.keyboard.press(key === "p" ? "Escape" : "P");
    await expect.poll(() => readPause(page), POLL).toMatchObject({ paused: false, prompt: false });
    await expect.poll(async () => (await readAudio(page)).status, POLL).toBe("running");
    expect((await readResumeEvents(page)).slice(before)[0]).toBe("keydown");
    await page.waitForTimeout(200);
    expect(await readGame(page)).toMatchObject({ state: "title", phase: "prompt" });
  }
});

test("the pause button sits right under mute, in the safe area, clear of every control zone and pad", {
  tag: "@device",
}, async ({ page }) => {
  // The router has its layout as soon as `window.debug` exists: nothing needs to load.
  await page.goto(`/?debug&seed=${SEED}`);
  await page.waitForFunction(() => window.debug?.router.pauseRect !== undefined, undefined, { timeout: 45_000 });

  const viewport = page.viewportSize();

  if (viewport === null) {
    throw new Error("no viewport");
  }

  // As opened, then turned.
  for (const size of [viewport, { width: viewport.height, height: viewport.width }]) {
    await page.setViewportSize(size);
    await expect.poll(async () => (await readLayout(page)).orientation, POLL)
      .toBe(size.width > size.height ? "landscape" : "portrait");

    const layout = await readLayout(page);
    const { muteRect, pauseRect } = await page.evaluate(() => ({
      muteRect: window.debug.router.muteRect,
      pauseRect: window.debug.router.pauseRect,
    }));

    if (muteRect === null || pauseRect === null) {
      throw new Error(`no room for the corner buttons at ${size.width}×${size.height}`);
    }

    expect(pauseRect.x).toBe(muteRect.x);
    expect(pauseRect.y).toBeCloseTo(muteRect.y + muteRect.height, 9);
    expect(pauseRect.x).toBeGreaterThanOrEqual(layout.safe.x);
    expect(pauseRect.x + pauseRect.width).toBeLessThanOrEqual(layout.safe.x + layout.safe.width + 1e-9);
    expect(pauseRect.y + pauseRect.height).toBeLessThanOrEqual(layout.safe.y + layout.safe.height + 1e-9);

    for (const zone of layout.zones) {
      expect(overlaps(zone, pauseRect)).toBe(false);
    }

    for (const pad of computePads(layout)) {
      expect(overlaps(pad.hitBounds, pauseRect)).toBe(false);
    }
  }
});

// Pixi's private text cache (text-cache.ts): the same on every device, desktop only.
test("Title prunes the null keys the story's typing leaves in Pixi's text cache", async ({ page }) => {
  const driver = await keyboardDriver(page);

  await openGame(page);
  // The field is there, in the shape the pruning expects (Pixi 8.20.1); a Pixi upgrade that changes it fails here.
  expect(await page.evaluate(() => window.debug.textCache)).toMatchObject({ nulls: 0 });

  await leaveTitle(page, driver);
  // Two pages typed out are plenty.
  await waitFor(page, (game) => game.page?.typed === true);
  await driver.advance();
  await waitFor(page, (game) => game.page?.typed === true && (game.page.line > 0 || game.page.page > 0));

  const typed = await page.evaluate(() => window.debug.textCache);

  // Each typed prefix that was drawn left a null key behind (at FAST time a frame skips several): what the pruning is
  // for.
  expect(typed?.nulls).toBeGreaterThan(0);

  await page.evaluate(() => window.debug.machine.request("title"));
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("title");

  const pruned = await page.evaluate(() => window.debug.textCache);

  expect(pruned?.nulls).toBe(0);
  expect(pruned?.keys).toBeGreaterThan(0);
  expect(pruned?.keys).toBeLessThan(typed?.keys ?? 0);
});
