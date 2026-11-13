// The story's typewriter in the real page: a page types in, a tap completes it without advancing, the next tap
// advances, and a resize mid-story keeps what shows without spilling out of the text box, and never draws a page paged
// for the old layout. Desktop only (untagged, playwright.config.ts): typing doesn't depend on the device. Written by
// Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { rectToScreen, type Rect } from "../src/core/layout.ts";
import { storyLinesPerPage, TEXT_BOX_RECT } from "../src/game/text-box.ts";
import {
  keyboardDriver,
  leaveTitle,
  openGame,
  readGame,
  setTimescale,
  waitFor,
  type Driver,
  type GameSnapshot,
} from "./game.ts";

test.use({ deviceScaleFactor: 1 });

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

const isInside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.x + inner.width <= outer.x + outer.width
  && inner.y >= outer.y && inner.y + inner.height <= outer.y + outer.height;

/**
 * Resizes the renderer as a resize event would, synchronously, and reads the story text before any frame runs: what
 * showed, whether the text is drawn, and its bounds.
 */
const resizeNow = (page: Page, width: number, height: number) => page.evaluate(([width, height]) => {
  const { app, scene } = window.debug;
  const shown = window.debug.game.page?.revealed ?? 0;

  app.renderer.resize(width, height, app.renderer.resolution);

  const story = scene?.parts.storyText;
  const bounds = story?.getBounds();

  return {
    shown,
    visible: story?.visible ?? false,
    bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
    layout: window.debug.layout,
  };
}, [width, height] as const);

/** Waits for the page to be fully typed, a tap completing it (one that doesn't advance). */
const completePage = async (page: Page, driver: Driver) => {
  if ((await readGame(page)).page?.typed !== true) {
    await driver.advance();
    await expect.poll(async () => (await readGame(page)).page?.typed, POLL).toBe(true);
  }
};

test("a resize mid-story keeps what shows, never spills out of the text box, nor shows a page paged for the old layout",
  async ({ page }) => {
    const { driver } = await toTypingPage(page);
    const large = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

    // Mid-typing, from the default 1280×720 to 600×400, which leaves a 200 px square between the 200 px bands: the
    // line pages again.
    const typing = await resizeNow(page, 600, 400);
    const box = rectToScreen(typing.layout, TEXT_BOX_RECT);

    expect(typing.layout.square.width).toBe(200);

    await expect.poll(async () => (await readStoryText(page)) !== null, POLL).toBe(true);

    const after = await readGame(page);
    const text = await readStoryText(page);

    if (after.page === null || text === null) {
      throw new Error("the page is gone after the resize");
    }

    // Same page start, and what showed still shows (cut to the new page if that is shorter).
    expect([after.page.line, after.page.page]).toEqual([0, 0]);
    expect(after.page.revealed).toBeGreaterThanOrEqual(Math.min(typing.shown, after.page.text.length));
    expectInside(text.bounds, box);
    expect(text.rows).toBeLessThanOrEqual(storyLinesPerPage(typing.layout));

    // Fully shown, the page still fits.
    await completePage(page, driver);

    const full = await readStoryText(page);

    expect(full).not.toBeNull();
    expectInside(full?.bounds ?? { x: 0, y: 0, width: 0, height: 0 }, box);
    expect(full?.rows).toBeLessThanOrEqual(storyLinesPerPage(typing.layout));

    // Back to the large viewport and fully typed there, so the whole page is drawn; then down again: the old page must
    // not be drawn at the new size, before any frame runs.
    await resizeNow(page, large.width, large.height);
    await expect.poll(async () => (await readStoryText(page))?.bounds.width ?? 0, POLL)
      .toBeGreaterThan(full?.bounds.width ?? 0);
    await completePage(page, driver);

    const longest = (await readGame(page)).page?.text ?? "";

    // The first line is the longest of part 0: at a 200 px square it takes several pages of one line.
    expect(longest.length).toBeGreaterThan(60);

    const before = await resizeNow(page, 600, 400);

    // Hidden until it is paged again, or drawn inside the new box: never the old page at the new size.
    expect(!before.visible || (before.bounds !== null && isInside(before.bounds, box)), JSON.stringify(before))
      .toBe(true);

    // On the next update the story state pages the line again and shows the current page, inside the box.
    await expect.poll(async () => (await readStoryText(page)) !== null, POLL).toBe(true);

    const again = await readStoryText(page);

    expectInside(again?.bounds ?? { x: 0, y: 0, width: 0, height: 0 }, box);
    expect(again?.rows).toBeLessThanOrEqual(storyLinesPerPage(before.layout));
    expect(await readGame(page)).toMatchObject({ state: "story", part: 0 });
  });
