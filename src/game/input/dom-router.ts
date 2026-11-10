// The input router's DOM glue: canvas pointer events, the keyboard, and page visibility, fed into one PointerMap.
// It uses DOM events, not Pixi's federated events: Pixi never delivers pointercancel (04, correction 1), and the
// playfield is a render texture outside the hit-test tree. DOM handlers only queue events; the active state drains them
// in `update`, so input runs under the state machine's error guard and in game time.

//
// The decisions (mute button first, pads, the activation and mute hooks) live in router-core.ts, with their contract.

import type { Direction } from "../direction.ts";
import type { Layout, Rect } from "../../core/layout.ts";
import { getGameElement } from "../../core/viewport.ts";
import { attachKeyboard } from "./keyboard.ts";
import type { InputEvent } from "./pointer-map.ts";
import { createRouterCore } from "./router-core.ts";

export interface InputRouter {
  /** The queued events, oldest first; empties the queue. See pointer-map.ts for the contract. */
  drain(): InputEvent[];
  /** Call when a state starts: drops queued events and ignores whatever is down until it lifts. */
  beginEpoch(): void;
  /** Recomputes the pads' and the mute button's hit areas. Call it with every new layout. */
  setLayout(layout: Layout): void;
  /** The mute button's hit square in the current layout (mute-geometry.ts), or null. */
  readonly muteRect: Rect | null;
  /**
   * Calls `listener` synchronously inside the DOM event (pointerup or keydown) of every input that queues "advance",
   * right after it is queued: the place for `audio.unlock()` and, on Gate's begin tap, `startMusic()`. Never for a
   * pointerdown, a stale or cancelled pointer, a key repeat, or a mute tap. Returns the unsubscribe.
   */
  onActivate(listener: () => void): () => void;
  /**
   * Turns on the mute button's hit area and the M key: a tap on the button or the key calls `listener` (to toggle
   * mute) and gives no press, advance or activation. While no listener is registered both are ordinary input.
   * Returns the unsubscribe.
   */
  onMute(listener: () => void): () => void;
  /** Whether `dir` is held by any pointer or key, for the pad view. */
  isHeld(dir: Direction): boolean;
  /** Removes every listener. */
  destroy(): void;
}

/**
 * Starts routing input. `canvas` receives the pointer listeners; `frame` (#game by default) is the element whose
 * top-left is the origin of the layout's CSS px. Until `setLayout` is called there are no pads, so taps only advance.
 */
export const createInputRouter = (canvas: HTMLElement, frame: HTMLElement = getGameElement()): InputRouter => {
  const core = createRouterCore();
  const local = (event: PointerEvent) => {
    const box = frame.getBoundingClientRect();

    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onPointerDown = (event: PointerEvent) => {
    // A touch or pen contact and the primary mouse button are 0. Other mouse buttons are ignored.
    if (event.button !== 0) {
      return;
    }

    const { x, y } = local(event);

    core.pointerDown(event.pointerId, x, y);

    // Keeps a mouse pointer's up on the canvas when it leaves it; touch is captured implicitly.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone (InvalidStateError): its up or cancel follows.
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const { x, y } = local(event);

    core.pointerUp(event.pointerId, x, y);
  };

  const onPointerCancel = (event: PointerEvent) => core.pointerCancel(event.pointerId);

  // Also fires right after every pointerup, when the capture is released, with no buttons pressed. Only a loss while a
  // button or contact is still down cancels, so an engine that fires it before pointerup can't eat the tap's advance.
  const onLostPointerCapture = (event: PointerEvent) => {
    if (event.buttons !== 0) {
      core.pointerCancel(event.pointerId);
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      core.cancelAll();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // keydown, keyup and blur.
  const detachKeyboard = attachKeyboard(core.map, { onMuteKey: core.muteKey });

  return {
    drain: () => core.map.drain(),
    beginEpoch: () => core.map.beginEpoch(),
    setLayout: (layout) => core.setLayout(layout),
    get muteRect() {
      return core.muteRect;
    },
    onActivate: (listener) => core.onActivate(listener),
    onMute: (listener) => core.onMute(listener),
    isHeld: (dir) => core.isHeld(dir),
    destroy: () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      detachKeyboard();
    },
  };
};
