import "./style.css";
import { Application, Assets, UPDATE_PRIORITY, type Texture, type UnresolvedAsset } from "pixi.js";
import { FONTS, SPRITES, type SpriteKey } from "./assets/manifest.ts";
import { createAudioEngine } from "./core/audio/audio-engine.ts";
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
import { createAudioLifecycle } from "./game/audio-lifecycle.ts";
import { createFrameStepper } from "./game/frame-step.ts";
import { createInputRouter } from "./game/input/dom-router.ts";
import { createLoadPlan } from "./game/load-plan.ts";
import { createMuteButton } from "./game/mute-button.ts";
import { computePads } from "./game/input/pad-geometry.ts";
import { createPadView } from "./game/pad-view.ts";
import { createContinuePrompt, createGateView, createScene, type Scene } from "./game/scene.ts";
import { createGame, type GameStateId } from "./game/states/index.ts";
import type { CueEvent } from "./game/states/types.ts";
import type { CueLogEntry } from "./debug-api.ts";
import { snapshotSession } from "./game/states/session.ts";

const UI_FONT = "Josefin Slab";

// Pixel art: every sprite texture samples nearest. `data` becomes the TextureSource options. Calling it again after a
// failure retries: Pixi drops a failed asset's cached promise, and the loaded ones resolve from its cache.
const loadSprites = async (onProgress?: (fraction: number) => void) => {
  const assets = Object.entries(SPRITES).map(([alias, { url }]): UnresolvedAsset => ({
    alias,
    src: url,
    data: { scaleMode: "nearest" },
  }));

  return (await Assets.load<Texture>(assets, onProgress)) as Record<SpriteKey, Texture>;
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

// Audio (M3): the engine, the mute button, the lifecycle with "Tap to continue" (further down, with the visibility
// handler), and the cues' log. The states play the cues and pick the music (states/cues.ts, story.ts).
const audio = createAudioEngine();
const muteButton = createMuteButton(layers.ui);

muteButton.setMuted(audio.muted);
onLayout((next) => muteButton.setLayout(next));
muteButton.setLayout(layout);
// Unlocks audio when it needs a gesture: any tap or key once Gate is left (at the gate the begin tap's unlock and its
// touchend retry are Gate's). It reads `lifecycle` and `machine`, defined below: it only runs from DOM events, which
// come after this module has run.
const continueAudio = () => {
  if (machine.current !== "gate") {
    lifecycle.activate();
  }
};

router.onMute(() => {
  audio.setMuted(!audio.muted);
  muteButton.setMuted(audio.muted);
  // A mute tap or the M key is a gesture too: it may resume audio, without counting as an activation.
  continueAudio();
});

// "Tap to continue": shown by the lifecycle when audio can't resume without a gesture.
const continuePrompt = createContinuePrompt(layers, layout);

onLayout(continuePrompt.relayout);

const lifecycle = createAudioLifecycle(audio, continuePrompt, () => document.visibilityState === "visible");

// The last cues, for `window.debug.cues` (e2e checks their times). M4 hangs the visuals on `onCue` below.
const CUE_LOG_SIZE = 64;
const cueLog: CueLogEntry[] = [];

const onCue = (event: CueEvent) => {
  cueLog.push({ ...event, time: clock.now });

  if (cueLog.length > CUE_LOG_SIZE) {
    cueLog.shift();
  }
};

// The gate's view needs nothing loaded; the scene needs the textures and the font.
const gateView = createGateView(layers, layout);

onLayout(gateView.relayout);

// Weights are the parts' sizes in KB, roughly, so the bar moves with the bytes.
let textures: Record<SpriteKey, Texture> | null = null;
const loads = createLoadPlan({
  font: {
    weight: 110,
    load: async () => {
      await loadFont();
      gateView.refreshFont();
    },
  },
  sprites: {
    weight: 140,
    load: async (onProgress) => {
      textures = await loadSprites(onProgress);
    },
  },
  audio: { weight: 830, load: (onProgress) => audio.load((loaded, total) => onProgress(loaded / total)) },
});

// Builds the scene, or reports why not. A throw is a code bug, not a network one, but Gate still offers "Tap to
// retry": what the failed build added to the layers is destroyed first, so a retry starts from empty layers instead
// of building on top of a half scene. (A reload would lose the decoded audio and cached textures for no gain: the
// same code fails the same way either way.)
const buildScene = (loaded: Record<SpriteKey, Texture>) => {
  const parents = [layers.world, layers.fx, layers.top, layers.ui];
  const before = parents.map((parent) => parent.children.length);

  try {
    const built = createScene(layers, loaded, layout);

    window.debug.scene = built;
    onLayout(built.relayout);

    return built;
  } catch (error) {
    parents.forEach((parent, index) => {
      for (const child of parent.removeChildren(before[index])) {
        child.destroy({ children: true });
      }
    });
    reportError(error);
    throw error;
  }
};

const loader = {
  load: async (onProgress: (fraction: number) => void) => {
    try {
      await loads.load(onProgress);
    } catch (error) {
      // Gate shows "Couldn't load. Tap to retry"; the console gets the reason, as an uncaught error.
      reportError(error);
      throw error;
    }

    if (scene === null && textures !== null) {
      scene = buildScene(textures);
    }
  },
  get fontReady() {
    return loads.isLoaded("font");
  },
};

const game = createGame({
  loader,
  gateView,
  audio,
  onCue,
  clock,
  // Every drain goes through the lifecycle, which drops the "Tap to continue" tap's advance (audio-lifecycle.ts).
  input: {
    drain: () => lifecycle.filter(router.drain()),
    beginEpoch: () => router.beginEpoch(),
  },
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

// Inside the DOM gesture (router-core.ts has the contract): Gate's begin tap unlocks audio and starts the music, and
// any later tap unlocks audio again when it needs a gesture ("Tap to continue").
router.onActivate(() => game.gate.activate());
router.onActivate(continueAudio);
const stepper = createFrameStepper(machine);

// See frame-step.ts: the first frame back runs no game time, so a cancel queued while hidden is applied first. The
// router cancels held input on hidden with its own listener, added before this one. Audio suspends while hidden and
// tries to resume when visible, without blocking anything.
const pageVisible = () => {
  stepper.resume();
  lifecycle.visible();
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    pageVisible();
  } else {
    lifecycle.hidden();
  }
});

// A page restored from the bfcache: the same as becoming visible (its visibilitychange may not come on every engine).
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    pageVisible();
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
  audio,
  get cues() {
    return cueLog.map((entry) => ({ ...entry }));
  },
  get continuePromptShown() {
    return lifecycle.prompting;
  },
  get gate() {
    return { phase: game.gate.phase, progress: game.gate.progress };
  },
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
    // The music would loop on over a frozen frame.
    void audio.suspend();
  }
});

// The audio engine's per-frame top-up of the bar-by-bar overlay schedule. Outside the game-logic guard and independent
// of the game clock: the music runs on the AudioContext's own clock, paused game or not. Its own guard: a throw is
// reported once and stops only this.
let audioHalted = false;

app.ticker.add(() => {
  if (audioHalted) {
    return;
  }

  try {
    audio.tick();
  } catch (error) {
    audioHalted = true;
    window.debug.error ??= error;
    reportError(error);
  }
});

// Draws the playfield into its render texture after the game logic above (same priority, added later) and before
// Pixi renders the stage (LOW). Outside the game-logic guard: a halted game keeps its last frame on screen.
app.ticker.add(renderPlayfield, undefined, UPDATE_PRIORITY.NORMAL);

resizeRenderer();

machine.request("gate");
