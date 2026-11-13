import { expect, test, type Page } from "@playwright/test";
import { rectToScreen, type Insets, type Rect } from "../src/core/layout.ts";
import type { Direction } from "../src/game/direction.ts";
import { createStoryCursor, type StoryPage } from "../src/game/story/cursor.ts";
import type { Measure } from "../src/game/story/paging.ts";
import { STORY_PARTS, type StoryLine } from "../src/game/story/script.ts";
import { storyLinesPerPage, TEXT_BOX_RECT } from "../src/game/text-box.ts";
import {
  answerChallenge,
  expectedTitleCues,
  FAST,
  isPadVisible,
  keyboardDriver,
  leaveTitle,
  openGame,
  playGame,
  playRound,
  readCounts,
  readCues,
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

/** The story text's bounds on screen and how many rows it shows, or null when it is hidden. */
const readStoryText = (page: Page) => page.evaluate(() => {
  const story = window.debug.scene?.parts.storyText;

  if (story === undefined || !story.visible) {
    return null;
  }

  const pieces = story.children.filter((child) => child.visible);
  const { x, y, width, height } = story.getBounds();

  return { bounds: { x, y, width, height }, rows: new Set(pieces.map((piece) => piece.y)).size };
});

const expectInside = (inner: Rect, outer: Rect) => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
};

/**
 * The longest page of `part`, as the game's cursor pages it with the page's measure (`debug.scene.paging`). The
 * measure is asked for in rounds, the texts the paging needed and didn't have yet, until a run needs none.
 */
const longestPage = async (page: Page, part: readonly StoryLine[], linesPerPage: number) => {
  const measured = new Map<string, readonly string[]>();

  for (;;) {
    const missing = new Set<string>();
    const measure: Measure = (text) => {
      const lines = measured.get(text);

      if (lines === undefined) {
        missing.add(text);
      }

      return lines ?? [];
    };
    const cursor = createStoryCursor(part, linesPerPage, measure);
    let longest: StoryPage | null = null;

    for (; cursor.page !== null; cursor.advance()) {
      if (longest === null || cursor.page.text.length > longest.text.length) {
        longest = cursor.page;
      }
    }

    if (missing.size === 0) {
      if (longest === null) {
        throw new Error("a story part with no page");
      }

      return longest;
    }

    const texts = [...missing];
    const lines = await page.evaluate((each) => {
      const paging = window.debug.scene?.paging;

      if (paging === undefined) {
        throw new Error("no scene");
      }

      return each.map((text) => paging.measure(text));
    }, texts);

    texts.forEach((text, index) => measured.set(text, lines[index] ?? []));
  }
};

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
  await leaveTitle(page, driver);
  await readStory(page, driver);
  await waitFor(page, (game) => game.state === "round");

  while ((await readGame(page)).challenge?.spec.kind !== kind) {
    await answerChallenge(page, driver);
  }

  return readGame(page);
};

