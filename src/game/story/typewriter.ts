// Types a story page character by character on game time. Pure TypeScript: the story state feeds it its update's
// deltaMS (so it freezes with the clock) and the view shows the first `revealed` characters of the page.
//
// As the original (TextManager.cs, `Type`): the first character shows at once, then one more every `msPerChar`. The
// original waited `WaitForSeconds(0.01)` per character, which Unity can't resume more than once a frame, so it typed
// about one character per frame (04, correction 9); a time accumulator here reveals several characters in a long
// frame instead of falling behind. Every character counts, spaces and the speaker label included, as the original
// typed the talker string first. Written by Claude Code.

export interface Typewriter {
  /** How many of the page's characters show: 0..length. */
  readonly revealed: number;
  /** The page's character count. */
  readonly length: number;
  /** Whether every character shows. */
  readonly done: boolean;
  /** Types on by `deltaMS` of game time. Does nothing once done. */
  update(deltaMS: number): void;
  /** Shows the whole page at once (a tap while typing). */
  complete(): void;
  /**
   * Follows a relayout: the page now has `length` characters, from the same start. What shows stays shown (cut to
   * the new length), typing carries on from there, and a page already complete stays complete.
   */
  resize(length: number): void;
}

// Absorbs float error in `elapsed / msPerChar`, so 60 frames of 1000/60 ms type exactly 60 characters.
const EPSILON = 1e-9;

/** A typewriter for a page of `length` characters at `msPerChar` ms of game time each. */
export const createTypewriter = (length: number, msPerChar: number): Typewriter => {
  if (!(msPerChar > 0)) {
    throw new RangeError(`msPerChar must be > 0, got ${msPerChar}`);
  }

  let total = Math.max(0, Math.floor(length));
  // Game time since the first character showed; Infinity once completed.
  let elapsed = 0;

  const revealed = () => Math.min(total, Math.floor(elapsed / msPerChar + EPSILON) + 1);

  return {
    get revealed() {
      return revealed();
    },
    get length() {
      return total;
    },
    get done() {
      return revealed() >= total;
    },
    update: (deltaMS) => {
      if (revealed() < total && deltaMS > 0) {
        elapsed += deltaMS;
      }
    },
    complete: () => {
      elapsed = Infinity;
    },
    resize: (next) => {
      const shown = revealed();
      const wasDone = shown >= total;

      total = Math.max(0, Math.floor(next));

      // While typing, `elapsed` alone keeps the shown count and the time into the next character.
      if (wasDone || shown >= total) {
        elapsed = Infinity;
      }
    },
  };
};
