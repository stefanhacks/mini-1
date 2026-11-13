// Under the sea: the bubbles (m5-particles-spec §3) and, now and then, an eye in place of the bubbles between pages
// (eyes.ts). Pure TypeScript with no Pixi import. Written by Claude Code.
import type { Rng } from "../../challenges/rng.ts";
import type { Undersea } from "../../states/types.ts";
import { createEyes, type EyeFrame } from "./eyes.ts";
import { createSlots, emitBetween, park, type Dot, type Emitter } from "./pool.ts";
import { between, BUBBLES, bubbleRate, bubbleSway } from "./spec.ts";

export interface UnderseaStats {
  readonly bubbles: number;
  /** Bubbles a full pool turned away since the last reset. */
  readonly dropped: number;
  /** Eyes shown since the last reset. */
  readonly eyes: number;
}

export interface UnderseaSystem {
  /**
   * A new game: no bubble or eye, Title's undersea, and the bubbles' and the eyes' draws from these streams. The eye
   * stream draws this game's early eye now. Then step over PREWARM s to prewarm.
   */
  readonly reset: (bubbles: Rng, eyes: Rng) => void;
  /**
   * From `at` on: this part's bubbles, and an eye window of `eyesFor` game ms opened or closed. Null clears both (the
   * kraken).
   */
  readonly set: (at: number, undersea: Undersea | null) => void;
  readonly step: (from: number, to: number, options: { readonly rate: number }) => void;
  /** The eye shown, or null. */
  readonly eye: EyeFrame | null;
  readonly stats: UnderseaStats;
}

/** Title's undersea, and every game's first: the scene's 1 bubble a second, no eye. */
export const TITLE_UNDERSEA: Undersea = { part: 0, eyesFor: 0 };

/** `bubbles` are the drawn dots, one per pool slot (BUBBLES.pool). `eyesAlways`: see eyes.ts. */
export const createUndersea = (bubbles: readonly Dot[], eyesAlways = false): UnderseaSystem => {
  const slots = createSlots(bubbles.length);
  const birth = new Float64Array(bubbles.length);
  const startX = new Float64Array(bubbles.length);
  const startY = new Float64Array(bubbles.length);
  const startAlpha = new Float64Array(bubbles.length);
  const emitter: Emitter = { phase: 0 };
  const eyes = createEyes(eyesAlways);

  let bubbleRng: Rng | null = null;
  let undersea: Undersea | null = TITLE_UNDERSEA;
  /** When the kraken cleared the sea, or null. */
  let clearedAt: number | null = null;
  let dropped = 0;

  const emit = (at: number) => {
    // An eye shows in place of the bubbles.
    if (eyes.covers(at)) {
      return;
    }

    if (bubbleRng === null) {
      throw new Error("The undersea steps before its first reset");
    }

    const rng = bubbleRng;
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

  return {
    reset: (nextBubbles, nextEyes) => {
      bubbleRng = nextBubbles;
      undersea = TITLE_UNDERSEA;
      clearedAt = null;
      emitter.phase = 0;
      eyes.reset(nextEyes);
      dropped = 0;
      slots.clear();
      bubbles.forEach(park);
    },
    set: (at, next) => {
      if (next === null || next.eyesFor <= 0) {
        eyes.close(at);
      } else if (clearedAt === null) {
        eyes.open(at, next.part, next.eyesFor / 1000);
      }

      if (next === null && clearedAt === null) {
        clearedAt = at;
      }

      undersea = next;
    },
    step: (from, to, { rate }) => {
      if (undersea !== null) {
        emitBetween(emitter, bubbleRate(undersea.part) * rate, from, to, emit);
      }

      const clearing = clearedAt === null ? 1 : 1 - (to - clearedAt) / BUBBLES.clearFade;

      for (let slot = 0; slot < bubbles.length; slot++) {
        if (slots.live[slot] === 1) {
          placeBubble(slot, to, clearing);
        }
      }

      eyes.place(to);
    },
    get eye() {
      return eyes.frame;
    },
    stats: {
      get bubbles() {
        return slots.inUse;
      },
      get dropped() {
        return dropped;
      },
      get eyes() {
        return eyes.shown;
      },
    },
  };
};
