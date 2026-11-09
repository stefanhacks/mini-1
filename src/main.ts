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
  getGameElement,
  onDevicePixelRatioChange,
  onElementResize,
  onVisualViewportResize,
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

await app.init({
  resizeTo: gameElement,
  background: "#000000",
  resolution: readResolution(),
  autoDensity: true,
});

gameElement.appendChild(app.canvas);
blockContextMenu(gameElement);
onVisualViewportResize(() => app.queueResize());
onElementResize(gameElement, () => app.queueResize());
onDevicePixelRatioChange(() => {
  app.renderer.resize(gameElement.clientWidth, gameElement.clientHeight, readResolution());
});

const layers = createLayers();
const display = new PlayfieldDisplay(app.renderer, layers.playfield);
const overlay = isDebugEnabled() ? createDebugOverlay() : null;

app.stage.addChild(display.sprite, layers.ui);

if (overlay) {
  layers.ui.addChild(overlay);
}

// Whatever follows the layout besides the display and the overlay: the scene, once the assets are in.
const layoutListeners: ((layout: Layout) => void)[] = [];

// Sized from #game, not from the renderer's screen: Pixi rounds the canvas to whole device pixels, so at a fractional
// resolution its screen can be up to half a device pixel larger than the page (1500 CSS px at 2.625 gives 1500.19),
// and a square fitted to it could hang off the bottom or right edge.
const computeCurrentLayout = () => computeLayout({
  width: gameElement.clientWidth,
  height: gameElement.clientHeight,
  insets: readSafeAreaInsets(),
  // The canvas resolution is the real device pixel grid: the DPR capped at MAX_RESOLUTION.
  dpr: app.renderer.resolution,
});

let layout = computeCurrentLayout();

const applyLayout = () => {
  display.resize(layout);

  if (overlay) {
    drawDebugOverlay(overlay, layout);
  }

  for (const listener of layoutListeners) {
    listener(layout);
  }
};

// Every size, resolution and inset change ends in a renderer resize: see viewport.ts.
app.renderer.on("resize", () => {
  layout = computeCurrentLayout();
  applyLayout();
});

applyLayout();

const clock = new GameClock();
const assetsLoaded = Promise.all([loadSprites(), loadFont()]);
const machine = new StateMachine<GameStateId>(clock, createGameStates({ loaded: assetsLoaded }));

window.debug = {
  app,
  clock,
  machine,
  layers,
  display,
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
// Pixi renders the stage (LOW). Outside the guard: a halted game keeps its last frame on screen.
app.ticker.add(() => display.render(), undefined, UPDATE_PRIORITY.NORMAL);

machine.request("gate");

const [textures] = await assetsLoaded;

const scene = buildPlaceholderScene(layers, textures);

window.debug.scene = scene;
layoutListeners.push(scene.relayout);
scene.relayout(layout);
