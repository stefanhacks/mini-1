// The error guards, the resume guard and the ui order in main.ts, guarded before the M4 refactor moves them
// (m4-refactor.md, "Safety net"). Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import {
  answerChallenge,
  FAST,
  keyboardDriver,
  leaveTitle,
  openGame,
  readGame,
  readStory,
  setTimescale,
  waitFor,
  type GameSnapshot,
} from "./game.ts";

// The guards and the ticker are the same code on every device: desktop only (untagged, playwright.config.ts). A small
// viewport: the checks read the game, and every frame renders cheaper.
test.use({ viewport: { width: 640, height: 400 } });

const POLL = { intervals: [20, 50, 100], timeout: 15_000 };

/** The guarded calls main.ts makes every frame, each through its object: the e2e can replace them. */
const GUARDED = { machine: "update", display: "render", audio: "tick" } as const;

/** Makes the next call of `part`'s guarded method throw `message`; the call after that is the original again. */
const failOnce = (page: Page, part: keyof typeof GUARDED, message: string) =>
  page.evaluate(([which, name, text]) => {
    const target = window.debug[which] as unknown as Record<string, unknown>;
    const original = target[name];

    target[name] = () => {
      target[name] = original;
      throw new Error(text);
    };
  }, [part, GUARDED[part], message] as const);

/** Every uncaught error's message, in order: the guards report theirs with `reportError`. */
const watchPageErrors = (page: Page) => {
  const messages: string[] = [];

  page.on("pageerror", (error) => messages.push(error.message));

  return messages;
};

const readErrorMessage = (page: Page) =>
  page.evaluate(() => (window.debug.error instanceof Error ? window.debug.error.message : null));

const readNow = (page: Page) => page.evaluate(() => window.debug.clock.now);

/** The ticker's last frame time: it moves while Pixi's frame loop runs. */
const readFrameTime = (page: Page) => page.evaluate(() => window.debug.app.ticker.lastTime);

const readAudio = (page: Page) => page.evaluate(() => window.debug.audio.debug);

const nextFrames = (page: Page, count: number) => page.evaluate(async (frames) => {
  for (let index = 0; index < frames; index++) {
    await new Promise(requestAnimationFrame);
  }
}, count);

/** SHA-256 of the playfield's render texture, as the last render pass left it. */
const hashPlayfield = (page: Page) => page.evaluate(async () => {
  const { app, display } = window.debug;
  const { pixels } = app.renderer.extract.pixels(display.renderTexture);
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(pixels));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
});

/** Emulates the tab being hidden or shown: `visibilityState` overridden, then the `visibilitychange` event. */
const setHidden = (page: Page, hidden: boolean) => page.evaluate((hide) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hide ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hide });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);

test("a game-logic throw halts the game once, suspends audio and keeps rendering", async ({ page }) => {
  const errors = watchPageErrors(page);

  await openGame(page);
  expect((await readAudio(page)).contextState).toBe("running");
  await failOnce(page, "machine", "game logic failed");
  await expect.poll(() => readErrorMessage(page), POLL).toBe("game logic failed");
  await expect.poll(async () => (await readAudio(page)).contextState, POLL).toBe("suspended");

  // Halted: the machine is never updated again and game time stands still, but the ticker runs on.
  const updates = await page.evaluate(() => {
    const { machine } = window.debug;
    const calls = { count: 0 };
    const original = machine.update.bind(machine);

    machine.update = (deltaMS) => {
      calls.count += 1;
      original(deltaMS);
    };
    (window as unknown as { updateCalls: typeof calls }).updateCalls = calls;

    return calls.count;
  });
  const now = await readNow(page);
  const frame = await readFrameTime(page);

  await page.waitForTimeout(300);
  expect(await readNow(page)).toBe(now);
  expect(await readFrameTime(page)).toBeGreaterThan(frame);
  expect(await page.evaluate(() => (window as unknown as { updateCalls: { count: number } }).updateCalls.count))
    .toBe(updates);

  // The render passes still run: the frozen frame stays the same, and a moved sprite shows on the next one.
  const frozen = await hashPlayfield(page);

  await nextFrames(page, 2);
  expect(await hashPlayfield(page)).toBe(frozen);
  // The boat, not the logo: the logo is hidden until Title's reveal at 5.5 s. The halted clips leave it in place.
  await page.evaluate(() => {
    const boat = window.debug.layers.world.getChildByLabel("boat");

    if (boat === null) {
      throw new Error("no scene");
    }

    boat.x += 8;
  });
  await nextFrames(page, 2);
  expect(await hashPlayfield(page)).not.toBe(frozen);
  expect(errors).toEqual(["game logic failed"]);
});

test("a render throw is contained, and a game-logic throw after it halts but leaves the first in debug.error", async ({
  page,
}) => {
  const errors = watchPageErrors(page);

  await openGame(page);
  await failOnce(page, "display", "render failed");
  await expect.poll(() => readErrorMessage(page), POLL).toBe("render failed");

  const before = await page.evaluate(() => window.debug.layout.safe.width);
  const now = await readNow(page);

  // The renderer's "resize" handler renders the playfield too: halted, it skips that pass.
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(() => page.evaluate(() => window.debug.layout.safe.width), POLL).not.toBe(before);
  await expect.poll(() => readNow(page), POLL).toBeGreaterThan(now);
  await page.waitForTimeout(200);
  expect(errors).toEqual(["render failed"]);
  expect((await readGame(page)).state).toBe("title");

  // First error wins: the game-logic throw is reported, and halts the game, but debug.error keeps the render's.
  await failOnce(page, "machine", "game logic failed");
  await expect.poll(() => errors, POLL).toEqual(["render failed", "game logic failed"]);
  expect(await readErrorMessage(page)).toBe("render failed");

  const halted = await readNow(page);

  await page.waitForTimeout(300);
  expect(await readNow(page)).toBe(halted);
});

