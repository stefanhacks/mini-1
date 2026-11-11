// Drives the game in e2e: reads `window.debug.game` and answers what it shows, by keyboard or by synthetic touch.
import { expect, type CDPSession, type Page } from "@playwright/test";
import type { Container } from "pixi.js";
import type { GameSnapshot } from "../src/debug-api.ts";
import type { Direction } from "../src/game/direction.ts";
import { computePads, type Pad } from "../src/game/input/pad-geometry.ts";

export type { GameSnapshot } from "../src/debug-api.ts";

/** The fixed seed every e2e game starts from. */
export const SEED = 2018;

/** Game time runs this much faster while nothing is being answered. */
export const FAST = 32;

/**
 * ...and this much slower while a Sequence or a Many is answered: a CDP touch takes 100–200 ms of wall time, more with
 * three projects sharing the CPUs, so 10 taps could miss Many's 3 s window at scale 1.
 */
export const SLOW = 0.25;

const POLL = { intervals: [10, 20, 30], timeout: 15_000 };

// Opening the page builds Pixi, loads the assets and compiles shaders: under CPU contention that alone has taken over
// 15 s.
const OPEN_POLL = { intervals: [50, 100, 200], timeout: 45_000 };

export const readGame = (page: Page) => page.evaluate(() => window.debug.game);

export const readLayout = (page: Page) => page.evaluate(() => window.debug.layout);

export const setTimescale = (page: Page, value: number) =>
  page.evaluate((scale) => window.debug.setTimescale(scale), value);

export const isPadVisible = (page: Page) => page.evaluate(() => {
  const pad = window.debug.layers.ui.getChildByLabel("pad-view");

  return pad?.visible ?? false;
});

/** Counts that must not grow from one game to the next. */
export const readCounts = (page: Page) => page.evaluate(() => {
  const debug = window.debug;
  const count = (container: Container): number =>
    container.children.reduce((sum, child) => sum + 1 + count(child), 0);

  return {
    ...debug.counts,
    playfieldObjects: count(debug.layers.playfield),
    uiObjects: count(debug.layers.ui),
  };
});

/** The start gate's phase, or null before `window.debug` exists. */
export const readGatePhase = (page: Page) => page.evaluate(() => window.debug?.gate.phase ?? null);

/** Waits for the start gate's "Tap to begin". */
export const waitForGateReady = async (page: Page) => {
  // `window.debug` only exists once main.ts has set it up, and the gate is ready once every asset has loaded.
  await expect.poll(() => readGatePhase(page), OPEN_POLL).toBe("ready");
};

/** Opens the game with `?debug`, the fixed seed and FAST time, and taps through the start gate (Space) to Title. */
export const openGame = async (page: Page, query = "") => {
  await page.goto(`/?debug&seed=${SEED}&timescale=${FAST}${query}`);
  await waitForGateReady(page);
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.debug.game.state), OPEN_POLL).toBe("title");
};

export const waitFor = async (page: Page, check: (game: GameSnapshot) => boolean) => {
  await expect.poll(async () => check(await readGame(page)), POLL).toBe(true);
};

/** How the player gives input. */
export interface Driver {
  /** A tap or key that only advances (story, title, ending). */
  advance(): Promise<void>;
  press(dir: Direction): Promise<void>;
  release(dir: Direction): Promise<void>;
  /**
   * Taps each direction in turn (down, then up). The CDP messages are sent without waiting for each other: CDP keeps
   * their order, and a whole Sequence costs one round trip instead of one per event.
   */
  tapAll(dirs: readonly Direction[]): Promise<void>;
}

const KEYS: Readonly<Record<Direction, { key: string; code: number }>> = {
  up: { key: "ArrowUp", code: 38 },
  down: { key: "ArrowDown", code: 40 },
  left: { key: "ArrowLeft", code: 37 },
  right: { key: "ArrowRight", code: 39 },
};

