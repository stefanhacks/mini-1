// Keeps playfield art on whole art pixels. Pure TypeScript with no Pixi import, so it runs under `node --test`.

/**
 * Snaps one axis of a sprite's position so its texture's leading edge (`position − anchor × size`) lands on a whole art
 * pixel. `size` is the drawn size in art px (texture size × scale). The render texture draws at an integer scale k
 * with nearest sampling, so an edge on a half art pixel tears rows: at odd k they come out k, 1, k, k − 1, ... device
 * px tall instead of k each.
 */
export const snapToArtPixels = (position: number, anchor: number, size: number) =>
  Math.round(position - anchor * size) + anchor * size;
