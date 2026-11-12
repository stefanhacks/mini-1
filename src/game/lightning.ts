// Lightning strikes as the original's GameManager.DoTheThunder draws them, and the reduced flash's rule. Pure
// TypeScript with no Pixi import. Written by Claude Code.
//
// DoTheThunder picks a bolt sprite, an x and a mirror, and plays `Raio.anim` on the bolt and `Flash.anim` on the
// flash. The port draws in playfield px, not screen px (the original's x was ±Screen.width / 3.75 in canvas units,
// so its range grew with the window), and from a lightning RNG of its own (GameSession.lightning).
import { CLIPS } from "../assets/anims.ts";
import type { SpriteKey } from "../assets/manifest.ts";
import type { Clip } from "../core/anim/clip.ts";
import { PLAYFIELD_SIZE } from "../core/layout.ts";
import type { Rng } from "./challenges/rng.ts";
import type { CueName } from "./states/timings.ts";

/** The cues that strike: every `lightning`, and Title's `title-reveal`. */
export type StrikeKind = Extract<CueName, "lightning" | "title-reveal">;

export const isStrike = (cue: CueName): cue is StrikeKind => cue === "lightning" || cue === "title-reveal";

/** Mixed into the game's seed for the strikes' draws, so they come from their own stream (rounds and ambient apart). */
export const LIGHTNING_SALT = 0xb0175;

/** `spritesRaio`, in order. The original's reveal drew only the first 4 (quirk 8); every strike here draws all 5. */
export const BOLT_KEYS = ["thunder0", "thunder1", "thunder2", "thunder3", "thunder4"] as const satisfies
  readonly SpriteKey[];

/**
 * Half the strike's x range around the playfield's centre: `±Screen.width / 3.75` for a strike, `/ 4.75` for the
 * reveal (it stays nearer the logo), with the screen width read as the playfield's.
 */
export const STRIKE_HALF_RANGE: Readonly<Record<StrikeKind, number>> = {
  lightning: PLAYFIELD_SIZE / 3.75,
  "title-reveal": PLAYFIELD_SIZE / 4.75,
};

/**
 * The bolt's top-centre pivot sits on the playfield's top edge (`Screen.height / 2` above the centre). Main.unity
 * places it 17 px higher, but DoTheThunder always moves it before it shows.
 */
export const BOLT_TOP = 0;

export interface Strike {
  readonly kind: StrikeKind;
  /** Index into BOLT_KEYS. */
  readonly bolt: number;
  /** The bolt's pivot x, in playfield px (unsnapped). */
  readonly x: number;
  /** `localScale.x = −1`. The reveal is never mirrored (orientation 1). */
  readonly mirrored: boolean;
}

/**
 * One strike's draws, in a fixed order: the sprite, the x, then (a plain strike only) the mirror. `Random.Range(float,
 * float)` is uniform over the range; `Random.Range(0, 2) * 2 − 1` is −1 (mirrored) for 0.
 */
export const drawStrike = (kind: StrikeKind, rng: Rng): Strike => {
  const bolt = rng.nextInt(BOLT_KEYS.length);
  const half = STRIKE_HALF_RANGE[kind];
  const x = PLAYFIELD_SIZE / 2 - half + rng.next() * 2 * half;
  const mirrored = kind === "lightning" && rng.nextInt(2) === 0;

  return { kind, bolt, x, mirrored };
};

/** `Flash.anim`'s event at its peak (0.25 s), which shows the logo on the reveal (MessageCaster → DoWhileFlash). */
export const FLASH_PEAK_EVENT = "DoingFlash";

/**
 * The flash's peak alpha when `prefers-reduced-motion: reduce` matches (M4 owner decision 2; 02, photosensitivity).
 * The bolt is left as it is.
 */
export const FLASH_REDUCED_PEAK = 0.4;

const isAlpha = (attribute: string) => attribute === "m_Color.a" || attribute === "m_fontColor.a";

/** The highest alpha key of `clip` (with clamped tangents, the curve never overshoots its keys). */
export const peakAlpha = (clip: Clip) => Math.max(
  ...clip.curves.filter((curve) => isAlpha(curve.attribute)).flatMap((curve) => curve.keys.map((key) => key.value)),
);

/**
 * `clip` with every alpha curve scaled so its highest key is at most `peak`: values and slopes times the same factor,
 * so the Hermite curve scales exactly. Times and events are kept. A clip already under `peak` comes back as it is.
 */
export const capAlpha = (clip: Clip, peak: number): Clip => {
  const factor = peak / peakAlpha(clip);

  if (!(factor < 1)) {
    return clip;
  }

  return {
    ...clip,
    curves: clip.curves.map((curve) => isAlpha(curve.attribute)
      ? {
        ...curve,
        keys: curve.keys.map((key) => ({
          ...key,
          value: key.value * factor,
          inSlope: key.inSlope * factor,
          outSlope: key.outSlope * factor,
        })),
      }
      : curve),
  };
};

/** `Flash.anim` capped at FLASH_REDUCED_PEAK, for reduced motion. */
export const FLASH_REDUCED: Clip = capAlpha(CLIPS.flash, FLASH_REDUCED_PEAK);

/** What a strike's flash does under the player's settings (m5-plan owner decision 9). */
export interface FlashRule {
  /** The square's flash plays FLASH_REDUCED (peak FLASH_REDUCED_PEAK) instead of `Flash.anim`. */
  readonly capped: boolean;
  /** The screen tone (screen-tone.ts) repeats the flash over the whole canvas; it follows the square's cap. */
  readonly screenTone: boolean;
}

/**
 * OS reduced motion caps the flash and keeps the screen tone (capped with it); the "reduce flashes" toggle caps the
 * flash and turns the screen tone off.
 */
export const flashRule = (reducedMotion: boolean, reduceFlashes: boolean): FlashRule => ({
  capped: reducedMotion || reduceFlashes,
  screenTone: !reduceFlashes,
});
