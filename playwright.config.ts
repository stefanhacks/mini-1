import { defineConfig, devices } from "@playwright/test";

// Not 4173, `vite preview`'s default: a preview left running there could be serving a stale build.
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Tests run against the production build, served by `vite preview`, so they see what Netlify ships. Every project
// runs in Chromium: the iPhone preset defaults to WebKit, but only Chromium is installed in the cloud environment. The
// preset still brings the iPhone's viewport, DPR, touch and user agent.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  // Most checks don't depend on the device, so they run on desktop only. The phones run only the tests tagged with
  // what makes them device-specific (Playwright's grep matches tags):
  // - `@device` (layout, DPR, safe areas) runs on every project;
  // - `@tap` (a tap's pointer path: the mouse on desktop, a real touch sequence on a phone) on desktop and the iPhone;
  // - `@touch` (touch sequences, landscape pads, the touchend unlock fallback) on the iPhone only. The touch tests
  //   force DPR 1 and differ from the Pixel only by a few percent of viewport, so one phone is enough; the Pixel's
  //   own fractional DPR is what `@device` checks.
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] }, grepInvert: /@touch/ },
    { name: "iphone-13", use: { ...devices["iPhone 13"], browserName: "chromium" }, grep: /@device|@tap|@touch/ },
    { name: "pixel-7", use: { ...devices["Pixel 7"] }, grep: /@device/ },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
