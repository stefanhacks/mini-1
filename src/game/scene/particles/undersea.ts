// Under the sea: the bubbles (m5-particles-spec §3) and, now and then, an eye in place of a slot's bubbles (m4-plan,
// "Eye sprites"; m5-plan, deliverable 2 and owner decisions 3, 4 and 10). Pure TypeScript with no Pixi import.
// Written by Claude Code.
import type { Rng } from "../../challenges/rng.ts";
import type { Undersea } from "../../states/types.ts";
import { createSlots, emitBetween, park, type Dot, type Emitter } from "./pool.ts";
import { between, BUBBLES, bubbleRate, bubbleSway, EYES, PREWARM, type EyeSize } from "./spec.ts";

/** The eye as it shows at the last step. */
export interface EyeFrame {
  readonly size: EyeSize;
  /** Its centre, in whole playfield px. */
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

export interface UnderseaStats {
  readonly bubbles: number;
  /** Bubbles a full pool turned away since the last reset. */
  readonly dropped: number;
  /** Eyes shown since the last reset. */
  readonly eyes: number;
}

export interface UnderseaSystem {
  /**
   * A new game at `at` (s of weather time): no bubble or eye, Title's undersea, and the bubbles' and the eyes' draws
   * from these streams. The eye stream draws this game's early eye now. Then step from `at − PREWARM` to prewarm.
   */
  readonly reset: (at: number, bubbles: Rng, eyes: Rng) => void;
  /** From `at` on: this part's bubbles, and eyes or not; null clears both (the kraken). */
  readonly set: (at: number, undersea: Undersea | null) => void;
  readonly step: (from: number, to: number, options: { readonly rate: number }) => void;
  /** The eye shown, or null. */
  readonly eye: EyeFrame | null;
  readonly stats: UnderseaStats;
}

interface Eye {
  readonly size: EyeSize;
  readonly x: number;
  readonly y: number;
  readonly drift: number;
  readonly start: number;
  /** When it would have ended, unhurried: the drift runs over this. */
  readonly span: number;
  /** When it starts fading out, and from which alpha (1 unless it was cut short during its fade-in). */
  outAt: number;
  outFrom: number;
  end: number;
}

/** The eye's alpha at `at`, before EYES.alpha: fade in, hold, fade out. */
const eyeAlpha = (eye: Eye, at: number) => (at < eye.outAt
  ? Math.min(1, (at - eye.start) / EYES.fadeIn)
  : Math.max(0, eye.outFrom - (at - eye.outAt) / EYES.fadeOut));

/** Title's undersea, and every game's first: the scene's 1 bubble a second, no eye. */
export const TITLE_UNDERSEA: Undersea = { part: 0, eyes: false };

/**
 * `bubbles` are the drawn dots, one per pool slot (BUBBLES.pool). `eyesAlways` (`?debug&eyes=always`) shows an eye in
 * every slot where one may show, of either size, so they can be reviewed without waiting.
 */
export const createUndersea = (bubbles: readonly Dot[], eyesAlways = false): UnderseaSystem => {
  const slots = createSlots(bubbles.length);
  const birth = new Float64Array(bubbles.length);
  const startX = new Float64Array(bubbles.length);
  const startY = new Float64Array(bubbles.length);
  const startAlpha = new Float64Array(bubbles.length);
  const emitter: Emitter = { phase: 0 };

  let bubbleRng: Rng | null = null;
  let eyeRng: Rng | null = null;
  let undersea: Undersea | null = TITLE_UNDERSEA;
  /** When the kraken cleared the sea, or null. */
  let clearedAt: number | null = null;
  let nextSlot = 0;
  /** Bubbles emitted from here to here + EYES.slot are skipped: that slot shows an eye. */
  let quietFrom = -Infinity;
  let eye: Eye | null = null;
  let frame: EyeFrame | null = null;
  // This game's eye in parts 0–1: the slot it shows in, counted over the slots there, or −1 for none.
  let earlySlot = -1;
  let earlySlots = 0;
  let dropped = 0;
  let eyesShown = 0;

  const rngOf = (rng: Rng | null) => {
    if (rng === null) {
      throw new Error("The undersea steps before its first reset");
    }

    return rng;
  };

  /** Starts the fade-out of the eye at `at`, from the alpha it reached. */
  const closeEye = (at: number) => {
    if (eye !== null && at < eye.outAt) {
      eye.outFrom = eyeAlpha(eye, at);
      eye.outAt = at;
      eye.end = at + EYES.fadeOut * eye.outFrom;
    }
  };

  /** Whether the slot at `at` shows an eye. Parts 0–1 have at most this game's one; later parts draw each slot. */
  const drawsEye = (rng: Rng, part: number) => {
    if (eyesAlways) {
      return true;
    }

    if (part < 2) {
      earlySlots += 1;

      return earlySlots - 1 === earlySlot;
    }

    return rng.next() < EYES.chance;
  };

  const sizeOf = (rng: Rng, part: number): EyeSize => {
    if (eyesAlways) {
      return rng.next() < 0.5 ? "large" : "small";
    }

    return part >= EYES.largeFrom && rng.next() < 0.5 ? "large" : "small";
  };

  const openSlot = (at: number) => {
    if (eye !== null && eye.end <= at) {
      eye = null;
    }

    if (undersea === null || !undersea.eyes || eye !== null) {
      return;
    }

    const rng = rngOf(eyeRng);

    if (!drawsEye(rng, undersea.part)) {
      return;
    }

    const next = () => rng.next();
    const size = sizeOf(rng, undersea.part);
    const band = EYES.band[size];
    const x = between(next, band.x);
    const y = between(next, band.y);
    const hold = between(next, EYES.hold);
    const drift = Math.round((next() * 2 - 1) * EYES.drift);
    const outAt = at + EYES.fadeIn + hold;
    const end = outAt + EYES.fadeOut;

    eye = { size, x, y, drift, start: at, span: end - at, outAt, outFrom: 1, end };
    quietFrom = at;
    eyesShown += 1;
  };

  const emit = (at: number) => {
    if (at >= quietFrom && at < quietFrom + EYES.slot) {
      return;
    }

    const rng = rngOf(bubbleRng);
    const next = () => rng.next();
    const x = between(next, BUBBLES.x);
    const y = between(next, BUBBLES.y);
    const alpha = between(next, BUBBLES.alpha);
    const slot = slots.take();

    if (slot < 0) {
      dropped += 1;
      return;
    }

    birth[slot] = at;
    startX[slot] = x;
    startY[slot] = y;
    startAlpha[slot] = alpha;
  };

  const kill = (slot: number) => {
    slots.free(slot);
    park(bubbles[slot]);
  };

  const placeBubble = (slot: number, to: number, clearing: number) => {
    const age = to - birth[slot];

    if (age >= BUBBLES.life || clearing <= 0) {
      kill(slot);
      return;
    }

    const fade = age < BUBBLES.fadeFrom ? 1 : (BUBBLES.life - age) / (BUBBLES.life - BUBBLES.fadeFrom);
    const dot = bubbles[slot];

    dot.x = Math.round(startX[slot] + bubbleSway(age));
    dot.y = Math.round(startY[slot] + BUBBLES.vy * age);
    dot.alpha = startAlpha[slot] * fade * clearing;
  };

  const placeEye = (to: number) => {
    // Within float error of its end, it's gone: a fade cut short ends between frames.
    if (eye !== null && eye.end <= to + 1e-9) {
      eye = null;
    }

    if (eye === null) {
      frame = null;
      return;
    }

    const progress = Math.min(1, Math.max(0, (to - eye.start) / eye.span));

    frame = {
      size: eye.size,
      x: Math.round(eye.x + eye.drift * progress),
      y: Math.round(eye.y),
      alpha: eyeAlpha(eye, to) * EYES.alpha,
    };
  };

  return {
    reset: (at, nextBubbles, nextEyes) => {
      bubbleRng = nextBubbles;
      eyeRng = nextEyes;
      undersea = TITLE_UNDERSEA;
      clearedAt = null;
      emitter.phase = 0;
      nextSlot = at - PREWARM + EYES.slot;
      quietFrom = -Infinity;
      eye = null;
      frame = null;
      earlySlot = nextEyes.next() < EYES.early.chance ? nextEyes.nextInt(EYES.early.slots) : -1;
      earlySlots = 0;
      dropped = 0;
      eyesShown = 0;
      slots.clear();
      bubbles.forEach(park);
    },
    set: (at, next) => {
      if (next === null || !next.eyes) {
        closeEye(at);
      }

      if (next === null && clearedAt === null) {
        clearedAt = at;
      }

      undersea = next;
    },
    step: (from, to, { rate }) => {
      while (nextSlot <= to) {
        openSlot(nextSlot);
        nextSlot += EYES.slot;
      }

      if (undersea !== null) {
        emitBetween(emitter, bubbleRate(undersea.part) * rate, from, to, emit);
      }

      const clearing = clearedAt === null ? 1 : 1 - (to - clearedAt) / BUBBLES.clearFade;

      for (let slot = 0; slot < bubbles.length; slot++) {
        if (slots.live[slot] === 1) {
          placeBubble(slot, to, clearing);
        }
      }

      placeEye(to);
    },
    get eye() {
      return frame;
    },
    stats: {
      get bubbles() {
        return slots.inUse;
      },
      get dropped() {
        return dropped;
      },
      get eyes() {
        return eyesShown;
      },
    },
  };
};
