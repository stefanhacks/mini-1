// What the start gate loads (the sprites, the UI font and the audio, through a LoadPlan) and the scene built from it.
// Written by Claude Code.
import { Assets, type Texture, type UnresolvedAsset } from "pixi.js";
import { FONTS, SPRITES, type SpriteKey } from "../assets/manifest.ts";
import type { ClipPlayer } from "../core/anim/player.ts";
import type { AudioEngine } from "../core/audio/audio-engine.ts";
import type { Layers } from "../core/layers.ts";
import { createLoadPlan } from "../game/load-plan.ts";
import { createScene, type Scene } from "../game/scene.ts";
import type { WeatherOptions } from "../game/scene/particles/weather.ts";
import { UI_FONT } from "../game/scene/palette.ts";
import type { GateLoader } from "../game/states/types.ts";
import type { LayoutBus } from "./layout-bus.ts";
import { countChildren, removeChildrenAddedSince } from "./scene-rollback.ts";

/** Each part's share of the load bar: its size in KB, roughly, so the bar moves with the bytes. */
const LOAD_WEIGHTS = { font: 110, sprites: 140, audio: 830 } as const;

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

export interface GameLoaderDeps {
  readonly layers: Layers;
  readonly layouts: LayoutBus;
  /** The gate's view needs nothing loaded: it only refreshes its texts once the font is in. */
  readonly gateView: { refreshFont(): void };
  readonly audio: Pick<AudioEngine, "load">;
  /** The app's clip player, handed to the scene. */
  readonly clips?: ClipPlayer;
  /** Handed to the scene's weather (`?debug&eyes=always`). */
  readonly weather?: WeatherOptions;
  /** The "reduce flashes" toggle (reduce-flashes.ts), handed to the scene: it caps the strikes' flash. */
  readonly reduceFlashes?: () => boolean;
  /** What loads the sprites and the font and builds the scene: Pixi's, unless a unit test passes fakes. */
  readonly assets?: LoaderAssets;
}

export interface LoaderAssets {
  readonly loadSprites: (onProgress?: (fraction: number) => void) => Promise<Record<SpriteKey, Texture>>;
  readonly loadFont: () => Promise<void>;
  readonly createScene: typeof createScene;
}

const PIXI_ASSETS: LoaderAssets = { loadSprites, loadFont, createScene };

export const createGameLoader = ({
  layers, layouts, gateView, audio, clips, weather, reduceFlashes, assets = PIXI_ASSETS,
}: GameLoaderDeps) => {
  let textures: Record<SpriteKey, Texture> | null = null;
  let scene: Scene | null = null;

  const loads = createLoadPlan({
    font: {
      weight: LOAD_WEIGHTS.font,
      load: async () => {
        await assets.loadFont();
        gateView.refreshFont();
      },
    },
    sprites: {
      weight: LOAD_WEIGHTS.sprites,
      load: async (onProgress) => {
        textures = await assets.loadSprites(onProgress);
      },
    },
    audio: {
      weight: LOAD_WEIGHTS.audio,
      load: (onProgress) => audio.load((loaded, total) => onProgress(loaded / total)),
    },
  });

  // Builds the scene, or reports why not. A throw is a code bug, not a network one, but Gate still offers "Tap to
  // retry": what the failed build added to the layers is destroyed first, so a retry starts from empty layers instead
  // of building on top of a half scene. (A reload would lose the decoded audio and cached textures for no gain: the
  // same code fails the same way either way.)
  const buildSceneOrRollback = (loaded: Record<SpriteKey, Texture>) => {
    const parents = [layers.world, layers.fx, layers.top, layers.ui];
    const before = countChildren(parents);

    try {
      // `undefined` keeps the scene's own reduced-motion watch.
      const built = assets.createScene(layers, loaded, layouts.current, clips, undefined, weather, reduceFlashes);

      layouts.onLayout(built.relayout);

      return built;
    } catch (error) {
      removeChildrenAddedSince(parents, before);
      reportError(error);
      throw error;
    }
  };

  const loader: GateLoader = {
    load: async (onProgress) => {
      try {
        await loads.load(onProgress);
      } catch (error) {
        // Gate shows "Couldn't load. Tap to retry"; the console gets the reason, as an uncaught error.
        reportError(error);
        throw error;
      }

      if (scene === null && textures !== null) {
        scene = buildSceneOrRollback(textures);
      }
    },
    get fontReady() {
      return loads.isLoaded("font");
    },
  };

  return {
    loader,
    /** The scene once built, or null. */
    get scene() {
      return scene;
    },
    /** `GameDeps.scene`: the states only call it once the loader resolved. */
    requireScene: () => {
      if (scene === null) {
        throw new Error("The scene is used before it was built");
      }

      return scene;
    },
  };
};
