// The game flow's waits, in ms of game time, from the original GameManager.cs, its Main.unity overrides and the
// animation events in Troca.anim, Inicio.anim and Fim.anim. The fades between them play in the scene (SceneView's
// `Fade`), on the same clock.
import type { Fade } from "./types.ts";

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

/**
 * After the last challenge of a round (`afterGamePlayDelay`): the backdrop fades in from the win, and the next story
 * part starts after this.
 */
export const AFTER_ROUND_MS = 1250;

/**
 * The ending (`Fim.anim`, then GameManager's GameEnd), from the end of story part 3: when each phase starts its fade,
 * and when black fades out. The black's fades wait for TelaPreta's animator (see ANIMATOR DELAYS below).
 */
export const ENDING_MS = {
  /**
   * Part 3's black fades out (`FadeOut` on `TelaPreta`, 1 s). It is triggered at 0, but TelaPreta only leaves its
   * FadeIn state at exit time 0.75 with a 0.25 s blend, so the original began it 0–1 s late; 0.5 s is the typical
   * case, the same delay as `black`'s (m4-plan, owner decision 5).
   */
  lift: 500,
  /** `FimBarco` (0.583 s): the broken boat is thrown up (`BarcoQuebradoJogadoCima`, 1.67 s; its end pose stays). */
  thrown: 583,
  /** `FimKraken`: the kraken's body and tail fade in (`FadeKrakenA`/`B`, 1 s, the body rising), with its roar. */
  kraken: 1500,
  /**
   * Black fades in (`FadeIn` on `TelaPreta`, 1 s), fully black at 9.5 s. `FimFade` is at 8.017 s, but TelaPreta's
   * animator only leaves its empty Idle state at exit time 0.75 with a 0.25 s blend, so the original faded up to about
   * 1 s late at a random point. 8.5 s is its typical case, fully black before `FimFinal` (m4-plan, Notes for wave 2).
   */
  black: 8500,
  /** `FimFinal`: the kraken, the broken boat and the backdrops go, a cut under full black. */
  sea: 10000,
  /**
   * `FimFinal`'s `FadeOut` of black (1 s) to the empty sea. TelaPreta is in its FadeIn state from 8.5 s, whose exit
   * time 0.75 comes at 9.25 s and 10.25 s: the trigger at 10 s waits for 10.25 s (m4-plan, owner decision 5).
   */
  seaLift: 10250,
  /** `endGameDelay` (3.5 s in Main.unity) after `FimFinal`: the logo and the credits fade in at ENDING_CARD_SPEED. */
  card: 13500,
  /**
   * "Tap to play again" (new in this port) fades in at speed 1 once the card is in (2 s at ENDING_CARD_SPEED), Title's
   * logo-to-prompt gap (7.25 − 5.5 = 1.75 s) plus REPLAY_EXTRA_MS later (m4-plan, owner decision 6; m5-plan, owner
   * decision 1). The ending takes the replay tap only from here.
   */
  replay: 22250,
} as const;

/** The owner's extra wait before "Tap to play again": unusually long, so it feels as if there is no way back. */
export const REPLAY_EXTRA_MS = 5000;

/** GameEnd sets the logo's and the credits' animators to speed 0.5, so the card's fades take 2 s. */
export const ENDING_CARD_SPEED = 0.5;

/** A fade at the clips' own speed. */
export const FADE: Fade = { speed: 1 };

/** The ending card's fades (ENDING_CARD_SPEED). */
export const CARD_FADE: Fade = { speed: ENDING_CARD_SPEED };