// The keyboard plays whole games on desktop in the last two tests below. Touch plays rounds 0–1 on the iPhone, then
// jumps to the ending for the replay tap (m5-plan, owner decision 18): the rest is the same input path.
test("plays a game by touch: rounds 0–1, then the ending and the replay", { tag: "@touch" }, async ({ page }) => {
  const problems = watchErrors(page);
  const driver = await touchDriver(page);

  await openGame(page);

  const start = await readGame(page);

  await leaveTitle(page, driver);

  for (let part = 0; part < 2; part++) {
    await waitFor(page, (game) => game.state === "story" && game.part === part);
    expect(await isPadVisible(page)).toBe(false);
    await readStory(page, driver);
    await playRound(page, driver);
  }

  await page.evaluate(() => window.debug.machine.request("ending"));
  await waitFor(page, (game) => game.state === "ending" && game.phase === "replay");
  expect(await isPadVisible(page)).toBe(false);
  await driver.advance();
  await waitFor(page, (game) => game.state === "title" && game.games === start.games + 1);
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

test.describe("with both landscape pads", () => {
  test("a touchcancel releases a Hold; hand a Hold between thumbs, cancel one pad, chord, and slide across", {
    tag: "@touch",
  }, async ({ page }) => {
    // Two thumbs on two pads: the phone presets, turned landscape.
    const size = page.viewportSize() ?? { width: 0, height: 0 };

    await page.setViewportSize({ width: Math.max(size.width, size.height), height: Math.min(size.width, size.height) });

    const driver = await touchDriver(page);

    await openGame(page);
    expect((await readLayout(page)).zones).toHaveLength(2);

    const game = await reachChallenge(page, driver, "hold");
    const spec = game.challenge?.spec;

    if (spec?.kind !== "hold") {
      throw new Error("no Hold in round 0");
    }

    const dir = spec.direction;
    const other: Direction = dir === "up" ? "down" : "up";
    const hold = async () => {
      const now = await readGame(page);

      return now.challenge?.progress.kind === "hold" ? now.challenge.progress : null;
    };
    const isHeld = (which: Direction) => page.evaluate((d) => window.debug.router.isHeld(d), which);

    // Records the pointer ids the browser gives the touches, to cancel one of them on its own below.
    await page.evaluate(() => {
      const ids: { id: number; x: number }[] = [];

      document.querySelector("#game > canvas")?.addEventListener("pointerdown", (event) => {
        ids.push({ id: (event as PointerEvent).pointerId, x: (event as PointerEvent).clientX });
      });
      (window as unknown as { pointerIds: typeof ids }).pointerIds = ids;
    });
    await setTimescale(page, SLOW);

    // A touchcancel (the browser taking the gesture over) releases a Hold and resets it.
    await driver.press(dir);
    await expect.poll(async () => ((await hold())?.fraction ?? 0) > 0.1).toBe(true);
    await driver.cancel();
    await expect.poll(async () => (await hold())?.held).toBe(false);
    expect((await hold())?.fraction).toBe(0);
    expect(await isHeld(dir)).toBe(false);

    // Still the same Hold, and it never completes on its own.
    await setTimescale(page, FAST);
    await page.waitForTimeout(600);
    expect((await readGame(page)).challenge?.index).toBe(game.challenge?.index);
    await setTimescale(page, SLOW);

    // A chord inside one touchStart: the Hold's direction on one pad, another on the other. Both count.
    const chordA = await driver.point(dir, 0);
    const chordB = await driver.point(other, 1);

    await driver.down(chordA, chordB);
    await expect.poll(async () => [await isHeld(dir), await isHeld(other), (await hold())?.held]).toEqual([
      true,
      true,
      true,
    ]);
    await driver.up(chordA, chordB);
    await expect.poll(async () => (await hold())?.held).toBe(false);

    // A slide across the playfield to the other pad keeps the direction the touch went down on.
    const slide = await driver.point(dir, 0);
    const target = await driver.point(other, 1);

    await driver.down(slide);
    await expect.poll(async () => (await hold())?.held).toBe(true);

    for (const step of [0.25, 0.5, 0.75, 1]) {
      await driver.move(slide, slide.x + (target.x - slide.x) * step, slide.y + (target.y - slide.y) * step);
    }

    expect([await isHeld(dir), await isHeld(other), (await hold())?.held]).toEqual([true, false, true]);
    await driver.up(slide);
    await expect.poll(async () => (await hold())?.held).toBe(false);

    // A cancel of one pad while the other holds the same direction keeps it held. CDP can only cancel every touch at
    // once, so the browser's pointercancel for one pointer is sent synthetically to the canvas.
    const kept = await driver.point(dir, 0);
    const cancelled = await driver.point(dir, 1);

    await driver.down(kept);
    await driver.down(cancelled);
    await expect.poll(async () => (await hold())?.held).toBe(true);
    await page.evaluate((x) => {
      const ids = (window as unknown as { pointerIds: { id: number; x: number }[] }).pointerIds;
      const pointer = [...ids].reverse().find((each) => Math.abs(each.x - x) < 1);

      if (pointer === undefined) {
        throw new Error("no pointer at the cancelled touch");
      }

      document.querySelector("#game > canvas")?.dispatchEvent(new PointerEvent("pointercancel", {
        pointerId: pointer.id,
        pointerType: "touch",
        bubbles: true,
      }));
    }, cancelled.x);
    await page.waitForTimeout(100);
    expect([await isHeld(dir), (await hold())?.held]).toEqual([true, true]);
    await driver.up(kept, cancelled);
    await expect.poll(async () => (await hold())?.held).toBe(false);

    // A Hold handed from one thumb to the other keeps running, and completes.
    const first = await driver.point(dir, 0);
    const second = await driver.point(dir, 1);

    await driver.down(first);
    await expect.poll(async () => ((await hold())?.fraction ?? 0) > 0.05).toBe(true);
    await driver.down(second);
    await driver.up(first);

    const handed = await hold();

    expect(handed?.held).toBe(true);
    expect(handed?.fraction ?? 0).toBeGreaterThan(0.05);
    await setTimescale(page, FAST);
    await waitFor(page, (now) => now.challenge?.index !== game.challenge?.index || now.phase !== "play");
    await driver.up(second);
  });
});

test.describe("at the smallest square", () => {
  // iPhone 13 turned landscape, with its notch and home indicator faked: the smallest square of the presets.
  const INSETS: Insets = { top: 0, right: 47, bottom: 21, left: 47 };

  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });

  /**
   * The longest page of each story part, as the game pages it, shown with the scene's own `setStoryPage`: the cursor
   * (story/cursor.ts) runs here on the page's own measure, so the pages are the game's without reading through them.
   * paging.test.ts and cursor.test.ts cover the paging of the rest. The iPhone's size and DPR, on desktop: the paging
   * depends on the layout and the DPR, not on touch.
   */
  test("story pages never spill out of the text box", async ({ page }) => {
    await openGame(page);
    await page.evaluate((insets) => {
      for (const [side, value] of Object.entries(insets)) {
        document.documentElement.style.setProperty(`--safe-area-${side}`, `${value}px`);
      }

      window.dispatchEvent(new Event("resize"));
    }, INSETS);
    await expect.poll(async () => (await readLayout(page)).safe.x).toBe(INSETS.left);
    // The checks read the story text's layout, not pixels: the playfield, a 1000² texture drawn over most of a
    // 2532×1170 canvas each frame, is skipped. The ui layer, the story text's, still renders.
    await page.evaluate(() => {
      const { app, display } = window.debug;
      const sprite = app.stage.getChildByLabel("playfield-display");

      display.render = () => {};

      if (sprite !== null) {
        sprite.visible = false;
      }
    });

    const layout = await readLayout(page);
    const box = rectToScreen(layout, TEXT_BOX_RECT);
    const linesPerPage = storyLinesPerPage(layout);

    expect(linesPerPage).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => window.debug.scene?.paging.linesPerPage)).toBe(linesPerPage);

    for (const part of STORY_PARTS) {
      const longest = await longestPage(page, part, linesPerPage);

      await page.evaluate((shown) => window.debug.scene?.setStoryPage(shown), longest);

      const text = await readStoryText(page);

      if (text === null) {
        throw new Error("a story page is shown without its text");
      }

      expect(text.rows).toBeGreaterThanOrEqual(1);
      expect(text.rows).toBeLessThanOrEqual(linesPerPage);
      expectInside(text.bounds, box);
    }
  });
});

