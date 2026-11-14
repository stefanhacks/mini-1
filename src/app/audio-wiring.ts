// Audio (M3) and the pause (M5): the engine, the corner buttons (mute, pause, reduce flashes, endless mode), "Tap to
// continue" and
// the audio lifecycle, then the gestures that drive them. The states play the cues and pick the music (states/cues.ts,
// story.ts). Written by Claude Code.
import { createAudioEngine, type AudioEngine } from "../core/audio/audio-engine.ts";
import type { Layers } from "../core/layers.ts";
import { createAudioLifecycle, type AudioLifecycle } from "../game/audio-lifecycle.ts";
import { createEndlessButton } from "../game/endless-button.ts";
import { createFlashesButton, type FlashesButtonView } from "../game/flashes-button.ts";
import type { InputRouter } from "../game/input/dom-router.ts";
import { createMuteButton } from "../game/mute-button.ts";
import type { Pause } from "../game/pause.ts";
import { createPauseButton } from "../game/pause-button.ts";
import { createContinuePrompt } from "../game/scene.ts";
import type { ReduceFlashes } from "../game/reduce-flashes.ts";
import { watchReducedMotion } from "../game/scene/lightning.ts";
import type { GateControl } from "../game/states/gate.ts";
import type { LayoutBus } from "./layout-bus.ts";

/** `reduceFlashes` only sets the toggle's icon; wireGestures flips it. */
export const wireAudio = (layers: Layers, layouts: LayoutBus, reduceFlashes: Pick<ReduceFlashes, "on">) => {
  const audio = createAudioEngine();
  // The corner stack, top to bottom (input/corner-geometry.ts), so they are added in that order.
  const muteButton = createMuteButton(layers.ui);
  const pauseButton = createPauseButton(layers.ui);
  const flashesButton = createFlashesButton(layers.ui);
  const endlessButton = createEndlessButton(layers.ui, watchReducedMotion());

  muteButton.setMuted(audio.muted);
  flashesButton.setReduced(reduceFlashes.on);
  layouts.follow((next) => {
    muteButton.setLayout(next);
    pauseButton.setLayout(next);
    flashesButton.setLayout(next);
    endlessButton.setLayout(next);
  });

  // "Tap to continue": while the game is paused (pause.ts), or audio can't resume without a gesture (the lifecycle).
  const continuePrompt = createContinuePrompt(layers, layouts.current);

  layouts.onLayout(continuePrompt.relayout);

  const lifecycle = createAudioLifecycle(
    audio,
    { setVisible: (visible) => continuePrompt.setAudioPrompt(visible) },
    () => document.visibilityState === "visible",
  );

  return { audio, muteButton, pauseButton, flashesButton, endlessButton, continuePrompt, lifecycle };
};

export interface GestureWiring {
  readonly router: InputRouter;
  readonly audio: AudioEngine;
  readonly muteButton: { setMuted(muted: boolean): void };
  readonly lifecycle: AudioLifecycle;
  /** The state machine's current state, read on every gesture. */
  readonly machine: { readonly current: string | undefined };
  readonly gate: GateControl;
  readonly pause: Pause;
  readonly reduceFlashes: ReduceFlashes;
  readonly flashesButton: Pick<FlashesButtonView, "setReduced">;
}

/**
 * Registers the mute toggle, the pause toggle and the "reduce flashes" toggle, then the activation hooks: Gate's
 * before the lifecycle's. They run inside the DOM gesture (router-core.ts has the contract): Gate's begin tap unlocks
 * audio and starts the music, and any later tap unlocks audio again when it needs a gesture and resumes a paused game
 * ("Tap to continue"). Call it once the machine exists.
 */
export const wireGestures = ({
  router, audio, muteButton, lifecycle, machine, gate, pause, reduceFlashes, flashesButton,
}: GestureWiring) => {
  // Any tap or key once Gate is left (at the gate the begin tap's unlock and its touchend retry are Gate's): unlocks
  // audio when it needs a gesture, then resumes the game, in that order, inside the gesture. The touchend retry
  // (router-core.ts) calls it again: the unlock is idempotent and the game has resumed already.
  const continueGame = () => {
    if (machine.current !== "gate") {
      lifecycle.activate();
      pause.resume();
    }
  };

  router.onMute(() => {
    audio.setMuted(!audio.muted);
    muteButton.setMuted(audio.muted);

    // A mute tap or the M key is a gesture too: it may resume audio, without counting as an activation. Not while
    // paused: audio stays suspended with the game until the tap that resumes both.
    if (machine.current !== "gate" && !pause.paused) {
      lifecycle.activate();
    }
  });
  // The pause button (while it is "ready") and the pause keys: pause, or resume as a tap would.
  router.onPause(() => {
    if (pause.paused) {
      continueGame();
    } else {
      pause.pause();
    }
  });
  // The "reduce flashes" toggle only toggles: no audio unlock, no resume, paused or not. The next strike reads it for
  // the square's cap, the screen tone every frame.
  router.onFlashes(() => flashesButton.setReduced(reduceFlashes.toggle()));
  // The endless-mode icon's tap or E key (only on while not paused, router-core.ts) is a gesture too: it may resume
  // audio. Its "endless" event is already queued for the states.
  router.onEndless(() => lifecycle.activate());
  router.onActivate(() => gate.activate());
  router.onActivate(continueGame);
};
