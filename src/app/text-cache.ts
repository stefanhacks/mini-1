// Pruning Pixi's canvas text cache (m5-plan, deliverable 6). Pure TypeScript with no Pixi import: it reads the renderer
// as unknown data, so it runs under `node --test` with fakes. Written by Claude Code.
//
// Pixi 8.20.1's text system (scene/text/shared/AbstractTextSystem) keeps `_activeTextures`, a plain object from a
// text's style key (its text and style) to `{ texture, usageCount }`. When a key's last user lets go,
// `decreaseReferenceCount` returns the texture to the pool and sets the key to null instead of deleting it. The
// typewriter gives every typed prefix its own key, so a game leaves about 840 null keys behind, and replays add more.
// Every reader of the object treats a missing key and a null one alike (`getManagedTexture` tests truthiness,
// `getReferenceCount` uses `?.`, `decreaseReferenceCount` returns on falsy), so deleting the null keys changes nothing
// but the object's size. The field is private: anything else (another Pixi version, another renderer) is left alone.

/** The private field, as Pixi 8.20.1 has it. */
type ActiveTextures = Record<string, unknown>;

const activeTextures = (renderer: unknown): ActiveTextures | null => {
  const system = (renderer as { canvasText?: { _activeTextures?: unknown } } | null | undefined)?.canvasText;
  const active = system?._activeTextures;

  const plain = typeof active === "object" && active !== null && Object.getPrototypeOf(active) === Object.prototype;

  return plain ? active as ActiveTextures : null;
};

/**
 * Deletes the null keys from `renderer.canvasText._activeTextures`. Returns how many it deleted, or null when the
 * field isn't there or isn't a plain object (a Pixi upgrade: re-check the shape above, and the e2e pin in
 * e2e/lifecycle.spec.ts).
 */
export const pruneTextCache = (renderer: unknown): number | null => {
  const active = activeTextures(renderer);

  if (active === null) {
    return null;
  }

  let pruned = 0;

  for (const key of Object.keys(active)) {
    if (active[key] === null) {
      delete active[key];
      pruned += 1;
    }
  }

  return pruned;
};

/** The cache's key count and how many are null, or null when the field isn't there. For `window.debug`. */
export const textCacheSize = (renderer: unknown) => {
  const active = activeTextures(renderer);

  if (active === null) {
    return null;
  }

  const keys = Object.keys(active);

  return { keys: keys.length, nulls: keys.filter((key) => active[key] === null).length };
};
