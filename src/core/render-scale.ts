// The sharp-bilinear render scale. Pure TypeScript with no Pixi import, so it runs under `node --test`.
import { PLAYFIELD_SIZE } from "./layout.ts";

/**
 * The integer scale k the playfield is drawn at inside its render texture: the largest one whose PLAYFIELD_SIZE·k
 * texture still fits the square's device pixels, and at least 1. The texture is then drawn once, linearly filtered,
 * at the square's real size: scaled up by less than (k + 1) / k, or down on a square under PLAYFIELD_SIZE device px.
 * Pass `Layout.sideDevicePx`, an exact integer; anything not finite counts as 0.
 */
export const renderTextureScale = (sideDevicePx: number) =>
  Number.isFinite(sideDevicePx) ? Math.max(1, Math.floor(sideDevicePx / PLAYFIELD_SIZE)) : 1;
