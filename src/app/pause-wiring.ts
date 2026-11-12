// The pause (pause.ts) wired to the game: its clock, the input router, the frame stepper, the audio lifecycle, and the
// views it drives ("Tap to continue", the pause button). Written by Claude Code.
import type { GameClock } from "../core/clock.ts";
import type { AudioLifecycle } from "../game/audio-lifecycle.ts";
import type { FrameStepper } from "../game/frame-step.ts";
import type { InputRouter } from "../game/input/dom-router.ts";
import { createPause } from "../game/pause.ts";
import type { PauseButtonView } from "../game/pause-button.ts";
import type { ContinuePromptScene } from "../game/scene/continue-prompt.ts";
import type { Game } from "../game/states/index.ts";

export interface PauseWiring {
  readonly clock: GameClock;
  /** The state machine's current state: pausing is off at the gate. */
  readonly machine: { readonly current: string | undefined };
  readonly game: Pick<Game, "resetChallenge">;
  readonly stepper: FrameStepper;
  readonly router: InputRouter;
  readonly lifecycle: AudioLifecycle;
  readonly continuePrompt: ContinuePromptScene;
  readonly pauseButton: PauseButtonView;
}

/** Every call goes through its object (`router.beginEpoch()`, not a destructured `beginEpoch`): e2e replaces them. */
export const wirePause = ({
  clock, machine, game, stepper, router, lifecycle, continuePrompt, pauseButton,
}: PauseWiring) => createPause({
  clock,
  view: continuePrompt,
  input: router,
  stepper,
  resetChallenge: () => game.resetChallenge(),
  suspendAudio: () => lifecycle.hidden(),
  available: () => machine.current !== undefined && machine.current !== "gate",
  audioPrompt: () => lifecycle.prompting,
  onInput: (input) => {
    router.setPauseInput(input);
    pauseButton.setEnabled(input !== "off");
  },
});
