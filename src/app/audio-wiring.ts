// Audio (M3): the engine, the mute button, "Tap to continue" and the lifecycle, then the gestures that drive them. The
// states play the cues and pick the music (states/cues.ts, story.ts). Written by Claude Code.
import { createAudioEngine, type AudioEngine } from "../core/audio/audio-engine.ts";
import type { Layers } from "../core/layers.ts";
import { createAudioLifecycle, type AudioLifecycle } from "../game/audio-lifecycle.ts";
import type { InputRouter } from "../game/input/dom-router.ts";
import { createMuteButton } from "../game/mute-button.ts";
import { createContinuePrompt } from "../game/scene.ts";
import type { GateControl } from "../game/states/gate.ts";
import type { LayoutBus } from "./layout-bus.ts";

export const wireAudio = (layers: Layers, layouts: LayoutBus) => {
  const audio = createAudioEngine();
  const muteButton = createMuteButton(layers.ui);

  muteButton.setMuted(audio.muted);
  layouts.follow((next) => muteButton.setLayout(next));

  // "Tap to continue": shown by the lifecycle when audio can't resume without a gesture.
  const continuePrompt = createContinuePrompt(layers, layouts.current);

  layouts.onLayout(continuePrompt.relayout);

  const lifecycle = createAudioLifecycle(audio, continuePrompt, () => document.visibilityState === "visible");

  return { audio, muteButton, lifecycle };
};

export interface GestureWiring {
  readonly router: InputRouter;
  readonly audio: AudioEngine;
  readonly muteButton: { setMuted(muted: boolean): void };
  readonly lifecycle: AudioLifecycle;
  /** The state machine's current state, read on every gesture. */
  readonly machine: { readonly current: string | undefined };
  readonly gate: GateControl;
}

/**
 * Registers the mute toggle, then the activation hooks: Gate's before the lifecycle's. They run inside the DOM gesture
 * (router-core.ts has the contract): Gate's begin tap unlocks audio and starts the music, and any later tap unlocks
 * audio again when it needs a gesture ("Tap to continue"). Call it once the machine exists. Returns the unsubscribes.
 */
export const wireGestures = ({ router, audio, muteButton, lifecycle, machine, gate }: GestureWiring) => {
  // Unlocks audio when it needs a gesture: any tap or key once Gate is left (at the gate the begin tap's unlock and its
  // touchend retry are Gate's).
  const continueAudio = () => {
    if (machine.current !== "gate") {
      lifecycle.activate();
    }
  };

  return [
    router.onMute(() => {
      audio.setMuted(!audio.muted);
      muteButton.setMuted(audio.muted);
      // A mute tap or the M key is a gesture too: it may resume audio, without counting as an activation.
      continueAudio();
    }),
    router.onActivate(() => gate.activate()),
    router.onActivate(continueAudio),
  ];
};
