import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Application, Container, Sprite, Text, Texture } from "pixi.js";
import type { PlayfieldDisplay } from "../src/core/display.ts";
import type { Layers } from "../src/core/layers.ts";
import { computeLayout, PLAYFIELD_SIZE, ZERO_INSETS, type Insets, type Layout, type Rect } from "../src/core/layout.ts";
import { MIN_TEXT_FONT_SIZE, rectToScreen, TEXT_BOX_RECT } from "../src/game/text-box.ts";

interface Debug {
  readonly app: Application;
  readonly display: PlayfieldDisplay;
  readonly layers: Layers;
  readonly layout: Layout;
  readonly scene?: { readonly textBox: Sprite; readonly line: Text };
  previousTexture?: Texture;
}

// Faked notches, set through the probe's CSS variables: a portrait iPhone and the same phone turned landscape.
const FAKE_INSETS: Record<"portrait" | "landscape", Insets> = {
  portrait: { top: 47, right: 0, bottom: 34, left: 0 },
  landscape: { top: 0, right: 47, bottom: 21, left: 47 },
};

const EPSILON_DIGITS = 6;

// Everything the assertions need, as plain data.
const readState = (page: Page) => page.evaluate(() => {
  const debug = window.debug as unknown as Debug;
  const { app, display, layers } = debug;
  const toRect = (container: Container) => {
    const { x, y, width, height } = container.getBounds();

    return { x, y, width, height };
  };
  const title = layers.top.getChildByLabel("title") as Sprite | null;
  const line = debug.scene?.line;

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    resolution: app.renderer.resolution,
    layout: debug.layout,
    k: display.scale,
    texture: {
      width: display.renderTexture.source.pixelWidth,
      height: display.renderTexture.source.pixelHeight,
      resolution: display.renderTexture.source.resolution,
      scaleMode: display.renderTexture.source.scaleMode,
    },
    sprite: toRect(display.sprite),
    stage: app.stage.children.map((child) => child.label),
    playfield: {
      parent: layers.playfield.parent?.label ?? null,
      position: { x: layers.playfield.position.x, y: layers.playfield.position.y },
      scale: { x: layers.playfield.scale.x, y: layers.playfield.scale.y },
    },
    artScaleMode: title?.texture.source.scaleMode ?? null,
    textBox: debug.scene ? { visible: debug.scene.textBox.visible } : null,
    line: line ? { bounds: toRect(line), fontSize: line.style.fontSize, lineHeight: line.style.lineHeight } : null,
    overlay: layers.ui.getChildByLabel("debug-overlay") !== null,
  };
});

type State = Awaited<ReturnType<typeof readState>>;

const expectedLayout = (state: State, insets: Insets) => computeLayout({
  width: state.viewport.width,
  height: state.viewport.height,
  insets,
  dpr: state.resolution,
});

const expectRectClose = (actual: Rect, expected: Rect) => {
  expect(actual.x).toBeCloseTo(expected.x, EPSILON_DIGITS);
  expect(actual.y).toBeCloseTo(expected.y, EPSILON_DIGITS);
  expect(actual.width).toBeCloseTo(expected.width, EPSILON_DIGITS);
  expect(actual.height).toBeCloseTo(expected.height, EPSILON_DIGITS);
};

const fakeInsets = (page: Page, insets: Insets) => page.evaluate((values) => {
  const root = document.documentElement.style;

  for (const side of ["top", "right", "bottom", "left"] as const) {
    root.setProperty(`--safe-area-${side}`, `${values[side]}px`);
  }

  // Insets alone don't resize #game: a real rotation would. Pixi's ResizePlugin listens to window `resize`.
  window.dispatchEvent(new Event("resize"));
}, insets);

const clearInsets = (page: Page) => page.evaluate(() => {
  const root = document.documentElement.style;

  for (const side of ["top", "right", "bottom", "left"]) {
    root.removeProperty(`--safe-area-${side}`);
  }

  window.dispatchEvent(new Event("resize"));
});

/** Waits until the page's layout matches `insets` and its viewport, then returns the state. */
const settle = async (page: Page, insets: Insets) => {
  await page.waitForFunction(() => (window.debug as unknown as Debug | undefined)?.scene !== undefined);
  await expect.poll(async () => {
    const state = await readState(page);

    return state.line !== null && JSON.stringify(state.layout) === JSON.stringify(expectedLayout(state, insets));
  }).toBe(true);

  // One more frame, so the render texture and the stage have drawn the new layout.
  await page.evaluate(() => new Promise(requestAnimationFrame));

  return readState(page);
};