test("an audio tick throw is contained: the game runs on", async ({ page }) => {
  const errors = watchPageErrors(page);
  const driver = await keyboardDriver(page);

  await openGame(page);
  await failOnce(page, "audio", "audio tick failed");
  await expect.poll(() => readErrorMessage(page), POLL).toBe("audio tick failed");

  const now = await readNow(page);

  await expect.poll(() => readNow(page), POLL).toBeGreaterThan(now);
  await leaveTitle(page, driver);
  await waitFor(page, (game) => game.state === "story");
  expect(errors).toEqual(["audio tick failed"]);
});

type FrozenWindow = Window & {
  heldFrames?: FrameRequestCallback[];
  realRequestAnimationFrame?: typeof requestAnimationFrame;
};

test("a Hold close to its end, let go while the tab is hidden, doesn't complete on the first frame back", async ({
  page,
}) => {
  const driver = await keyboardDriver(page);

  await openGame(page);
  await leaveTitle(page, driver);
  await readStory(page, driver);
  await waitFor(page, (game) => game.state === "round");

  while ((await readGame(page)).challenge?.spec.kind !== "hold") {
    await answerChallenge(page, driver);
  }

  const game = await readGame(page);
  const spec = game.challenge?.spec;

  if (spec?.kind !== "hold") {
    throw new Error("no Hold in round 0");
  }

  const fraction = (now: GameSnapshot) =>
    (now.challenge?.progress.kind === "hold" ? now.challenge.progress.fraction : -1);

  await setTimescale(page, 1);
  await driver.press(spec.direction);
  await waitFor(page, (now) => fraction(now) > 0.6);

  // A hidden tab gets no frames: requestAnimationFrame callbacks are held until it shows again. Pixi's frame already
  // requested still runs; once it has asked for the next one through the override, no frame runs.
  await page.evaluate(() => {
    const frozen = window as FrozenWindow;
    const held: FrameRequestCallback[] = [];

    frozen.heldFrames = held;
    frozen.realRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => held.push(callback);
  });
  await expect.poll(() => page.evaluate(() => (window as FrozenWindow).heldFrames?.length ?? 0), POLL)
    .toBeGreaterThan(0);

  const held = await readGame(page);

  expect(held.challenge?.index).toBe(game.challenge?.index);
  expect(fraction(held)).toBeGreaterThan(0.6);
  expect(fraction(held)).toBeLessThan(1);

  // At FAST time Pixi's capped 100 ms frame is 3.2 s of game time: more than the Hold has left.
  await setTimescale(page, FAST);
  await setHidden(page, true);

  const hiddenAt = await readNow(page);

  await page.waitForTimeout(1000);
  expect(await readNow(page)).toBe(hiddenAt);

  // Visible again: the router's and main's listeners run, then the held frame, as the browser would order them.
  const back = await page.evaluate(() => {
    const frozen = window as FrozenWindow;
    const callbacks = frozen.heldFrames ?? [];

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    // The page's own requestAnimationFrame is back for the frames after this one.
    if (frozen.realRequestAnimationFrame !== undefined) {
      window.requestAnimationFrame = frozen.realRequestAnimationFrame;
    }

    frozen.heldFrames = [];

    const before = window.debug.clock.now;

    for (const callback of callbacks) {
      callback(performance.now());
    }

    return { jump: window.debug.clock.now - before, game: window.debug.game };
  });

  // The first frame back runs no game time, and the Hold let go while hidden is released, not completed.
  expect(back.jump).toBe(0);
  expect(back.game.challenge?.index).toBe(game.challenge?.index);
  expect(back.game.phase).toBe("play");
  expect(back.game.challenge?.progress).toMatchObject({ kind: "hold", held: false });

  // Frames run again, and the same Hold never completes on its own.
  await expect.poll(() => readNow(page), POLL).toBeGreaterThan(hiddenAt);
  await page.waitForTimeout(300);

  const after = await readGame(page);

  expect([after.challenge?.index, after.phase]).toEqual([game.challenge?.index, "play"]);
  await driver.release(spec.direction);
});

test("the ui layer's children at Title, in order", async ({ page }) => {
  await openGame(page);
  // Back to front: what main.ts adds (debug overlay, pad, mute, Tap to continue), then the gate's view and the
  // scene's texts. The M4 refactor must keep this order (m4-refactor.md, rule 1).
  expect(await page.evaluate(() => window.debug.layers.ui.children.map((child) => child.label))).toEqual([
    "debug-overlay",
    "pad-view",
    "mute-button",
    "continue",
    "gate-warning",
    "gate-prompt",
    "gate-bar",
    "story-text",
    "challenge-progress",
    "challenge-prompt",
    "tap-prompt",
    "credits",
  ]);
});
