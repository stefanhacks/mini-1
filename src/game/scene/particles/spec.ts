// The rain, splash and bubble systems of Main.unity, and the eyes, in playfield px and seconds. Pure TypeScript with
// no Pixi import. Written by Claude Code.
//
// Every number comes from docs/after-the-waves-crash/m5-particles-spec.md (§ numbers below), converted on the square
// window (1 world unit = 250 px). The ones marked "by eye" the original's files can't give.

export interface Range {
  readonly min: number;
  readonly max: number;
}

/** Unity's "random between two colours" on white: the alpha of each new rain drop and bubble (§1, §3). */
const START_ALPHA: Range = { min: 0.11764706, max: 0.7058824 };

/**
 * Rain (§1): a Box emitter at 220/s over x −43…957, y −141…109, drops moving (−375, +375) px/s for 1 s. Drops born at
 * x > 880 never reach the playfield (§7, pool sizes), so the box is clipped to x −4…880 at the same density:
 * 220 × 884 / 1000 a second.
 */
export const RAIN = {
  rate: (220 * 884) / 1000,
  x: { min: -4, max: 880 },
  y: { min: -141, max: 109 },
  vx: -375,
  vy: 375,
  life: 1,
  alpha: START_ALPHA,
  /** A drop dies when its centre reaches the sea collider (RainCollision's top 335.1, less the drop's radius). */
  seaLine: 331,
  /** Splashes only where they can show (§7, step). */
  splashX: { min: -4, max: 504 },
  /** Drawn at 8 px, the sprite's own size (§1: 7.5 px). */
  scale: 1,
  pool: 224,
} as const;

/**
 * The intact boat's capsule (§1, the colliders), as a box around the boat sprite's live position: 15.86 × 24.65,
 * offset (0.14, −0.7) in Unity's y-up, grown by the drop's collision radius (3.75 px, §U3).
 */
export const BOAT_COLLIDER = {
  offsetX: 0.14,
  offsetY: 0.7,
  halfWidth: 15.86 / 2 + 3.75,
  halfHeight: 24.65 / 2 + 3.75,
} as const;

/**
 * Splash (§2): 3 particles per rain collision, 0.75 s, (−12.5, −55) px/s under +171.7 px/s² of gravity, alpha in
 * [0.118, 0.196], held until 0.7588 of the life then linear to 0.
 */
export const SPLASH = {
  count: 3,
  life: 0.75,
  vx: -12.5,
  vy: -55,
  gravity: 171.7,
  alpha: { min: 0.11764706, max: 0.19607843 },
  fadeFrom: 49730 / 65535,
  /**
   * By eye: Unity's emitter shape can't be read from the files (§U1), and three dots on one spot read as one. Each
   * dot starts up to this many px left or right of the hit.
   */
  spread: 3,
  /** A 1 art px white dot (§2: 1.5 px drawn). */
  size: 1,
  pool: 256,
} as const;

/**
 * Bubbles (§3): from x 87.5…412.5, y 495.7…502.3, rising 30 px/s for 5 s with a fixed sway, alpha held until 4.5 s
 * then linear to 0.
 */
export const BUBBLES = {
  x: { min: 87.5, max: 412.5 },
  y: { min: 495.7, max: 502.3 },
  vy: -30,
  life: 5,
  fadeFrom: 4.5,
  alpha: START_ALPHA,
  /** The 4 px ring drawn at 8 px (§3: 7.5 px). */
  scale: 2,
  pool: 32,
  /**
   * From the ending's kraken on there are none (m5-plan, owner decision 4). The ones still rising fade out over this
   * long, the kraken's own fade-in (FadeKrakenA, 1 s), instead of popping.
   */
  clearFade: 1,
} as const;

/** The sway every bubble shares: its x offset in px at each half second of age, 0 to 5 s (§3, Sway). */
export const BUBBLE_SWAY = [0, 1.6, 6.4, 11.5, 14.4, 13.7, 9.7, 4.2, -0.2, -2.1, -1.0] as const;

/** The sway at `age` s, linear between BUBBLE_SWAY's samples. */
export const bubbleSway = (age: number) => {
  const at = Math.min(Math.max(age, 0), BUBBLES.life) * 2;
  const index = Math.min(Math.floor(at), BUBBLE_SWAY.length - 2);
  const from = BUBBLE_SWAY[index];

  return from + (BUBBLE_SWAY[index + 1] - from) * (at - index);
};

/**
 * Bubbles a second in story part `part`: the scene's 1, then `SetBubbles(parteHistoria × 2)` after each won round, so
 * 2, 4 and 6 (GameManager.cs:155–162; m5-plan, owner decision 10). The original drew each second's rate in
 * [0.8i, i]; the port keeps the top, so the ramp reads as the script meant it.
 */
export const bubbleRate = (part: number) => (part <= 0 ? 1 : 2 * part);

/** Both systems are prewarmed this long: Unity's `prewarm` runs one loop of their 2 s duration. */
export const PREWARM = 2;

export type EyeSize = "small" | "large";

/** The m4-plan draft as the owner confirmed it (m5-plan, owner decision 3). */
export const EYES = {
  /**
   * An eye may replace the bubbles of one slot: the bubble system's 2 s loop (`lengthInSec`). The slot that shows an
   * eye emits no bubble.
   */
  slot: 2,
  /** Story parts 0–1: at most one eye a game, in 5% of games, small only, in one of its first 15 slots there. */
  early: { chance: 0.05, slots: 15 },
  /** From story part 2: about 1 chance in 6 per slot. */
  chance: 1 / 6,
  /** `eye_large` from this part on (half the eyes there). */
  largeFrom: 3,
  fadeIn: 0.5,
  fadeOut: 0.5,
  hold: { min: 1.5, max: 3 },
  /** By eye: a slow drift of up to this many art px, left or right, over the eye's life. */
  drift: 3,
  /** By eye: the bubbles' brightest, so an eye reads as part of the sea's life rather than a sprite on top of it. */
  alpha: 0.7,
  /** Where an eye's centre goes: a whole eye under the sea line, inside the bubbles' band and the vignette's light. */
  band: {
    small: { x: { min: 100, max: 400 }, y: { min: 362, max: 490 } },
    large: { x: { min: 120, max: 380 }, y: { min: 372, max: 478 } },
  },
} as const;

/**
 * Mixed into the game's seed for each system's draws, so they never shift the rounds', Title's ambient thunder's or
 * the strikes' (AMBIENT_SALT, LIGHTNING_SALT).
 */
export const RAIN_SALT = 0x4a1d5;
export const BUBBLE_SALT = 0xb0bb1e;
export const EYE_SALT = 0xe7e5;

/** A float in `range`, from one draw. */
export const between = (next: () => number, range: Range) => range.min + next() * (range.max - range.min);
