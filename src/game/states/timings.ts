// The game flow's waits, in ms of game time, from the original GameManager.cs, its Main.unity overrides and the
// animation events in Troca.anim and Fim.anim. M2 cuts instantly at each; M4 adds the tweens between them.

/** Story part 0's preamble: 1.25 s, a thunder strike (STORY_PREAMBLE_CUES), 1.25 s more, then the first line. */
export const STORY_PREAMBLE_MS = 2500;

/**
 * Taps are ignored this long after a page is complete (typed out, or completed by a tap), so a double tap can't skip
 * one unread (02, Progression taps; M2 owner decision 5).
 */
export const STORY_DEBOUNCE_MS = 200;

/**
 * Typing speed of a normal line: one character per 60 Hz frame. The original's `typingSpeed` was 0.01 s, but each
 * `WaitForSeconds` resumes at most once a frame, so it typed about one character per frame (04, correction 9).
 */
export const TYPE_MS_PER_CHAR = 1000 / 60;

/** Typing speed of a whisper: `typingSpeed × modifier` (0.01 s × 10 in TextManager.prefab), a frame cap far below. */
export const WHISPER_MS_PER_CHAR = 100;

/** Transition (`Troca.anim`): the thunder at 167 ms (TRANSITION_CUES), the round at 500 ms. */
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

// Cues: the moments a state's timeline strikes, as named events at ms from the state's enter, on the game clock.
// states/cues.ts plays each cue's sound (cue → SFX) and, for a strike, the bolt and the flash (`SceneView.strike`);
// `GameDeps.onCue` reports it (the cue log).

/**
 * - `lightning`: a strike (`DoTheThunder`): bolt, flash and a thunderclap.
 * - `title-reveal`: Title's big strike, with a thunderclap. The cue marks the strike; the logo appears
 *   TITLE_REVEAL_FLASH_MS later, at the flash's peak.
 * - `kraken`: the kraken appears (`FimKraken`), with its roar.
 *
 * A CueEvent carries no payload: a strike's bolt sprite, position and mirror (`DoTheThunder`'s draws) come from the
 * game's lightning RNG (`GameSession.lightning`, lightning.ts).
 */
export type CueName = "lightning" | "title-reveal" | "kraken";

export interface Cue {
  /** Ms of game time from the state's enter. */
  readonly at: number;
  readonly name: CueName;
}

/**
 * Title's intro (GameManager `Inicio`): warm-up 0.75 s, two strikes 1.25 s apart, then the reveal 2 s later. Title
 * also strikes at random afterwards, see TITLE_AMBIENT.
 */
export const TITLE_CUES: readonly Cue[] = [
  { at: 2000, name: "lightning" },
  { at: 3250, name: "lightning" },
  { at: 5250, name: "title-reveal" },
];

/**
 * Title's ambient lightning, as GameManager's `CheckForThunder`: a timer counts up from the end of the intro (7.25 s,
 * when the credits and "Press Any Key" appear) and strikes when it reaches `interval`, then restarts from a new value.
 * It starts at a whole number of seconds in [`first`), and restarts at one in [`next`) (Unity's
 * `Random.Range(int, int)`, max exclusive). So the first strike comes 5–7 s after the intro, and the next ones 7–10 s
 * apart.
 */
export const TITLE_AMBIENT = {
  /** When the timer starts counting (`entranceWarmUp + 2 × entrancePreambleDelay + entranceDelay + PressKeyDelay`). */
  from: 7250,
  /** `thunderInterval`. */
  interval: 10000,
  /** `Random.Range(3, 6)` s: the timer's start value (`Start()`). */
  first: [3, 6],
  /** `Random.Range(0, 4)` s: its value after each strike. */
  next: [0, 4],
} as const;

/** `Flash.anim`'s `DoingFlash` event: the flash peaks, and the logo appears, this long after `title-reveal`. */
export const TITLE_REVEAL_FLASH_MS = 250;

/**
 * Title ignores taps this long after it appears, as Story's debounce, so the tap that ended the last game can't also
 * start the next. A stopgap: M4 replaces it by showing and accepting Title's prompt only after its 7.25 s intro
 * (owner decision 6).
 */
export const TITLE_DEBOUNCE_MS = 500;

/** Story part 0's preamble strike (`firstTimePreamblePreambleDelay`). Other parts have none. */
export const STORY_PREAMBLE_CUES: readonly Cue[] = [{ at: 1250, name: "lightning" }];

/** `Troca.anim`'s `Troca` event. */
export const TRANSITION_CUES: readonly Cue[] = [{ at: 167, name: "lightning" }];

/** `Fim.anim`'s `FimKraken` event. */
export const ENDING_CUES: readonly Cue[] = [{ at: ENDING_MS.kraken, name: "kraken" }];
