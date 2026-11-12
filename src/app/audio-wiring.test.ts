import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import type { AudioEngine } from "../core/audio/audio-engine.ts";
import type { AudioLifecycle } from "../game/audio-lifecycle.ts";
import type { InputRouter } from "../game/input/dom-router.ts";
import type { GateControl } from "../game/states/gate.ts";

// The manifest imports Vite `?url` assets; under node each becomes its file name.
registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!specifier.includes("?url")) {
      return nextResolve(specifier, context);
    }

    const source = `export default ${JSON.stringify(specifier.split("?")[0] ?? "")}`;

    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  },
});

const { wireGestures } = await import("./audio-wiring.ts");

/** Wires the gestures to fakes that log every call; `state` is the machine's current state. */
const setUp = (state: string) => {
  const calls: string[] = [];
  const activateListeners: (() => void)[] = [];
  const muteListeners: (() => void)[] = [];
  const router = {
    onActivate: (listener: () => void) => {
      activateListeners.push(listener);

      return () => undefined;
    },
    onMute: (listener: () => void) => {
      muteListeners.push(listener);

      return () => undefined;
    },
  } as unknown as InputRouter;
  let muted = false;
  const audio = {
    get muted() {
      return muted;
    },
    setMuted: (value: boolean) => {
      muted = value;
      calls.push(`audio.setMuted:${value}`);
    },
  } as unknown as AudioEngine;
  const lifecycle = { activate: () => calls.push("lifecycle.activate") } as unknown as AudioLifecycle;
  const gate = { activate: () => calls.push("gate.activate") } as unknown as GateControl;
  const muteButton = { setMuted: (value: boolean) => calls.push(`muteButton.setMuted:${value}`) };

  wireGestures({ router, audio, muteButton, lifecycle, machine: { current: state }, gate });

  return { calls, activateListeners, muteListeners };
};

describe("wireGestures", () => {
  it("registers Gate's activation hook before the lifecycle's", () => {
    const { calls, activateListeners } = setUp("title");

    assert.equal(activateListeners.length, 2);
    activateListeners.forEach((listener) => listener());

    assert.deepEqual(calls, ["gate.activate", "lifecycle.activate"]);
  });

  it("leaves the gate's taps to Gate: the lifecycle isn't activated there", () => {
    const { calls, activateListeners } = setUp("gate");

    activateListeners.forEach((listener) => listener());

    assert.deepEqual(calls, ["gate.activate"]);
  });

  it("mute toggles the engine and the button, then continues audio like any gesture", () => {
    const { calls, muteListeners } = setUp("round");

    assert.equal(muteListeners.length, 1);
    muteListeners[0]?.();

    assert.deepEqual(calls, ["audio.setMuted:true", "muteButton.setMuted:true", "lifecycle.activate"]);
  });
});
