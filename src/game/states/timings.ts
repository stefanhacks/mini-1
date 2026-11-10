// The game flow's waits, in ms of game time, from the original GameManager.cs, its Main.unity overrides and the
// animation events in Troca.anim and Fim.anim. M2 cuts instantly at each; M4 adds the tweens between them.

/** Story part 0's preamble: 1.25 s, a thunder strike (M4), 1.25 s more, then the first line. */
export const STORY_PREAMBLE_MS = 2500;

/** Taps are ignored this long after a page appears, so a double tap can't skip one unread (02, Progression taps). */
export const STORY_DEBOUNCE_MS = 200;

/** Transition (`Troca.anim`): the thunder at 167 ms (M4), the round at 500 ms. */
export const TRANSITION_MS = 500;

/** After the last challenge of a round: the backdrop appears, and the next story part starts after this. */
export const AFTER_ROUND_MS = 1250;

/** The ending (`Fim.anim`, then GameManager's GameEnd), from the end of story part 3. */
export const ENDING_MS = {
  /** `FimBarco`: the broken boat is thrown up (M4: an animation only). */
  thrown: 583,
  /** `FimKraken`: the kraken appears (and roars, M3). */
  kraken: 1500,
  /** `FimFade`: fade to black (the event is at 8.017 s; the plan rounds it to 8 s). */
  black: 8000,
  /** `FimFinal`: the scene is cleared and the empty sea comes back. */
  sea: 10000,
  /** `endGameDelay` (3.5 s in Main.unity) later: the logo and the credits, and in this port "Tap to play again". */
  card: 13500,
} as const;
