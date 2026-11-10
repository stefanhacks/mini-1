import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Application, Container, Sprite, Text } from "pixi.js";
import type { PlayfieldDisplay } from "../src/core/display.ts";
import type { Layers } from "../src/core/layers.ts";
import {
  computeLayout,
  rectToScreen,
  ZERO_INSETS,
  PLAYFIELD_SIZE,
  type Insets,
  type Layout,
  type Rect,
} from "../src/core/layout.ts";
import { renderTextureScale } from "../src/core/render-scale.ts";
import { floorToDevicePixels } from "../src/core/viewport.ts";
import { MIN_TEXT_FONT_SIZE, storyLinesPerPage, TEXT_BOX_RECT } from "../src/game/text-box.ts";

interface Debug {
  readonly app: Application;
  readonly display: PlayfieldDisplay;
  readonly layers: Layers;
  readonly layout: Layout;
  readonly scene?: { readonly textBox: Sprite; readonly line: Text };
}

// Faked notches, set through the probe's CSS variables: a portrait iPhone and the same phone turned landscape.
const FAKE_INSETS: Record<"portrait" | "landscape", Insets> = {
  portrait: { top: 47, right: 0, bottom: 34, left: 0 },
  landscape: { top: 0, right: 47, bottom: 21, left: 47 },
};

// Art the pixel checks sample, in playfield px: the title logo (330×64 at 250, 215) and the boat (32×32 at 250, 310).
const TITLE_RECT: Rect = { x: 85, y: 183, width: 330, height: 64 };
const BOAT_RECT: Rect = { x: 234, y: 294, width: 32, height: 32 };

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
    k: display.renderScale,
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
    line: line
      ? { bounds: toRect(line), fontSize: Number(line.style.fontSize), lineHeight: line.style.lineHeight }
      : null,
    overlay: layers.ui.getChildByLabel("debug-overlay") !== null,
  };
});

type State = Awaited<ReturnType<typeof readState>>;

/**
 * Reads the render texture back and checks the art in `rects` (playfield px): how many art pixels are lit, and how
 * many don't come out as a uniform k×k block of device pixels. Without `ownResize`, it reads the texture as it is; with
 * it, it first resizes the renderer to that size, synchronously, as a resize event would, and reads the texture before
 * any frame runs.
 */
const readArt = (page: Page, rects: readonly Rect[], ownResize?: { width: number; height: number }) =>
  page.evaluate(({ rects, ownResize }) => {
    const { app, display } = window.debug as unknown as Debug;

    if (ownResize) {
      app.renderer.resize(ownResize.width, ownResize.height, app.renderer.resolution);
    }

    const k = display.renderScale;
    const { pixels, width } = app.renderer.extract.pixels(display.renderTexture);
    const at = (x: number, y: number) => (y * width + x) * 4;
    let lit = 0;
    let torn = 0;

    for (const rect of rects) {
      for (let artY = rect.y; artY < rect.y + rect.height; artY++) {
        for (let artX = rect.x; artX < rect.x + rect.width; artX++) {
          const first = at(artX * k, artY * k);
          let uniform = true;

          for (let dy = 0; dy < k && uniform; dy++) {
            for (let dx = 0; dx < k && uniform; dx++) {
              const index = at(artX * k + dx, artY * k + dy);

              for (let channel = 0; channel < 4; channel++) {
                uniform &&= pixels[index + channel] === pixels[first + channel];
              }
            }
          }

          torn += uniform ? 0 : 1;
          lit += pixels[first] + pixels[first + 1] + pixels[first + 2] > 3 * 128 ? 1 : 0;
        }
      }
    }

    return { k, size: width, lit, torn };
  }, { rects, ownResize });

// The layout main.ts computes: from #game (the viewport) floored to whole device pixels.
const expectedLayout = (state: State, insets: Insets) => computeLayout({
  width: floorToDevicePixels(state.viewport.width, state.resolution),
  height: floorToDevicePixels(state.viewport.height, state.resolution),
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

  // Insets alone don't resize #game: a real rotation would. main.ts also resizes on window `resize`.
  window.dispatchEvent(new Event("resize"));
}, insets);

const clearInsets = (page: Page) => page.evaluate(() => {
  const root = document.documentElement.style;

  for (const side of ["top", "right", "bottom", "left"]) {
    root.removeProperty(`--safe-area-${side}`);
  }

  window.dispatchEvent(new Event("resize"));
});

const nextFrame = (page: Page) => page.evaluate(() => new Promise(requestAnimationFrame));

/** Waits until the page's layout matches `insets` and its viewport, then returns the state. */
const settle = async (page: Page, insets: Insets) => {
  await page.waitForFunction(() => (window.debug as unknown as Debug | undefined)?.scene !== undefined);
  await expect.poll(async () => {
    const state = await readState(page);

    return state.line !== null && JSON.stringify(state.layout) === JSON.stringify(expectedLayout(state, insets));
  }).toBe(true);

  // Two more frames, so the render texture, the text and the stage have all drawn the new layout.
  await nextFrame(page);
  await nextFrame(page);

  return readState(page);
};

