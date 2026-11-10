// The page shell around the canvas: the #game container, the safe-area insets, the device pixel ratio and the resize
// events. Pixi's ResizePlugin is not used: it sizes the canvas from clientWidth/clientHeight, which leaves a fractional
// device pixel at fractional ratios (see `readGameSize`), and only listens to `window`. The DOM is only touched inside
// functions, so the pure helpers stay testable under node.

/** Canvas resolution cap. Low-end Android phones report DPR 3.5–4; 3 bounds the fill cost. */
export const MAX_RESOLUTION = 3;

const GAME_SELECTOR = "#game";
const SAFE_AREA_PROBE_SELECTOR = "#safe-area-probe";

/** Safe-area insets in CSS px. */
export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

type PaddingStyle = Pick<CSSStyleDeclaration, "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft">;

/** Parses a computed CSS length such as `"47px"`. Anything not a finite, non-negative length reads as 0. */
export const parseCssPx = (value: string) => {
  const px = Number.parseFloat(value);

  return Number.isFinite(px) && px > 0 ? px : 0;
};

/** Reads the insets from the probe's computed padding. */
export const parseSafeAreaInsets = (style: PaddingStyle): SafeAreaInsets => ({
  top: parseCssPx(style.paddingTop),
  right: parseCssPx(style.paddingRight),
  bottom: parseCssPx(style.paddingBottom),
  left: parseCssPx(style.paddingLeft),
});

/** The canvas resolution for a device pixel ratio: capped at MAX_RESOLUTION, and 1 when the ratio is unusable. */
export const capResolution = (devicePixelRatio: number) =>
  Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(devicePixelRatio, MAX_RESOLUTION) : 1;

// Absorbs float noise such as 0.1 * 3 = 0.30000000000000004 before flooring to device pixels.
const DEVICE_PX_EPSILON = 1e-6;

/** Rounds a CSS length down to whole device pixels at `resolution`. */
export const floorToDevicePixels = (length: number, resolution: number) =>
  Math.floor(length * resolution + DEVICE_PX_EPSILON) / resolution;

const requireElement = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);

  if (!element) {
    throw new Error(`index.html has no ${selector} element.`);
  }

  return element;
};

/** The element the canvas lives in and Pixi resizes to. */
export const getGameElement = () => requireElement(GAME_SELECTOR);

/** The current safe-area insets. Cheap enough to call on every resize. */
export const readSafeAreaInsets = () => parseSafeAreaInsets(getComputedStyle(requireElement(SAFE_AREA_PROBE_SELECTOR)));

/** The current device pixel ratio, capped. Read it again on resize: it changes with browser zoom and across screens. */
export const readResolution = () => capResolution(window.devicePixelRatio);

/**
 * The CSS size to give the renderer for `element` at `resolution`: its layout box, floored to whole device pixels.
 * Pixi rounds the canvas backing to `round(size × resolution)`. With a fractional ratio that can be half a device
 * pixel larger than the box (412 CSS px at 2.625 is 1081.5 device px, backed by 1082), and the browser then resamples
 * the whole canvas to fit. Flooring keeps the backing equal to the canvas's CSS size × resolution, so it is copied 1:1;
 * at most one device pixel row and column of #game's black stays uncovered.
 */
export const readGameSize = (element: HTMLElement, resolution: number) => {
  const { width, height } = element.getBoundingClientRect();

  return { width: floorToDevicePixels(width, resolution), height: floorToDevicePixels(height, resolution) };
};

/**
 * Coalesces calls to `resize` into one per animation frame. Returns the function that queues it.
 * `requestAnimationFrame` is the browser's frame clock, not a game timer, so it doesn't go through clock.ts.
 */
export const createResizeQueue = (resize: () => void) => {
  let pending = 0;

  return () => {
    if (pending !== 0) {
      return;
    }

    pending = requestAnimationFrame(() => {
      pending = 0;
      resize();
    });
  };
};

/** Calls `onResize` on `window` `resize`. Returns a function that removes the listener. */
export const onWindowResize = (onResize: () => void) => {
  window.addEventListener("resize", onResize);

  return () => window.removeEventListener("resize", onResize);
};

/** Stops the long-press and right-click menu on `element`. Returns a function that removes the listener. */
export const blockContextMenu = (element: HTMLElement) => {
  const prevent = (event: Event) => {
    event.preventDefault();
  };

  element.addEventListener("contextmenu", prevent);

  return () => element.removeEventListener("contextmenu", prevent);
};

/**
 * Calls `onResize` on `visualViewport` resizes: iOS URL-bar and keyboard changes that never fire `window` `resize`.
 * Pass the queue from `createResizeQueue`, which coalesces to one resize per frame. `scroll` is left out: it only
 * moves the visual viewport (pinch-zoom panning, keyboard offset) without resizing #game, and fires on every frame of a
 * pan.
 * Returns a function that removes the listener; a no-op where `visualViewport` is missing.
 */
export const onVisualViewportResize = (onResize: () => void) => {
  const viewport = window.visualViewport;

  if (!viewport) {
    return () => undefined;
  }

  viewport.addEventListener("resize", onResize);

  return () => viewport.removeEventListener("resize", onResize);
};

/**
 * Calls `onResize` whenever `element`'s box changes size, including changes no `window` `resize` reports (iOS rotation
 * settling a frame late, the container restyled). Pass the queue from `createResizeQueue`. Also fires once on observe,
 * which is harmless.
 * Returns a function that disconnects the observer.
 */
export const onElementResize = (element: HTMLElement, onResize: () => void) => {
  const observer = new ResizeObserver(() => onResize());

  observer.observe(element);

  return () => observer.disconnect();
};

/**
 * Calls `onChange` when the device pixel ratio changes: browser zoom, a move to another monitor, devtools emulation.
 * A `(resolution: Ndppx)` query only reports leaving N, so it is re-armed for the new ratio after every change.
 * Queue a resize there: it reads the new resolution and calls `renderer.resize`, which emits "resize", so the layout
 * recomputes. The `renderer.resolution` setter emits nothing and would leave the layout stale.
 * Returns a function that removes the listener.
 */
export const onDevicePixelRatioChange = (onChange: () => void) => {
  let query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);

  const handleChange = () => {
    query.removeEventListener("change", handleChange);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", handleChange);
    onChange();
  };

  query.addEventListener("change", handleChange);

  return () => query.removeEventListener("change", handleChange);
};
