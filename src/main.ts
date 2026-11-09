import "./style.css";
import { Application, Assets, type Texture, type UnresolvedAsset } from "pixi.js";
import { FONTS, SPRITES, type SpriteKey } from "./assets/manifest.ts";
import { GameClock } from "./core/clock.ts";
import { createLayers, fitLayers } from "./core/layers.ts";
import { StateMachine } from "./core/state-machine.ts";
import { buildPlaceholderScene } from "./game/placeholder.ts";
import { createGameStates, type GameStateId } from "./game/states.ts";

const MAX_RESOLUTION = 2;
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

const app = new Application();

await app.init({
  resizeTo: window,
  background: "#000000",
  resolution: Math.min(window.devicePixelRatio, MAX_RESOLUTION),
  autoDensity: true,
});

document.body.appendChild(app.canvas);

const layers = createLayers(app.stage);

const resize = (width: number, height: number) => {
  fitLayers(layers, width, height);
};

app.renderer.on("resize", resize);

resize(app.screen.width, app.screen.height);

const clock = new GameClock();
const assetsLoaded = Promise.all([loadSprites(), loadFont()]);
const machine = new StateMachine<GameStateId>(clock, createGameStates({ loaded: assetsLoaded }));

window.debug = { app, clock, machine, layers };

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

machine.request("gate");

const [textures] = await assetsLoaded;

buildPlaceholderScene(layers, textures);