/** Arrow keys and Space through CDP `Input.dispatchKeyEvent`, the same messages Playwright's keyboard sends. */
export const keyboardDriver = async (page: Page): Promise<Driver> => {
  const session = await page.context().newCDPSession(page);
  const key = (type: "rawKeyDown" | "keyUp", dir: Direction) => session.send("Input.dispatchKeyEvent", {
    type,
    key: KEYS[dir].key,
    code: KEYS[dir].key,
    windowsVirtualKeyCode: KEYS[dir].code,
  });

  return {
    advance: () => page.keyboard.press("Space"),
    press: async (dir) => {
      await key("rawKeyDown", dir);
    },
    release: async (dir) => {
      await key("keyUp", dir);
    },
    tapAll: async (dirs) => {
      await Promise.all(dirs.flatMap((dir) => [key("rawKeyDown", dir), key("keyUp", dir)]));
    },
  };
};

export interface TouchPoint {
  readonly x: number;
  readonly y: number;
  readonly id: number;
}

export type TouchDriver = Driver & {
  readonly session: CDPSession;
  /** A new touch point at the centre of `dir`'s button on pad `pad` (default: alternating pads). */
  point(dir: Direction, pad?: number): Promise<TouchPoint>;
  /** Touches the given new points down, in one touchStart: one point, or a chord. */
  down(...points: TouchPoint[]): Promise<void>;
  /** Lifts only the given points. */
  up(...points: TouchPoint[]): Promise<void>;
  /** Moves a point that is down to (x, y). */
  move(point: TouchPoint, x: number, y: number): Promise<void>;
  /** Cancels every touch point at once, as the browser does when it takes a gesture over. */
  cancel(): Promise<void>;
};

/**
 * Touch through CDP `Input.dispatchTouchEvent`, so holds and cancels are real touch sequences. CDP's rules: a
 * touchStart adds the ids it lists, a touchEnd with points ends only those (with none, it ends all), a touchCancel
 * cancels all. Each press is a new touch point on a pad button; in landscape, presses alternate between the two pads
 * (owner decision 1). The pads are read once: the tests don't resize while a driver plays.
 */