// ANIMATOR DELAYS. The original started most fades through Animator transitions, which the clip data doesn't carry.
// TelaPreta, PillarsAnimator and GameManager's Inicio each leave a looping state at exit time 0.75 with a 0.25 s blend,
// so those fades began 0–1 s after their trigger, at an effectively random point. The port picks one deterministic
// time for each (m4-plan, Notes for wave 2 and owner decision 5):
// - the ending's fade to black (TelaPreta, from Idle): `FimFade` at 8.017 s, so 8.017–9.017 s; ENDING_MS.black,
//   8.5 s, the typical case, so black is full before FimFinal;
// - part 3's black fading out as the ending starts (TelaPreta, from FadeIn): 0–1 s; ENDING_MS.lift, 0.5 s, the same
//   typical delay;
// - FimFinal's fade-out of black (TelaPreta, from the FadeIn started at 8.5 s): exit time at 9.25 s and 10.25 s, so the
//   trigger at 10 s waits; ENDING_MS.seaLift, 10.25 s. FimFinal's cuts stay at 10 s, under full black;
// - the backdrop's FadeIn after a won round (PillarsAnimator): 0–1 s; fired on the win, with no exit-time delay (it
//   then runs 1 s of the AFTER_ROUND_MS wait);
// - Title's exit (`Inicio`): 0–1 s; fired on the accepted tap, with no exit-time delay (TITLE_EXIT_MS);
// - story part 3's black FadeIn (TelaPreta, from Idle): 0–1 s; fired on the trigger, with no exit-time delay;
// - the title texts (TMPAnimator) and the logo (LogoAnimator) leave their states with no exit time: no delay in the
//   original either.

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
 * The end of Title's intro (`entranceWarmUp + 2 × entrancePreambleDelay + entranceDelay + entrancePressKeyDelay`):
 * the credits fade in (`TMPFadeIn`) and the tap prompt too (`TMPFadeIn`, then the `TMPIdle` pulse). Title accepts the
 * tap only from here (`titleAnimationOver`), as the original took no key before it.
 */
export const TITLE_PROMPT_MS = 7250;

/**
 * Title's exit (`Inicio.anim`, 1 s): its `Inicio` event at 0 s fades the logo, the credits and the prompt out
 * (`FadeOut`, `TMPFadeOut`, 1 s each), and its `FimInicio` event at 1 s starts the story. It starts on the tap (see
 * ANIMATOR DELAYS). Ambient lightning goes on meanwhile: the original's `CheckForThunder` runs until `FimInicio`.
 * A tap while the credits and the prompt still fade in fades them out from the alpha they reached, over the same 1 s
 * (m4-plan, owner decision 7).
 */
export const TITLE_EXIT_MS = 1000;

/**
 * Title's ambient lightning, as GameManager's `CheckForThunder`: a timer counts up from the end of the intro (7.25 s,
 * when the credits and "Press Any Key" appear) and strikes when it reaches `interval`, then restarts from a new value.
 * It starts at a whole number of seconds in [`first`), and restarts at one in [`next`) (Unity's
 * `Random.Range(int, int)`, max exclusive). So the first strike comes 5–7 s after the intro, and the next ones 7–10 s
 * apart.
 */
export const TITLE_AMBIENT = {
  /** When the timer starts counting: the end of the intro. */
  from: TITLE_PROMPT_MS,
  /** `thunderInterval`. */
  interval: 10000,
  /** `Random.Range(3, 6)` s: the timer's start value (`Start()`). */
  first: [3, 6],
  /** `Random.Range(0, 4)` s: its value after each strike. */
  next: [0, 4],
} as const;

/** `Flash.anim`'s `DoingFlash` event: the flash peaks, and the logo appears, this long after `title-reveal`. */
export const TITLE_REVEAL_FLASH_MS = 250;

/** Story part 0's preamble strike (`firstTimePreamblePreambleDelay`). Other parts have none. */
export const STORY_PREAMBLE_CUES: readonly Cue[] = [{ at: 1250, name: "lightning" }];

/** `Troca.anim`'s `Troca` event. */
export const TRANSITION_CUES: readonly Cue[] = [{ at: 167, name: "lightning" }];

/** `Fim.anim`'s `FimKraken` event. */
export const ENDING_CUES: readonly Cue[] = [{ at: ENDING_MS.kraken, name: "kraken" }];
