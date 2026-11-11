// The start gate and the mute button (m3-plan, deliverables 2 and 4). Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { openGame, readGame, readGatePhase, readLayout, SEED, touchDriver, waitForGateReady } from "./game.ts";

const POLL = { intervals: [20, 50, 100], timeout: 45_000 };

interface ResumeCall {
  /** `window.event?.type`: the DOM event being dispatched when `resume()` was called, if any. */
  readonly type: string | null;
  /** `navigator.userActivation.isActive`: whether the browser counted it as inside a user gesture. */
  readonly active: boolean | null;
  readonly phase: string | null;
}

type RecordingWindow = Window & { resumeCalls?: ResumeCall[] };

/**
 * Records every `AudioContext.resume()` call and emulates a locked context. Headless Chromium starts the context
 * "running", so the recorder makes `state` read "suspended" until a resume succeeds, as on a phone. `failEvents` lists
 * event types whose resume stays locked, to emulate a browser that doesn't count that event as a user gesture.
 */
const recordResumes = (page: Page, failEvents: readonly string[] = []) => page.addInitScript((failing) => {
  const calls: ResumeCall[] = [];
  const proto = AudioContext.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "resume")?.value as (this: AudioContext) => Promise<void>;
  const stateDescriptor = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "state");
  const unlocked = new WeakSet<BaseAudioContext>();

  (window as RecordingWindow).resumeCalls = calls;
  Object.defineProperty(BaseAudioContext.prototype, "state", {
    configurable: true,
    get(this: BaseAudioContext) {
      const real = stateDescriptor?.get?.call(this) as AudioContextState;

      // Once unlocked, read "running" at once, as a phone would. A context Chromium starts suspended (it happens
      // under load) would otherwise read "suspended" until its resume settles, and the touchend retry would resume
      // again.
      if (unlocked.has(this)) {
        return real === "closed" ? real : "running";
      }

      return real === "running" ? "suspended" : real;
    },
  });
  proto.resume = function resume(this: AudioContext) {
    const type = window.event?.type ?? null;

    calls.push({
      type,
      active: navigator.userActivation?.isActive ?? null,
      phase: window.debug?.gate.phase ?? null,
    });

    if (type === null || !failing.includes(type)) {
      unlocked.add(this);
      this.dispatchEvent(new Event("statechange"));
    }

    return original.call(this);
  };
}, failEvents);

const readResumes = (page: Page) => page.evaluate(() => (window as RecordingWindow).resumeCalls ?? []);

const hasTouch = () => test.info().project.use.hasTouch === true;

/** A tap at (x, y): a real touch sequence on the touch projects, a mouse click on desktop. */
const tapAt = async (page: Page, x: number, y: number) => {
  if (hasTouch()) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
};

/** Goes down at `from`, slides to `to` and lifts there: touch on the touch projects, the mouse on desktop. */
const slide = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  if (hasTouch()) {
    const driver = await touchDriver(page);
    const point = { ...from, id: 99 };

    await driver.down(point);
    await driver.move(point, (from.x + to.x) / 2, (from.y + to.y) / 2);
    await driver.move(point, to.x, to.y);
    await driver.up({ ...point, ...to });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
  }
};

const readGateScreen = (page: Page) => page.evaluate(() => {
  const ui = window.debug.layers.ui;
  const text = (label: string) => {
    const child = ui.getChildByLabel(label) as { visible: boolean; text?: string } | null;

    return child?.visible === true ? child.text ?? "" : null;
  };

  return {
    phase: window.debug.gate.phase,
    progress: window.debug.gate.progress,
    warning: text("gate-warning"),
    prompt: text("gate-prompt"),
    bar: ui.getChildByLabel("gate-bar")?.visible ?? false,
  };
});

/** A click in the middle of the playfield: a tap that hits no button. */
const tapPlayfield = async (page: Page) => {
  const { square } = await readLayout(page);

  await tapAt(page, square.x + square.width / 2, square.y + square.height / 2);
};