/** Sea front, mid and back, two cloud sprites and the whole boat (scene/world.ts), plus the prompt's pulse. */
const TITLE_CLIPS = 7;

/** Game ms on the clock. */
const readNow = (page: Page) => page.evaluate(() => window.debug.clock.now);

/**
 * Waits for Title's prompt and its fade-ins (1 s of game time), then for the clips playing to come down to TITLE_CLIPS:
 * the six ambient loops and the prompt's pulse, between ambient strikes (a strike plays two clips for 0.67 s every
 * 7–10 s). At FAST time a read lands between strikes most of the time, and the poll retries; a leaked clip keeps the
 * count above it for good.
 */
const expectTitleClips = async (page: Page) => {
  await setTimescale(page, FAST);
  await waitFor(page, (game) => game.state === "title" && game.phase === "prompt");

  const fadedInAt = (await readNow(page)) + 1000;

  await expect.poll(() => readNow(page)).toBeGreaterThanOrEqual(fadedInAt);
  await expect.poll(() => page.evaluate(() => window.debug.anim.active)).toBe(TITLE_CLIPS);
};

const POLL = { intervals: [20, 50, 100], timeout: 15_000 };

test.describe("on a small viewport", () => {
  // The checks read the game, not pixels: every frame renders cheaper.
  test.use({ viewport: { width: 640, height: 400 } });

  /**
   * Two games by keyboard, at FAST time. The first plays its cues at the plan's times; the replay doesn't grow timers,
   * listeners, display objects or clips. The music on its bar (9.6 s) is the audio unit tests': bar-clock.test.ts (the
   * bar grid), overlay-plan.test.ts (part → track, per-bar restarts) and audio-engine.test.ts (changes on the bar,
   * bgm02 finishing first), m5-plan owner decision 16. The clock and leaks don't depend on the device: desktop only
   * (untagged, playwright.config.ts).
   */
  test("plays its cues on time, then replays without growing anything", async ({ page }) => {
    const problems = watchErrors(page);
    const driver = await keyboardDriver(page);

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

    await expectTitleClips(page);
    await playGame(page, driver);

    const played = (await readCues(page)).filter((cue) => cue.state !== "title").map(({ name, state, at }) => ({
      name,
      state,
      at: Math.round(at),
    }));

    expect(played).toEqual([
      { name: "lightning", state: "story", at: 1250 },
      { name: "lightning", state: "transition", at: 167 },
      { name: "lightning", state: "transition", at: 167 },
      { name: "lightning", state: "transition", at: 167 },
      { name: "kraken", state: "ending", at: 1500 },
    ]);
    expect((await readGame(page)).games).toBe(2);

    // The replay.
    const first = await readCounts(page);

    await expectTitleClips(page);
    await playGame(page, driver);
    expect(await readCounts(page)).toEqual(first);
    await expectTitleClips(page);

    const game = await readGame(page);

    // `?seed=` gives game n the seed SEED + n − 1: every replay is a new game, still reproducible.
    expect([game.games, game.seed]).toEqual([3, SEED + 2]);
    expect(problems).toEqual([]);
  });
});
