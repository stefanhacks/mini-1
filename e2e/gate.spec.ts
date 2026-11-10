// The start gate and the mute button (m3-plan, deliverables 2 and 4). Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import { openGame, readGame, readGatePhase, readLayout, SEED, waitForGateReady } from "./game.ts";

const POLL = { intervals: [20, 50, 100], timeout: 45_000 };

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

  await page.mouse.click(square.x + square.width / 2, square.y + square.height / 2);
};

const tapMute = async (page: Page) => {
  const rect = await page.evaluate(() => window.debug.router.muteRect);

  if (rect === null) {
    throw new Error("no mute button");
  }

  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
};

test("shows progress and the warning, then Tap to begin, whose tap starts the music and goes to Title", async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

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

  release();
  await waitForGateReady(page);
  await expect.poll(async () => (await readGateScreen(page)).prompt, POLL).toBe("Tap to begin");
  expect((await readGateScreen(page)).bar).toBe(false);
  expect(await page.evaluate(() => window.debug.audio.debug.barAnchor)).toBeNull();

  await tapPlayfield(page);
  await expect.poll(async () => (await readGame(page)).state, POLL).toBe("title");

  const audio = await page.evaluate(() => window.debug.audio.debug);

  expect(audio.contextState).toBe("running");
  expect(audio.barAnchor).not.toBeNull();
  expect((await readGateScreen(page)).warning).toBeNull();
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
