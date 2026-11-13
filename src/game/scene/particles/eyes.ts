// The eye under the sea, now and then, in place of the bubbles between pages (m4-plan, "Eye sprites"; m5-plan,
// deliverable 2 and owner decisions 3, 4, 10 and 11). undersea.ts opens and closes its windows and steps it. Pure
// TypeScript with no Pixi import. Written by Claude Code.
import type { Rng } from "../../challenges/rng.ts";
import { between, EYES, type EyeSize } from "./spec.ts";

/** The eye as it shows at the last step. */
export interface EyeFrame {
  readonly size: EyeSize;
  /** Its centre, in whole playfield px. */
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

interface Eye {
  readonly size: EyeSize;
  readonly x: number;
  readonly y: number;
  readonly drift: number;
  readonly start: number;
  /** Its window's length: the drift runs over this. */
  readonly span: number;
  /** Each fade's length. */
  readonly fade: number;
  /** When it starts fading out, and from which alpha (1 unless it was cut short during its fade-in). */
  outAt: number;
  outFrom: number;
  end: number;
}

export interface Eyes {
  /** A new game: no eye, and the eyes' draws from `rng`, which draws this game's early eye now. */
  readonly reset: (rng: Rng) => void;
  /** A window of `window` s opens at `at` in part `part`: an eye fills it, or not. */
  readonly open: (at: number, part: number, window: number) => void;
  /** The window closes at `at`: a shown eye starts its fade-out from the alpha it reached. */
  readonly close: (at: number) => void;
  /** Places the eye at `to`, or drops it once it has faded out. */
  readonly place: (to: number) => void;
  /** Whether an eye shows at `at`: the bubbles don't. */
  readonly covers: (at: number) => boolean;
  /** The eye shown at the last `place`, or null. */
  readonly frame: EyeFrame | null;
  /** Eyes shown since the last reset. */
  readonly shown: number;
}

/** The eye's alpha at `at`, before EYES.alpha: fade in, hold, fade out. */
const eyeAlpha = (eye: Eye, at: number) => (at < eye.outAt
  ? Math.min(1, (at - eye.start) / eye.fade)
  : Math.max(0, eye.outFrom - (at - eye.outAt) / eye.fade));

/**
 * `eyesAlways` (`?debug&eyes=always`) shows an eye in every window where one may show, of either size, so they can be
 * reviewed without waiting.
 *
 * An eye fills the window it shows in (EYES.fade): it fades in as the window opens and has faded out as it closes, so
 * it never lingers over the text box or a challenge. A window closed early (a debug jump) fades it out from the
 * alpha it reached.
 */
export const createEyes = (eyesAlways = false): Eyes => {
  let rng: Rng | null = null;
  let eye: Eye | null = null;
  let frame: EyeFrame | null = null;
  // This game's eye in parts 0–1: the window it shows in, counted over the long windows there, or −1 for none.
  let earlyWindow = -1;
  let earlyWindows = 0;
  let shown = 0;

  /**
   * Whether a window of `window` s shows an eye. Parts 0–1 have at most this game's one, in a long window; later
   * parts draw each window.
   */
  const drawsEye = (draws: Rng, part: number, window: number) => {
    if (eyesAlways) {
      return true;
    }

    if (part < 2) {
      if (window < EYES.early.minWindow) {
        return false;
      }

      earlyWindows += 1;

      return earlyWindows - 1 === earlyWindow;
    }

    return draws.next() < EYES.chance;
  };

  const sizeOf = (draws: Rng, part: number): EyeSize => {
    if (eyesAlways) {
      return draws.next() < 0.5 ? "large" : "small";
    }

    return part >= EYES.largeFrom && draws.next() < 0.5 ? "large" : "small";
  };

  return {
    reset: (next) => {
      rng = next;
      eye = null;
      frame = null;
      earlyWindow = next.next() < EYES.early.chance ? next.nextInt(EYES.early.windows) : -1;
      earlyWindows = 0;
      shown = 0;
    },
    open: (at, part, window) => {
      if (eye !== null && eye.end <= at) {
        eye = null;
      }

      if (rng === null) {
        throw new Error("The undersea steps before its first reset");
      }

      const draws = rng;

      // Never two at once: a window opening over a closing eye shows none.
      if (!drawsEye(draws, part, window) || eye !== null) {
        return;
      }

      const next = () => draws.next();
      const size = sizeOf(draws, part);
      const band = EYES.band[size];
      const x = between(next, band.x);
      const y = between(next, band.y);
      const drift = Math.round((next() * 2 - 1) * EYES.drift);
      const fade = Math.min(EYES.fade, window * EYES.fadeShare);
      const end = at + window;

      eye = { size, x, y, drift, start: at, span: window, fade, outAt: end - fade, outFrom: 1, end };
      shown += 1;
    },
    close: (at) => {
      if (eye !== null && at < eye.outAt) {
        eye.outFrom = eyeAlpha(eye, at);
        eye.outAt = at;
        eye.end = at + eye.fade * eye.outFrom;
      }
    },
    place: (to) => {
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
    },
    covers: (at) => eye !== null && at >= eye.start && at < eye.end,
    get frame() {
      return frame;
    },
    get shown() {
      return shown;
    },
  };
};
