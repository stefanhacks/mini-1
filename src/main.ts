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
import { randomSeed, seedFromString } from "./game/challenges/rng.ts";
import { TUNING } from "./game/challenges/tuning.ts";
import { createFrameStepper } from "./game/frame-step.ts";
import { createInputRouter } from "./game/input/dom-router.ts";
import { computePads } from "./game/input/pad-geometry.ts";
import { createPadView } from "./game/pad-view.ts";
import { createScene, type Scene } from "./game/scene.ts";
import { createGame, type GameStateId } from "./game/states/index.ts";
import { snapshotSession } from "./game/states/session.ts";

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
const debugEnabled = isDebugEnabled();
const overlay = debugEnabled ? createDebugOverlay() : null;

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

const params = new URLSearchParams(window.location.search);

// `?debug&timescale=N` multiplies game time, so e2e playthroughs don't wait out the original's ~25 s of pauses. Read
// only with `?debug`: the one test hook (m2-plan, deliverable 6).
const readTimescale = () => {
  const value = Number(params.get("timescale") ?? "1");

  return Number.isFinite(value) && value > 0 ? value : 1;
};

let timescale = debugEnabled ? readTimescale() : 1;

// `?seed=` makes games reproducible (tests, bug reports): game n plays seed + n − 1, so a replay is still a new game.
// Without it every game gets a random seed.
const seedParam = params.get("seed");
let gamesSeeded = 0;

const nextSeed = () => {
  gamesSeeded += 1;

  return seedParam === null ? randomSeed() : (seedFromString(seedParam) + gamesSeeded - 1) >>> 0;
};

// Input: DOM listeners on the canvas, the keyboard and page visibility, queued for the states to drain.
const router = createInputRouter(app.canvas, gameElement);
const padView = createPadView(layers.ui);

const layoutPads = (next: Layout) => {
  router.setLayout(next);
  padView.setPads(computePads(next), next.dpr);
};

onLayout(layoutPads);
layoutPads(layout);

const clock = new GameClock();
let scene: Scene | null = null;

// The scene needs the textures and the font. Gate moves on once it is built.
const sceneBuilt = Promise.all([loadSprites(), loadFont()]).then(([textures]) => {
  const built = createScene(layers, textures, layout);

  scene = built;
  window.debug.scene = built;
  onLayout(built.relayout);

  return built;
});

const game = createGame({
  loaded: sceneBuilt,
  clock,
  input: router,
  pad: padView,
  scene: () => {
    if (scene === null) {
      throw new Error("The scene is used before it was built");
    }

    return scene;
  },
  nextSeed,
  tuning: TUNING,
});
const machine = new StateMachine<GameStateId>(clock, game.states);
const stepper = createFrameStepper(machine);

// See frame-step.ts: the first frame back runs no game time, so a cancel queued while hidden is applied first.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    stepper.resume();
  }
});

window.debug = {
  app,
  clock,
  machine,
  layers,
  display,
  onLayout,
  router,
  get layout() {
    return layout;
  },
  /** The game as plain data: state, seed, part, phase, current challenge and story page. */
  get game() {
    return { state: machine.current, ...snapshotSession(game.session) };
  },
  /** Listener counts, for the replay leak test. */
  get counts() {
    return {
      pendingTimers: clock.pendingTimers,
      layoutListeners: layoutListeners.size,
      tickerListeners: app.ticker.count,
    };
  },
  get timescale() {
    return timescale;
  },
  /** Changes the time scale; only with `?debug`. */
  setTimescale: (value: number) => {
    if (debugEnabled && Number.isFinite(value) && value > 0) {
      timescale = value;
    }
  },
};

// The only thing that ticks the clock. A listener that throws stops Pixi's frame loop for good (the Ticker skips its
// next requestAnimationFrame), so the first error halts the game logic instead: it is reported as an uncaught error,
// kept in `debug.error`, and the last frame keeps rendering. The pad view follows the held directions inside the same
// guard, after the states, so a halted game freezes it too.
let halted = false;

app.ticker.add((ticker) => {
  if (halted) {
    return;
  }

  try {
    stepper.step(ticker.deltaMS * timescale);
    padView.update((dir) => router.isHeld(dir));
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

// A failed load surfaces here as an uncaught error; Gate just stays.
await sceneBuilt;
