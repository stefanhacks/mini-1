import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Container } from "pixi.js";
import { createLayers } from "../core/layers.ts";
import { computeLayout, ZERO_INSETS } from "../core/layout.ts";
import type { Scene } from "../game/scene.ts";
import { createLayoutBus } from "./layout-bus.ts";

// The manifest imports Vite `?url` assets; under node each becomes its file name.
registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!specifier.includes("?url")) {
      return nextResolve(specifier, context);
    }

    const source = `export default ${JSON.stringify(specifier.split("?")[0] ?? "")}`;

    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  },
});

const { createGameLoader } = await import("./game-loader.ts");

type Assets = NonNullable<Parameters<typeof createGameLoader>[0]["assets"]>;

const reported: { error: unknown; worldChildren: number; uiChildren: number }[] = [];
let onReport: (error: unknown) => void = () => undefined;

// Node has no `reportError`: the loader's calls land here.
beforeEach(() => {
  reported.length = 0;
  Object.defineProperty(globalThis, "reportError", {
    value: (error: unknown) => onReport(error),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "reportError");
});

const setUp = (createScene: Assets["createScene"]) => {
  const layers = createLayers();
  const layouts = createLayoutBus(computeLayout({ width: 800, height: 600, insets: ZERO_INSETS, dpr: 1 }));

  layers.ui.addChild(new Container({ label: "pad-view" }));
  onReport = (error) => reported.push({
    error,
    worldChildren: layers.world.children.length,
    uiChildren: layers.ui.children.length,
  });

  const loading = createGameLoader({
    layers,
    layouts,
    gateView: { refreshFont: () => undefined },
    audio: {
      load: (onProgress) => {
        onProgress?.(1, 1);

        return Promise.resolve();
      },
    },
    assets: {
      loadSprites: () => Promise.resolve({} as Awaited<ReturnType<Assets["loadSprites"]>>),
      loadFont: () => Promise.resolve(),
      createScene,
    },
  });

  return { layers, layouts, loading };
};

describe("createGameLoader", () => {
  it("rolls a failed build back, then reports and rethrows it; the retry builds again", async () => {
    const failure = new Error("scene build failed");
    const built = { relayout: () => undefined } as unknown as Scene;
    let builds = 0;
    const { layers, layouts, loading } = setUp((sceneLayers) => {
      builds += 1;

      if (builds === 1) {
        sceneLayers.world.addChild(new Container({ label: "sea" }));
        sceneLayers.ui.addChild(new Container({ label: "story-text" }));
        throw failure;
      }

      return built;
    });

    await assert.rejects(loading.loader.load(() => undefined), failure);

    // Reported once, after the rollback: the layers were back to what they held before the build.
    assert.deepEqual(reported, [{ error: failure, worldChildren: 0, uiChildren: 1 }]);
    assert.deepEqual(layers.ui.children.map((child) => child.label), ["pad-view"]);
    assert.equal(loading.scene, null);
    assert.throws(() => loading.requireScene());
    assert.equal(layouts.listenerCount, 0);

    await loading.loader.load(() => undefined);

    assert.equal(builds, 2);
    assert.equal(loading.scene, built);
    assert.equal(loading.requireScene(), built);
    assert.equal(layouts.listenerCount, 1);
  });
});
