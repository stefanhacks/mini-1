import { expect, test } from "@playwright/test";

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
    const canvas = document.querySelector<HTMLCanvasElement>("#game > canvas");

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      game: { width: game?.clientWidth, height: game?.clientHeight },
      canvas: { width: canvas?.clientWidth, height: canvas?.clientHeight },
      backing: { width: canvas?.width, height: canvas?.height },
      resolution: Math.min(window.devicePixelRatio, 3),
    };
  });

  expect(sizes.document).toEqual(sizes.viewport);
  expect(sizes.game).toEqual(sizes.viewport);
  expect(sizes.canvas).toEqual(sizes.viewport);
  // The canvas renders at the device pixel ratio, capped at 3.
  expect(sizes.backing).toEqual({
    width: Math.round(sizes.viewport.width * sizes.resolution),
    height: Math.round(sizes.viewport.height * sizes.resolution),
  });
  expect(problems).toEqual([]);
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