export const touchDriver = async (page: Page): Promise<TouchDriver> => {
  const session = await page.context().newCDPSession(page);
  // The point each pressed direction is held by, for `release`.
  const pressed = new Map<Direction, TouchPoint>();
  let nextId = 1;
  let presses = 0;
  let pads: Pad[] | null = null;

  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const send = (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", touchPoints: TouchPoint[]) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints });

  const point = async (dir: Direction, pad?: number): Promise<TouchPoint> => {
    pads ??= computePads(await readLayout(page)).filter((each) => each.size > 0);

    const button = pads[(pad ?? presses++) % pads.length].buttons[dir];

    return { x: button.x + button.width / 2, y: button.y + button.height / 2, id: nextId++ };
  };

  return {
    session,
    point,
    down: async (...points) => {
      await send("touchStart", points);
    },
    up: async (...points) => {
      await send("touchEnd", points);
    },
    move: async (moved, x, y) => {
      await send("touchMove", [{ ...moved, x, y }]);
    },
    advance: async () => {
      const { square } = await readLayout(page);
      const tap = { x: square.x + square.width / 2, y: square.y + square.height / 4, id: nextId++ };

      await send("touchStart", [tap]);
      await send("touchEnd", [tap]);
    },
    press: async (dir) => {
      const held = await point(dir);

      pressed.set(dir, held);
      await send("touchStart", [held]);
    },
    release: async (dir) => {
      const held = pressed.get(dir);

      if (held !== undefined) {
        pressed.delete(dir);
        await send("touchEnd", [held]);
      }
    },
    tapAll: async (dirs) => {
      const taps: TouchPoint[] = [];

      for (const dir of dirs) {
        taps.push(await point(dir));
      }

      await Promise.all(taps.flatMap((tap) => [send("touchStart", [tap]), send("touchEnd", [tap])]));
    },
    cancel: async () => {
      pressed.clear();
      await send("touchCancel", []);
    },
  };
};

/**
 * Advances from Title to story part 0. Title drops taps for its first 500 ms of game time (TITLE_DEBOUNCE_MS), so one
 * that changes nothing is sent again.
 */
export const leaveTitle = async (page: Page, driver: Driver) => {
  await expect.poll(async () => {
    if ((await readGame(page)).state === "title") {
      await driver.advance();
      await page.waitForTimeout(15);
    }

    return (await readGame(page)).state;
  }, POLL).not.toBe("title");
};

const pageKey = (game: GameSnapshot) => `${game.state}:${game.part}:${game.page?.line}:${game.page?.page}`;

/**
 * Reads the current story part to its end. `onPage` runs on every page as it is shown. An advance inside the debounce
 * is dropped by the game, so one that changes nothing is sent again.
 */
export const readStory = async (page: Page, driver: Driver, onPage?: (game: GameSnapshot) => Promise<void>) => {
  await waitFor(page, (game) => game.state !== "story" || game.page !== null);

  for (let game = await readGame(page); game.state === "story"; game = await readGame(page)) {
    await onPage?.(game);

    const before = pageKey(game);

    await expect.poll(async () => {
      if (pageKey(await readGame(page)) === before) {
        await driver.advance();
        await page.waitForTimeout(15);
      }

      const now = await readGame(page);

      return pageKey(now) !== before && (now.state !== "story" || now.page !== null);
    }, POLL).toBe(true);
  }
};

/** Answers the challenge on screen. Taps and key presses run at SLOW time, so no window closes on the test. */
export const answerChallenge = async (page: Page, driver: Driver) => {
  const game = await readGame(page);
  const challenge = game.challenge;

  if (challenge === null) {
    throw new Error(`no challenge to answer in ${JSON.stringify(game)}`);
  }

  const { spec, index } = challenge;

  if (spec.kind === "hold") {
    await driver.press(spec.direction);
    await waitFor(page, (now) => now.challenge?.index !== index || now.phase !== "play");
    await driver.release(spec.direction);
    return;
  }

  const presses = challenge.progress.kind === "many" ? challenge.progress.target : 0;
  const dirs = spec.kind === "sequence" ? spec.directions : Array.from({ length: presses }, () => spec.direction);

  await setTimescale(page, SLOW);
  await driver.tapAll(dirs);

  await waitFor(page, (now) => now.challenge?.index !== index || now.phase !== "play");
  await setTimescale(page, FAST);
};

/** Plays a whole round, from the Transition to the next story part. */
export const playRound = async (page: Page, driver: Driver) => {
  await waitFor(page, (game) => game.state === "round");
  expect(await isPadVisible(page)).toBe(true);

  while ((await readGame(page)).phase === "play") {
    await answerChallenge(page, driver);
  }

  await waitFor(page, (game) => game.state === "story");
};

/**
 * Plays from Title to the next Title: every story part, every round, the ending and the replay tap. Checks that the
 * pad shows only in Transition and Round.
 */
export const playGame = async (page: Page, driver: Driver, onPage?: (game: GameSnapshot) => Promise<void>) => {
  const start = await readGame(page);

  expect(start.state).toBe("title");
  expect(await isPadVisible(page)).toBe(false);
  await leaveTitle(page, driver);
  await waitFor(page, (game) => game.state === "story");

  for (let part = 0; part < 4; part++) {
    expect((await readGame(page)).part).toBe(part);
    expect(await isPadVisible(page)).toBe(false);
    await readStory(page, driver, onPage);

    if (part < 3) {
      expect(["transition", "round"]).toContain((await readGame(page)).state);
      await playRound(page, driver);
    }
  }

  await waitFor(page, (game) => game.state === "ending");
  expect(await isPadVisible(page)).toBe(false);
  await waitFor(page, (game) => game.phase === "card");
  await driver.advance();
  await waitFor(page, (game) => game.state === "title" && game.games === start.games + 1);
};
