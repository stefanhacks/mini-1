// Sizing: the layout computed from the renderer's screen, the renderer's "resize" handler that applies it, and the
// four triggers that queue a resize. Written by Claude Code.
import { drawDebugOverlay } from "../core/debug-overlay.ts";
import { computeLayout } from "../core/layout.ts";
import {
  createResizeQueue,
  onDevicePixelRatioChange,
  onElementResize,
  onVisualViewportResize,
  onWindowResize,
  readGameSize,
  readResolution,
  readSafeAreaInsets,
} from "../core/viewport.ts";
import { createLayoutBus } from "./layout-bus.ts";
import type { Stage } from "./stage.ts";

/**
 * Starts following #game's size. `renderPlayfield` is the guarded render pass (main.ts). Returns the layout bus
 * and `resizeRenderer` (call it once at startup).
 */
export const wireResize = (
  { app, gameElement, display, overlay }: Pick<Stage, "app" | "gameElement" | "display" | "overlay">,
  renderPlayfield: () => void,
) => {
  // `width` and `height` are the renderer's screen: #game floored to whole device pixels by `resizeRenderer`, so the
  // square never hangs off the canvas.
  const computeCurrentLayout = (width: number, height: number) => computeLayout({
    width,
    height,
    insets: readSafeAreaInsets(),
    // The canvas resolution is the real device pixel grid: the DPR capped at MAX_RESOLUTION.
    dpr: app.renderer.resolution,
  });

  const layouts = createLayoutBus(computeCurrentLayout(app.screen.width, app.screen.height));

  // Every size, resolution and inset change goes through `resizeRenderer`, which emits this. The display and the
  // overlay first, then the bus's listeners in subscription order.
  const onRendererResize = (width: number, height: number) => {
    const next = computeCurrentLayout(width, height);

    display.resize(next);

    if (overlay) {
      drawDebugOverlay(overlay, next);
    }

    layouts.publish(next);
    // `resizeRenderer` draws the stage right after this, outside the ticker: the render texture must be current by
    // then, or a resized one shows a frame of nothing.
    renderPlayfield();
  };

  app.renderer.on("resize", onRendererResize);

  // Sizes the renderer to #game, floored to whole device pixels at the current resolution, so the canvas backing is
  // exactly its CSS size × resolution and the browser copies it 1:1 (see `readGameSize`).
  const resizeRenderer = () => {
    const resolution = readResolution();
    const { width, height } = readGameSize(gameElement, resolution);

    app.renderer.resize(width, height, resolution);
    // Resizing clears the canvas: draw now, or the browser can show an empty frame before the next tick.
    app.render();
  };

  const queueResize = createResizeQueue(resizeRenderer);

  onWindowResize(queueResize);
  onVisualViewportResize(queueResize);
  onElementResize(gameElement, queueResize);
  onDevicePixelRatioChange(queueResize);

  return { layouts, resizeRenderer };
};