const expectDisplay = (state: State, insets: Insets, testInfo: TestInfo) => {
  const { layout } = state;

  expect(layout).toEqual(expectedLayout(state, insets));

  // The render texture: 500·k device px at resolution 1, linear; the art stays nearest.
  const k = Math.max(1, Math.floor(layout.sideDevicePx / PLAYFIELD_SIZE));

  expect(state.k).toBe(k);
  expect(state.texture).toEqual({
    width: PLAYFIELD_SIZE * k,
    height: PLAYFIELD_SIZE * k,
    resolution: 1,
    scaleMode: "linear",
  });
  expect(state.artScaleMode).toBe("nearest");

  // The stage holds the display sprite, then ui. The playfield is off-stage and keeps an identity transform.
  expect(state.stage).toEqual(["playfield-display", "ui"]);
  expect(state.playfield).toEqual({ parent: null, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } });
  expectRectClose(state.sprite, layout.square);

  // The test line sits on the text box, centred, at least 16 CSS px, and its first line is inside the box.
  expect(state.textBox).toEqual({ visible: true });
  expect(state.line).not.toBeNull();

  const box = rectToScreen(layout, TEXT_BOX_RECT);
  const { bounds: line, fontSize, lineHeight } = state.line ?? { bounds: box, fontSize: 0, lineHeight: 0 };

  expect(fontSize).toBeGreaterThanOrEqual(MIN_TEXT_FONT_SIZE);
  expect(line.x).toBeGreaterThanOrEqual(box.x);
  expect(line.x + line.width).toBeLessThanOrEqual(box.x + box.width);
  expect(Math.abs(line.x + line.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
  expect(line.y).toBeGreaterThanOrEqual(box.y);
  expect(line.y + lineHeight).toBeLessThanOrEqual(box.y + box.height);

  // On a small square the 16 px floor wraps the line into more rows than the box holds: an open design question, so
  // it is reported rather than failed.
  if (line.y + line.height > box.y + box.height) {
    testInfo.annotations.push({
      type: "text overflow",
      description: `${state.viewport.width}×${state.viewport.height}: the text ends ${
        (line.y + line.height - box.y - box.height).toFixed(1)} CSS px below the box (square ${
        layout.square.width.toFixed(1)} CSS px, font ${fontSize.toFixed(1)} px)`,
    });
  }

  // Nothing scrolls.
  expect(state.document).toEqual(state.viewport);
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

const screenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  const path = testInfo.outputPath(`${name}.png`);

  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
};

test("renders the playfield through the render texture in both orientations, with and without insets", async ({
  page,
}, testInfo) => {
  const problems = watchErrors(page);
  const initial = page.viewportSize() ?? { width: 0, height: 0 };
  const short = Math.min(initial.width, initial.height);
  const long = Math.max(initial.width, initial.height);

  await page.goto("/?debug");

  for (const orientation of ["portrait", "landscape"] as const) {
    await page.setViewportSize(orientation === "portrait"
      ? { width: short, height: long }
      : { width: long, height: short });

    await clearInsets(page);
    expectDisplay(await settle(page, ZERO_INSETS), ZERO_INSETS, testInfo);
    await screenshot(page, testInfo, `${orientation}`);

    const insets = FAKE_INSETS[orientation];

    await fakeInsets(page, insets);

    const state = await settle(page, insets);

    expectDisplay(state, insets, testInfo);
    expect(state.layout.square.y).toBeGreaterThanOrEqual(insets.top);
    expect(state.layout.square.x).toBeGreaterThanOrEqual(insets.left);
    await screenshot(page, testInfo, `${orientation}-insets`);
  }

  expect((await readState(page)).overlay).toBe(true);
  expect(problems).toEqual([]);
});

test("recreates the render texture when k changes, and destroys the old one", async ({ page }, testInfo) => {
  const problems = watchErrors(page);

  await page.goto("/");
  await page.setViewportSize({ width: 600, height: 400 });

  const small = await settle(page, ZERO_INSETS);

  expect(small.k).toBe(Math.max(1, Math.floor(small.layout.sideDevicePx / PLAYFIELD_SIZE)));
  await page.evaluate(() => {
    const debug = window.debug as unknown as Debug;

    debug.previousTexture = debug.display.renderTexture;
  });

  // A square of 1000 device px or more at any DPR ≥ 1: k ≥ 2, and larger than the 600×400 window's.
  await page.setViewportSize({ width: 1500, height: 1100 });

  const large = await settle(page, ZERO_INSETS);

  expectDisplay(large, ZERO_INSETS, testInfo);
  expect(large.k).toBeGreaterThan(small.k);

  const swap = await page.evaluate(() => {
    const debug = window.debug as unknown as Debug;

    return {
      replaced: debug.previousTexture !== debug.display.renderTexture,
      destroyed: debug.previousTexture?.destroyed ?? false,
    };
  });

  expect(swap).toEqual({ replaced: true, destroyed: true });
  expect(problems).toEqual([]);
});

test("shows the debug overlay only with ?debug", async ({ page }) => {
  await page.goto("/");
  await settle(page, ZERO_INSETS);
  expect((await readState(page)).overlay).toBe(false);

  await page.goto("/?debug");
  await settle(page, ZERO_INSETS);
  expect((await readState(page)).overlay).toBe(true);
});