const muteCentre = async (page: Page) => {
  const rect = await page.evaluate(() => window.debug.router.muteRect);

  if (rect === null) {
    throw new Error("no mute button");
  }

  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const tapMute = async (page: Page) => {
  const { x, y } = await muteCentre(page);

  await tapAt(page, x, y);
};

/**
 * The begin tap's resume calls: exactly one, inside the gesture's own event, with the gate showing "ready". Once it
 * succeeds the context is running, so the touchend fallback (router-core.ts) has nothing left to resume.
 */
const expectBeginResumes = (calls: readonly ResumeCall[], first: string) => {
  expect(calls).toEqual([{ type: first, active: true, phase: "ready" }]);
};

test("shows progress and the warning, then Tap to begin, whose tap starts the music and goes to Title", async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await recordResumes(page);
  // Holds BGM01 back, so the gate stays in "loading" until the test lets it through.
  await page.route(/bgm01.*\.m4a$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/?debug&seed=${SEED}`);
  await expect.poll(() => readGatePhase(page), POLL).toBe("loading");
  await expect.poll(async () => (await readGateScreen(page)).warning, POLL)
    .toBe("This game contains\nflashing lights.");

  const loading = await readGateScreen(page);

  expect(loading.bar).toBe(true);
  expect(loading.prompt).toBeNull();
  expect(loading.progress).toBeLessThan(1);

  // A tap while loading does nothing: no resume, and it doesn't carry over into "ready".
  await tapPlayfield(page);

  release();
  await waitForGateReady(page);
  await page.waitForTimeout(200);
  expect((await readGame(page)).state).toBe("gate");
  expect(await readResumes(page)).toEqual([]);
  await expect.poll(async () => (await readGateScreen(page)).prompt, POLL).toBe("Tap to begin");
  expect((await readGateScreen(page)).bar).toBe(false);
  expect(await page.evaluate(() => window.debug.audio.debug.barAnchor)).toBeNull();

  await tapPlayfield(page);
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("title");
  expectBeginResumes(await readResumes(page), "pointerup");
  expect(await page.evaluate(() => window.debug.audio.debug.barAnchor)).not.toBeNull();
  expect((await readGateScreen(page)).warning).toBeNull();
});

test("a key begins too, resuming audio inside its keydown", async ({ page }) => {
  await recordResumes(page);
  await page.goto(`/?debug&seed=${SEED}`);
  await waitForGateReady(page);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("title");
  expectBeginResumes(await readResumes(page), "keydown");
});

test("on touch, a pointerup that doesn't unlock is rescued by the touchend that follows", async ({ page }) => {
  test.skip(!hasTouch(), "touch only");
  await recordResumes(page, ["pointerup"]);
  await page.goto(`/?debug&seed=${SEED}`);
  await waitForGateReady(page);
  await tapPlayfield(page);
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("title");
  expect(await readResumes(page)).toEqual([
    { type: "pointerup", active: true, phase: "ready" },
    { type: "touchend", active: true, phase: "ready" },
  ]);
  expect(await page.evaluate(() => window.debug.audio.status)).toBe("running");
});

test("a failed load shows Tap to retry, and the tap reloads what failed", async ({ page }) => {
  let failures = 0;

  page.on("pageerror", () => undefined);
  await page.route(/thunderclap.*\.m4a$/, async (route) => {
    if (failures === 0) {
      failures += 1;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto(`/?debug&seed=${SEED}`);
  await expect.poll(() => readGatePhase(page), POLL).toBe("failed");
  expect(await readGateScreen(page)).toMatchObject({ prompt: "Couldn't load. Tap to retry", bar: false });

  await tapPlayfield(page);
  await waitForGateReady(page);
  expect(await page.evaluate(() => window.debug.audio.failed)).toEqual([]);
  expect(failures).toBe(1);
});

test("the mute button and the M key toggle mute without advancing, and mute persists", async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.debug.audio.muted)).toBe(false);

  // Sliding off the button before lifting does nothing: no mute, no advance.
  const centre = await muteCentre(page);
  const { square } = await readLayout(page);

  await slide(page, centre, { x: square.x + square.width / 2, y: square.y + square.height / 2 });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.debug.audio.muted)).toBe(false);
  expect((await readGame(page)).state).toBe("title");

  await tapMute(page);
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(true);
  // Give a stray advance time to land: it would leave Title.
  await page.waitForTimeout(200);
  expect((await readGame(page)).state).toBe("title");

  await page.reload();
  await waitForGateReady(page);
  expect(await page.evaluate(() => window.debug.audio.muted)).toBe(true);

  await page.keyboard.press("m");
  await expect.poll(() => page.evaluate(() => window.debug.audio.muted), POLL).toBe(false);
  await page.waitForTimeout(200);
  expect(await readGatePhase(page)).toBe("ready");
  expect((await readGame(page)).state).toBe("gate");
});
