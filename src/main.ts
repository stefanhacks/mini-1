import "./style.css";
import { Application, Assets, UPDATE_PRIORITY, type Texture, type UnresolvedAsset } from "pixi.js";
import { FONTS, SPRITES, type SpriteKey } from "./assets/manifest.ts";
import { GameClock } from "./core/clock.ts";
import { createDebugOverlay, drawDebugOverlay, isDebugEnabled } from "./core/debug-overlay.ts";
import { PlayfieldDisplay } from "./core/display.ts";
import { createLayers } from "./core/layers.ts";
import { computeLayout, type Layout } from "./core/layout.ts";
import { StateMachine } from "./core/state-machine.ts";
import {
  blockContextMenu,
  createResizeQueue,
  getGameElement,
  onDevicePixelRatioChange,
  onElementResize,
  onVisualViewportResize,
  onWindowResize,
  readGameSize,
  readResolution,
  readSafeAreaInsets,
} from "./core/viewport.ts";
import { buildPlaceholderScene } from "./game/placeholder.ts";
import { createGameStates, type GameStateId } from "./game/states.ts";

const UI_FONT = "Josefin Slab";

// Pixel art: every sprite texture samples nearest. `data` becomes the TextureSource options.
const loadSprites = async () => {
  const assets = Object.entries(SPRITES).map(([alias, { url }]): UnresolvedAsset => ({
    alias,
    src: url,
    data: { scaleMode: "nearest" },
  }));

  return (await Assets.load<Texture>(assets)) as Record<SpriteKey, Texture>;
};

// Without `family`, loadWebFont would name the font after its hashed file name.
const loadFont = async () => {
  await Assets.load({ src: FONTS[UI_FONT], data: { family: UI_FONT } });
};

const gameElement = getGameElement();
const app = new Application();

// No `resizeTo`: Pixi's ResizePlugin would size the canvas from clientWidth/clientHeight, half a device pixel off at
// fractional ratios. `resizeRenderer` below does it instead.
await app.init({
  background: "#000000",
  resolution: readResolution(),
  autoDensity: true,
});

gameElement.appendChild(app.canvas);
blockContextMenu(gameElement);

const layers = createLayers();
const display = new PlayfieldDisplay(app.renderer, layers.playfield);
const overlay = isDebugEnabled() ? createDebugOverlay() : null;

app.stage.addChild(display.sprite, layers.ui);

if (overlay) {
  layers.ui.addChild(overlay);
}

// Whatever follows the layout besides the display and the overlay, such as the scene.
const layoutListeners = new Set<(layout: Layout) => void>();

/** Calls `listener` with every new layout. Returns a function that unsubscribes it (soft restart, scene teardown). */
const onLayout = (listener: (layout: Layout) => void) => {
  layoutListeners.add(listener);

  return () => {
    layoutListeners.delete(listener);
  };
};

// `width` and `height` are the renderer's screen: #game floored to whole device pixels by `resizeRenderer`, so the
// square never hangs off the canvas.
const computeCurrentLayout = (width: number, height: number) => computeLayout({
  width,
  height,
  insets: readSafeAreaInsets(),
  // The canvas resolution is the real device pixel grid: the DPR capped at MAX_RESOLUTION.
  dpr: app.renderer.resolution,
});

let layout = computeCurrentLayout(app.screen.width, app.screen.height);

// Render-texture passes run outside the game-logic guard below, behind their own: the first throw (from M4 render
// code, say) is reported once and stops further passes, so the stage keeps the last frame and the ticker survives.
let renderHalted = false;

const renderPlayfield = () => {
  if (renderHalted) {
    return;
  }

  try {
    display.render();
  } catch (error) {
    renderHalted = true;
    window.debug.error ??= error;
    reportError(error);
  }
};

const applyLayout = () => {
  display.resize(layout);

  if (overlay) {
    drawDebugOverlay(overlay, layout);
  }

  for (const listener of layoutListeners) {
    listener(layout);
  }
};

// Every size, resolution and inset change goes through `resizeRenderer`, which emits this.
app.renderer.on("resize", (width: number, height: number) => {
  layout = computeCurrentLayout(width, height);
  applyLayout();
  // `resizeRenderer` draws the stage right after this, outside the ticker: the render texture must be current by
  // then, or a resized one shows a frame of nothing.
  renderPlayfield();
});

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

const clock = new GameClock();
const assetsLoaded = Promise.all([loadSprites(), loadFont()]);
const machine = new StateMachine<GameStateId>(clock, createGameStates({ loaded: assetsLoaded }));

window.debug = {
  app,
  clock,
  machine,
  layers,
  display,
  onLayout,
  get layout() {
    return layout;
  },
};

// The only thing that ticks the clock. A listener that throws stops Pixi's frame loop for good (the Ticker skips its
// next requestAnimationFrame), so the first error halts the game logic instead: it is reported as an uncaught error,
// kept in `debug.error`, and the last frame keeps rendering.
let halted = false;

app.ticker.add((ticker) => {
  if (halted) {
    return;
  }

  try {
    machine.update(ticker.deltaMS);
  } catch (error) {
    halted = true;
    window.debug.error = error;
    reportError(error);
  }
});

// Draws the playfield into its render texture after the game logic above (same priority, added later) and before
// Pixi renders the stage (LOW). Outside the game-logic guard: a halted game keeps its last frame on screen.
app.ticker.add(renderPlayfield, undefined, UPDATE_PRIORITY.NORMAL);

resizeRenderer();

machine.request("gate");

const [textures] = await assetsLoaded;

const scene = buildPlaceholderScene(layers, textures);

window.debug.scene = scene;
onLayout(scene.relayout);
scene.relayout(layout);
