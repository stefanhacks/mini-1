// The story's typewriter in the real page: a page types in, a tap completes it without advancing, the next tap
// advances, and a resize mid-typing keeps what shows without spilling out of the text box. Desktop only (untagged,
// playwright.config.ts): typing doesn't depend on the device. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { rectToScreen, type Rect } from "../src/core/layout.ts";
import { storyLinesPerPage, TEXT_BOX_RECT } from "../src/game/text-box.ts";
import { keyboardDriver, leaveTitle, openGame, readGame, setTimescale, waitFor, type GameSnapshot } from "./game.ts";

// A small viewport at DPR 1: the checks read the text's layout, and every frame renders cheaper.
test.use({ deviceScaleFactor: 1, viewport: { width: 640, height: 400 } });

// Slow enough that a page of 60+ characters takes seconds to type, so a tap surely lands while it types.
const CRAWL = 0.25;

const POLL = { intervals: [10, 20, 30], timeout: 15_000 };

const pageKey = (game: GameSnapshot) => `${game.state}:${game.part}:${game.page?.line}:${game.page?.page}`;

/** The story text's bounds on screen, its rows and its shown characters, or null when hidden. */
const readStoryText = (page: Page) => page.evaluate(() => {
  const story = window.debug.scene?.parts.storyText;

  if (story === undefined || !story.visible) {
    return null;
  }

  const pieces = story.children.filter((child) => child.visible) as unknown as { y: number; text: string }[];
  const { x, y, width, height } = story.getBounds();

  return {
    bounds: { x, y, width, height },
    rows: new Set(pieces.map((piece) => piece.y)).size,
    shown: pieces.map((piece) => piece.text).join("").replace(/\s/gu, "").length,
  };
});

const expectInside = (inner: Rect, outer: Rect) => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
};

/** From a fresh game to part 0's first page, caught while it types, then slowed to CRAWL. */
const toTypingPage = async (page: Page) => {
  const driver = await keyboardDriver(page);

  await openGame(page);
  // Title's intro runs at FAST time (leaveTitle), then its exit fade, the preamble and the typing at real time.
  await setTimescale(page, 1);
  await leaveTitle(page, driver);
  await waitFor(page, (game) => game.page !== null);
  await setTimescale(page, CRAWL);

  const game = await readGame(page);

  if (game.page === null) {
    throw new Error("no page shown");
  }

  expect(game.page.text.length).toBeGreaterThan(40);
  expect(game.page.typed).toBe(false);
  expect(game.page.revealed).toBeGreaterThanOrEqual(1);
  expect(game.page.revealed).toBeLessThan(game.page.text.length);

  return { driver, game };
};

test("a page types in, a tap completes it without advancing, the next tap advances", async ({ page }) => {
  const { driver, game: first } = await toTypingPage(page);

  // The text shows only the typed characters.
  const partial = await readStoryText(page);

  expect(partial).not.toBeNull();
  expect(partial?.shown).toBeLessThan(first.page?.text.replace(/\s/gu, "").length ?? 0);

  await driver.advance();
  // At CRAWL the rest would take seconds to type: typed this soon, it was the tap.
  await expect.poll(async () => (await readGame(page)).page?.typed, { ...POLL, timeout: 1_000 }).toBe(true);

  const completed = await readGame(page);

  expect(pageKey(completed)).toBe(pageKey(first));
  expect(completed.page?.revealed).toBe(completed.page?.text.length);
  expect((await readStoryText(page))?.shown).toBe(first.page?.text.replace(/\s/gu, "").length);

  // The next tap (once past the 200 ms debounce, 800 ms of wall time at CRAWL) advances, to a page that types again.
  await expect.poll(async () => {
    if (pageKey(await readGame(page)) === pageKey(first)) {
      await driver.advance();
      await page.waitForTimeout(50);
    }

    return pageKey(await readGame(page)) !== pageKey(first);
  }, POLL).toBe(true);

  const next = await readGame(page);

  expect(next.state).toBe("story");
  expect(next.page?.typed).toBe(false);
  expect(next.page?.revealed).toBeLessThan(next.page?.text.length ?? 0);
});

test("a resize mid-typing never shows a page paged for the old layout, keeps what shows, and never spills", async ({
  page,
}) => {
  const { driver } = await toTypingPage(page);

  // Resizes the renderer as a resize event would, synchronously, and reads the text before any frame runs: the old
  // page must not be drawn at the new size. 600×400 leaves a 200 px square between the 200 px bands, so the line
  // pages again.
  const before = await page.evaluate(() => {
    const { app, scene } = window.debug;
    const shown = window.debug.game.page?.revealed ?? 0;

    app.renderer.resize(600, 400, app.renderer.resolution);

    const story = scene?.parts.storyText;
    const bounds = story?.getBounds();

    return {
      shown,
      visible: story?.visible ?? false,
      bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
      layout: window.debug.layout,
    };
  });
  const box = rectToScreen(before.layout, TEXT_BOX_RECT);

  expect(before.layout.square.width).toBe(200);

  if (before.visible && before.bounds !== null) {
    expectInside(before.bounds, box);
  }

  await expect.poll(async () => (await readStoryText(page)) !== null, POLL).toBe(true);

  const after = await readGame(page);
  const text = await readStoryText(page);

  if (after.page === null || text === null) {
    throw new Error("the page is gone after the resize");
  }

  // Same page start, and what showed still shows (cut to the new page if that is shorter).
  expect([after.page.line, after.page.page]).toEqual([0, 0]);
  expect(after.page.revealed).toBeGreaterThanOrEqual(Math.min(before.shown, after.page.text.length));
  expectInside(text.bounds, box);
  expect(text.rows).toBeLessThanOrEqual(storyLinesPerPage(before.layout));

  // Fully shown, the page still fits.
  if (!after.page.typed) {
    await driver.advance();
    await expect.poll(async () => (await readGame(page)).page?.typed, POLL).toBe(true);
  }

  const full = await readStoryText(page);

  expect(full).not.toBeNull();
  expectInside(full?.bounds ?? { x: 0, y: 0, width: 0, height: 0 }, box);
  expect(full?.rows).toBeLessThanOrEqual(storyLinesPerPage(before.layout));
});
