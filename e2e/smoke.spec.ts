import { expect, test, type Page } from "@playwright/test";
import type { Application } from "pixi.js";
import { MAX_RESOLUTION, capResolution } from "../src/core/viewport.ts";

const readCanvas = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>("#game > canvas");
  const app = window.debug.app as Application;

  return {
    devicePixelRatio: window.devicePixelRatio,
    resolution: app.renderer.resolution,
    css: { width: canvas?.clientWidth, height: canvas?.clientHeight },
    backing: { width: canvas?.width, height: canvas?.height },
  };
});

test("loads into #game without errors, failed requests or page overflow", async ({ page }) => {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page).toHaveTitle("After the Waves Crash");
  await expect(page.locator("#game > canvas")).toHaveCount(1);

  const sizes = await page.evaluate(() => {
    const game = document.querySelector("#game");

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      game: { width: game?.clientWidth, height: game?.clientHeight },
    };
  });
  const canvas = await readCanvas(page);

  expect(sizes.document).toEqual(sizes.viewport);
  expect(sizes.game).toEqual(sizes.viewport);
  expect(canvas.css).toEqual(sizes.viewport);
  // The canvas renders at the device pixel ratio, capped.
  expect(canvas.resolution).toBe(capResolution(canvas.devicePixelRatio));
  expect(canvas.backing).toEqual({
    width: Math.round(sizes.viewport.width * canvas.resolution),
    height: Math.round(sizes.viewport.height * canvas.resolution),
  });
  expect(problems).toEqual([]);
});

// Headless Chromium only fires the media query `change` for an emulated DPR when the emulated size changes too, so each
// step nudges the width by 1 px and then restores it. The window `resize` that also causes reaches Pixi's ResizePlugin,
// but that path keeps the old resolution: only the DPR watcher in viewport.ts can move it.
test("follows device pixel ratio changes, capped", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator("#game > canvas")).toHaveCount(1);

  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const session = await page.context().newCDPSession(page);

  const emulate = (deviceScaleFactor: number, width: number) => session.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: viewport.height,
    deviceScaleFactor,
    mobile: isMobile,
  });

  for (const deviceScaleFactor of [1.5, MAX_RESOLUTION + 1, 1]) {
    const expected = capResolution(deviceScaleFactor);

    await emulate(deviceScaleFactor, viewport.width + 1);
    await expect.poll(async () => (await readCanvas(page)).resolution).toBe(expected);
    await emulate(deviceScaleFactor, viewport.width);
    await expect.poll(async () => (await readCanvas(page)).css).toEqual(viewport);

    const canvas = await readCanvas(page);

    expect(canvas.devicePixelRatio).toBe(deviceScaleFactor);
    expect(canvas.resolution).toBe(expected);
    expect(canvas.backing).toEqual({
      width: Math.round(viewport.width * expected),
      height: Math.round(viewport.height * expected),
    });
  }
});

test("blocks the context menu on the game", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#game > canvas")).toHaveCount(1);

  const prevented = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    document.querySelector("#game > canvas")?.dispatchEvent(event);

    return event.defaultPrevented;
  });

  expect(prevented).toBe(true);
});

test("sets viewport-fit=cover", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("meta[name=viewport]")).toHaveAttribute("content", /\bviewport-fit=cover\b/);
});

test("reads the safe-area insets through the probe, and fakes them through its CSS variables", async ({ page }) => {
  await page.goto("/");

  const readProbe = () => page.evaluate(() => {
    const probe = document.querySelector("#safe-area-probe");

    if (!probe) {
      return null;
    }

    const style = getComputedStyle(probe);

    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
  });

  // Emulation has no notch: env(safe-area-inset-*) resolves to 0.
  expect(await readProbe()).toEqual(["0px", "0px", "0px", "0px"]);

  await page.evaluate(() => {
    const root = document.documentElement.style;

    root.setProperty("--safe-area-top", "47px");
    root.setProperty("--safe-area-right", "0px");
    root.setProperty("--safe-area-bottom", "34px");
    root.setProperty("--safe-area-left", "12.5px");
  });

  expect(await readProbe()).toEqual(["47px", "0px", "34px", "12.5px"]);
});