const expectDisplay = (state: State, insets: Insets) => {
  const { layout } = state;

  expect(layout).toEqual(expectedLayout(state, insets));

  // The render texture: 500·k device px at resolution 1, linear; the art stays nearest.
  const k = renderTextureScale(layout.sideDevicePx);

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

  // The test line sits on the text box, centred, at least 16 CSS px, and never spills out of it: it shows only as many
  // lines as a page holds.
  expect(state.textBox).toEqual({ visible: true });

  if (state.line === null) {
    throw new Error("the scene has no test line");
  }

  const box = rectToScreen(layout, TEXT_BOX_RECT);
  const { bounds: line, fontSize, lineHeight } = state.line;
  const lines = Math.round(line.height / lineHeight);

  expect(fontSize).toBeGreaterThanOrEqual(MIN_TEXT_FONT_SIZE);
  expect(lines).toBeGreaterThanOrEqual(1);
  expect(lines).toBeLessThanOrEqual(storyLinesPerPage(layout));
  expect(line.x).toBeGreaterThanOrEqual(box.x);
  expect(line.x + line.width).toBeLessThanOrEqual(box.x + box.width);
  expect(Math.abs(line.x + line.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
  expect(line.y).toBeGreaterThanOrEqual(box.y);
  expect(line.y + line.height).toBeLessThanOrEqual(box.y + box.height);

  // Nothing scrolls.
  expect(state.document).toEqual(state.viewport);
};

/** The title is drawn, and every sampled art pixel is a uniform k×k block: pixel-sharp, no torn rows. */
const expectSharpArt = (art: Awaited<ReturnType<typeof readArt>>, k: number) => {
  expect(art.k).toBe(k);
  expect(art.size).toBe(PLAYFIELD_SIZE * k);
  expect(art.lit).toBeGreaterThan(1000);
  expect(art.torn).toBe(0);
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

    const plain = await settle(page, ZERO_INSETS);

    expectDisplay(plain, ZERO_INSETS);
    expectSharpArt(await readArt(page, [TITLE_RECT, BOAT_RECT]), plain.k);
    await screenshot(page, testInfo, `${orientation}`);

    const insets = FAKE_INSETS[orientation];

    await fakeInsets(page, insets);

    const state = await settle(page, insets);

    expectDisplay(state, insets);
    expect(state.layout.square.y).toBeGreaterThanOrEqual(insets.top);
    expect(state.layout.square.x).toBeGreaterThanOrEqual(insets.left);
    await screenshot(page, testInfo, `${orientation}-insets`);
  }

  expect((await readState(page)).overlay).toBe(true);
  expect(problems).toEqual([]);
});

test("resizes the same render texture when k changes, already drawn when the resize returns", async ({ page }) => {
  const problems = watchErrors(page);

  await page.goto("/");
  await page.setViewportSize({ width: 600, height: 400 });

  const small = await settle(page, ZERO_INSETS);

  await page.evaluate(() => {
    const debug = window.debug as unknown as Debug & { firstTexture?: unknown };

    debug.firstTexture = debug.display.renderTexture;
  });

  // A 1100 px square is 1100 device px or more at any DPR ≥ 1: k ≥ 2, larger than the 600×400 window's. Read before
  // any frame runs, the texture already holds the art at the new size: the stage drawn right after shows no gap.
  const resized = await readArt(page, [TITLE_RECT, BOAT_RECT], { width: 1500, height: 1100 });

  expect(resized.k).toBeGreaterThan(small.k);
  expectSharpArt(resized, resized.k);

  // Then the real viewport, and every size check.
  await page.setViewportSize({ width: 1500, height: 1100 });

  const large = await settle(page, ZERO_INSETS);

  expectDisplay(large, ZERO_INSETS);
  expect(large.k).toBe(resized.k);
  expectSharpArt(await readArt(page, [TITLE_RECT, BOAT_RECT]), large.k);

  // And back down: the same texture throughout, with no stale size left in the sprite.
  await page.setViewportSize({ width: 600, height: 400 });

  const again = await settle(page, ZERO_INSETS);

  expectDisplay(again, ZERO_INSETS);
  expectSharpArt(await readArt(page, [TITLE_RECT, BOAT_RECT]), small.k);
  expect(await page.evaluate(() => {
    const debug = window.debug as unknown as Debug & { firstTexture?: unknown };

    return debug.firstTexture === debug.display.renderTexture;
  })).toBe(true);
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

test.describe("at a fractional device pixel ratio", () => {
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 });

  test("backs the canvas with exactly its CSS size × resolution, in whole device pixels", async ({ page }) => {
    await page.goto("/");
    await settle(page, ZERO_INSETS);

    const canvas = await page.evaluate(() => {
      const element = document.querySelector<HTMLCanvasElement>("#game > canvas");
      const { app } = window.debug as unknown as Debug;

      if (!element) {
        throw new Error("no canvas");
      }

      return {
        resolution: app.renderer.resolution,
        backing: { width: element.width, height: element.height },
        css: { width: Number.parseFloat(element.style.width), height: Number.parseFloat(element.style.height) },
      };
    });

    expect(canvas.resolution).toBe(2.625);
    // 412 × 2.625 = 1081.5 and 915 × 2.625 = 2401.875 device px: floored, never rounded up past the viewport.
    expect(canvas.backing).toEqual({ width: 1081, height: 2401 });
    // The CSS size × resolution is the backing, so the browser copies it 1:1 instead of resampling it, up to Chromium's
    // six-digit serialization of the inline style (411.81px). ResizeObserver's device-pixel-content-box can't confirm
    // the painted size here: under DPR emulation headless Chromium reports it in CSS px (412×915).
    expect(Math.abs(canvas.css.width * canvas.resolution - canvas.backing.width)).toBeLessThan(0.01);
    expect(Math.abs(canvas.css.height * canvas.resolution - canvas.backing.height)).toBeLessThan(0.01);
  });
});
