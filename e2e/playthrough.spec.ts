import { expect, test, type Page } from "@playwright/test";
import type { Container, Text } from "pixi.js";
import { rectToScreen, type Insets } from "../src/core/layout.ts";
import type { Direction } from "../src/game/direction.ts";
import { STORY_PARTS } from "../src/game/story/script.ts";
import { storyLinesPerPage, TEXT_BOX_RECT } from "../src/game/text-box.ts";
import {
  answerChallenge,
  FAST,
  keyboardDriver,
  openGame,
  playGame,
  readCounts,
  readGame,
  readLayout,
  readStory,
  SEED,
  SLOW,
  setTimescale,
  touchDriver,
  waitFor,
  type Driver,
  type GameSnapshot,
} from "./game.ts";

// A playthrough is about 10–20 s of wall time, more with three projects sharing the CPUs.
test.describe.configure({ timeout: 90_000 });

// The playthroughs check game logic and input, not pixels: at DPR 1 the software-rendered frames are several times
// cheaper, and every round trip to the page with them. The presets keep their viewport, touch and user agent. The
// spill check below keeps the real DPR.
test.use({ deviceScaleFactor: 1 });

const watchErrors = (page: Page) => {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  return problems;
};

/** Plays round 0 until its current challenge is of `kind`, starting from Title. */
const reachChallenge = async (page: Page, driver: Driver, kind: "sequence" | "hold") => {
  await driver.advance();
  await readStory(page, driver);
  await waitFor(page, (game) => game.state === "round");

  while ((await readGame(page)).challenge?.spec.kind !== kind) {
    await answerChallenge(page, driver);
  }

  return readGame(page);
};

test("plays a whole game by keyboard", async ({ page }) => {
  const problems = watchErrors(page);

  await openGame(page);
  await playGame(page, await keyboardDriver(page));
  expect(problems).toEqual([]);
});

test("plays a whole game by touch", async ({ page }) => {
  const problems = watchErrors(page);

  await openGame(page);
  await playGame(page, await touchDriver(page));
  expect(problems).toEqual([]);
});

test("a wrong press resets a Sequence", async ({ page }) => {
  const driver = await keyboardDriver(page);

  await openGame(page);

  const game = await reachChallenge(page, driver, "sequence");
  const spec = game.challenge?.spec;

  if (spec?.kind !== "sequence") {
    throw new Error("no Sequence in round 0");
  }

  const [first, second] = spec.directions;
  const wrong = (["up", "down", "left", "right"] as Direction[]).find((dir) => dir !== first && dir !== second);

  if (wrong === undefined) {
    throw new Error("unreachable");
  }

  const pointer = (now: GameSnapshot) =>
    (now.challenge?.progress.kind === "sequence" ? now.challenge.progress.pointer : -1);

  await setTimescale(page, SLOW);
  await driver.press(first);
  await driver.release(first);
  await waitFor(page, (now) => pointer(now) === 1);
  await driver.press(wrong);
  await driver.release(wrong);
  await waitFor(page, (now) => pointer(now) === 0);
});

test("a touchcancel during a Hold releases it", async ({ page }) => {
  const driver = await touchDriver(page);

  await openGame(page);

  const game = await reachChallenge(page, driver, "hold");
  const spec = game.challenge?.spec;

  if (spec?.kind !== "hold") {
    throw new Error("no Hold in round 0");
  }

  const fraction = (now: GameSnapshot) =>
    (now.challenge?.progress.kind === "hold" ? now.challenge.progress.fraction : -1);

  await setTimescale(page, SLOW);
  await driver.press(spec.direction);
  await waitFor(page, (now) => fraction(now) > 0.1);
  await driver.cancel();
  await waitFor(page, (now) => now.challenge?.progress.kind === "hold" && !now.challenge.progress.held);
  expect(fraction(await readGame(page))).toBe(0);
  const held = await page.evaluate(
    (dir) => (window.debug.router as { isHeld(d: string): boolean }).isHeld(dir),
    spec.direction,
  );

  expect(held).toBe(false);

  // Still the same Hold, and it never completes on its own.
  await setTimescale(page, FAST);
  await page.waitForTimeout(600);
  expect((await readGame(page)).challenge?.index).toBe(game.challenge?.index);
});

test.describe("at the smallest square", () => {
  // iPhone 13 turned landscape, with its notch and home indicator faked: the smallest square of the presets.
  const INSETS: Insets = { top: 0, right: 47, bottom: 21, left: 47 };

  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });

  test("story pages never spill out of the text box", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-13", "the smallest square is the iPhone's");

    await openGame(page);
    await page.evaluate((insets) => {
      for (const [side, value] of Object.entries(insets)) {
        document.documentElement.style.setProperty(`--safe-area-${side}`, `${value}px`);
      }

      window.dispatchEvent(new Event("resize"));
    }, INSETS);
    await expect.poll(async () => (await readLayout(page)).safe.x).toBe(INSETS.left);

    const layout = await readLayout(page);
    const box = rectToScreen(layout, TEXT_BOX_RECT);
    const linesPerPage = storyLinesPerPage(layout);
    let pages = 0;

    expect(linesPerPage).toBeGreaterThanOrEqual(1);

    const checkPage = async () => {
      const text = await page.evaluate(() => {
        const story = (window.debug.scene as { parts: { storyText: Container } }).parts.storyText;
        const pieces = story.children.filter((child) => child.visible) as Text[];
        const { x, y, width, height } = story.getBounds();

        return { bounds: { x, y, width, height }, rows: new Set(pieces.map((piece) => piece.y)).size };
      });

      pages += 1;
      expect(text.rows).toBeGreaterThanOrEqual(1);
      expect(text.rows).toBeLessThanOrEqual(linesPerPage);
      expect(text.bounds.x).toBeGreaterThanOrEqual(box.x);
      expect(text.bounds.x + text.bounds.width).toBeLessThanOrEqual(box.x + box.width);
      expect(text.bounds.y).toBeGreaterThanOrEqual(box.y);
      expect(text.bounds.y + text.bounds.height).toBeLessThanOrEqual(box.y + box.height);
    };

    await playGame(page, await keyboardDriver(page), checkPage);
    // Every line has at least one page.
    expect(pages).toBeGreaterThanOrEqual(STORY_PARTS.flat().length);
  });
});

test("replays twice without growing timers, listeners or display objects", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "leaks don't depend on the device; three games are slow");

  const driver = await keyboardDriver(page);

  await openGame(page);
  await playGame(page, driver);

  const first = await readCounts(page);

  await playGame(page, driver);
  expect(await readCounts(page)).toEqual(first);
  await playGame(page, driver);
  expect(await readCounts(page)).toEqual(first);

  const game = await readGame(page);

  // `?seed=` gives game n the seed SEED + n − 1: every replay is a new game, still reproducible.
  expect([game.games, game.seed]).toEqual([4, SEED + 3]);
});
