// The sharp-bilinear render scale. Pure TypeScript with no Pixi import, so it runs under `node --test`.
import { PLAYFIELD_SIZE } from "./layout.ts";

/**
 * Upper bound on k: a 3000² render texture, about 36 MB of RGBA. Squares beyond 3000 device px are scaled up from it,
 * linearly, by the display sprite. Not handled: a canvas backing beyond the GPU's MAX_TEXTURE_SIZE (8K-class panels at
 * the DPR cap), which this bound doesn't cover.
 */
export const MAX_RENDER_SCALE = 6;

/**
 * The integer scale k the playfield is drawn at inside its render texture: the largest one whose PLAYFIELD_SIZE·k
 * texture still fits the square's device pixels, at least 1 and at most MAX_RENDER_SCALE. The texture is then drawn
 * once, linearly filtered, at the square's real size: scaled up by less than (k + 1) / k, or down on a square under
 * PLAYFIELD_SIZE device px.
 * Pass `Layout.sideDevicePx`, an exact integer; anything not finite counts as 0.
 */
export const renderTextureScale = (sideDevicePx: number) => Number.isFinite(sideDevicePx)
  ? Math.min(MAX_RENDER_SCALE, Math.max(1, Math.floor(sideDevicePx / PLAYFIELD_SIZE)))
  : 1;
