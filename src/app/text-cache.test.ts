import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pruneTextCache, textCacheSize } from "./text-cache.ts";

describe("pruneTextCache", () => {
  it("deletes the null keys and keeps the live ones", () => {
    const live = { texture: {}, usageCount: 2 };
    const renderer = { canvasText: { _activeTextures: { a: null, b: live, c: null } as Record<string, unknown> } };

    assert.deepEqual(textCacheSize(renderer), { keys: 3, nulls: 2 });
    assert.equal(pruneTextCache(renderer), 2);
    assert.deepEqual(renderer.canvasText._activeTextures, { b: live });
    assert.equal(pruneTextCache(renderer), 0);
  });

  it("leaves anything else alone and says so: no renderer, no system, no field, or not a plain object", () => {
    for (const renderer of [
      null,
      undefined,
      {},
      { canvasText: null },
      { canvasText: {} },
      { canvasText: { _activeTextures: null } },
      { canvasText: { _activeTextures: new Map([["a", null]]) } },
      { canvasText: { _activeTextures: [null] } },
    ]) {
      assert.equal(pruneTextCache(renderer), null);
      assert.equal(textCacheSize(renderer), null);
    }
  });

  it("was checked against Pixi 8.20.1's AbstractTextSystem: re-check the field's shape on any upgrade", () => {
    const manifest = new URL("../../node_modules/pixi.js/package.json", import.meta.url);
    const pixi = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };

    assert.equal(pixi.version, "8.20.1");
  });
});
