// The input router's DOM glue: canvas pointer events, the keyboard, and page visibility, fed into one PointerMap.
// It uses DOM events, not Pixi's federated events: Pixi never delivers pointercancel (04, correction 1), and the
// playfield is a render texture outside the hit-test tree. DOM handlers only queue events; the active state drains them
// in `update`, so input runs under the state machine's error guard and in game time.
// The decisions (corner buttons first, pads, the activation, mute, pause, reduce-flashes and endless hooks) live in
// router-core.ts, with their contract.

import type { Direction } from "../direction.ts";
import type { Layout, Rect } from "../../core/layout.ts";
import { getGameElement } from "../../core/viewport.ts";
import { attachKeyboard } from "./keyboard.ts";
import type { InputEvent } from "./pointer-map.ts";
import { createRouterCore, type PauseInput } from "./router-core.ts";

export interface InputRouter {
  /** The queued events, oldest first; empties the queue. See pointer-map.ts for the contract. */
  drain(): InputEvent[];
  /** Call when a state starts: drops queued events and ignores whatever is down until it lifts. */
  beginEpoch(): void;
  /** Recomputes the pads' and the corner buttons' hit areas. Call it with every new layout. */
  setLayout(layout: Layout): void;
  /** The mute button's hit square in the current layout (corner-geometry.ts), or null. */
  readonly muteRect: Rect | null;
  /** The pause button's hit square in the current layout (corner-geometry.ts), or null. */
  readonly pauseRect: Rect | null;
  /** The "reduce flashes" toggle's hit square in the current layout (corner-geometry.ts), or null. */
  readonly flashesRect: Rect | null;
  /**
   * Calls `listener` synchronously inside the DOM event (pointerup or keydown) of every input that queues "advance",
   * right after it is queued: the place for `audio.unlock()` and, on Gate's begin tap, `startMusic()`. Never for a
   * pointerdown, a stale or cancelled pointer, a key repeat, or a mute tap. A touch tap calls it a second time from the
   * `touchend` that follows (iOS fallback), so listeners must be idempotent. Returns the unsubscribe.
   */
  onActivate(listener: () => void): () => void;
  /**
   * Turns on the mute button's hit area and the M key: a tap on the button or the key calls `listener` (to toggle
   * mute) and gives no press, advance or activation. While no listener is registered both are ordinary input.
   * Returns the unsubscribe.
   */
  onMute(listener: () => void): () => void;
  /**
   * The pause button's tap and the pause keys (Escape, P) call `listener` and give no press, advance or activation,
   * as `setPauseInput` allows (router-core.ts has the contract). Returns the unsubscribe.
   */
  onPause(listener: () => void): () => void;
  /**
   * Turns on the "reduce flashes" toggle's hit area: a tap on it calls `listener` and gives no press, advance or
   * activation, paused or not. While no listener is registered it is ordinary input. Returns the unsubscribe.
   */
  onFlashes(listener: () => void): () => void;
  /** The endless-mode icon's hit square in the current layout (corner-geometry.ts), or null. */
  readonly endlessRect: Rect | null;
  /**
   * The endless-mode icon's tap and the E key, while the endless input is on: they queue an "endless" event, then call
   * `listener`. Returns the unsubscribe.
   */
  onEndless(listener: () => void): () => void;
  /** Whether the endless-mode icon and the E key take input from now on (router-core.ts has the contract). */
  setEndlessInput(on: boolean): void;
  /** What the pause button and keys do from now on: "off", "ready" or "paused" (see router-core.ts). */
  setPauseInput(input: PauseInput): void;
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

    core.pointerUp(event.pointerId, x, y, event.pointerType === "touch");
  };

  // iOS fallback: some WebKit versions only count `touchend` as the gesture that may resume audio, not the pointerup
  // before it. See router-core.ts `touchEnd`. Passive: it never blocks scrolling or calls preventDefault.
  const onTouchEnd = () => core.touchEnd();

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

  // One signal removes them all (`destroy`).
  const listeners = new AbortController();
  const { signal } = listeners;

  canvas.addEventListener("pointerdown", onPointerDown, { signal });
  canvas.addEventListener("pointerup", onPointerUp, { signal });
  canvas.addEventListener("pointercancel", onPointerCancel, { signal });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true, signal });
  canvas.addEventListener("lostpointercapture", onLostPointerCapture, { signal });
  // Added before main's (app/page-lifecycle.ts), so held input is cancelled first when the page hides.
  document.addEventListener("visibilitychange", onVisibilityChange, { signal });

  // keydown, keyup and blur.
  const detachKeyboard = attachKeyboard(core.map, {
    onMuteKey: core.muteKey,
    onPauseKey: core.pauseKey,
    onEndlessKey: core.endlessKey,
  });

  return {
    drain: () => core.map.drain(),
    beginEpoch: () => core.map.beginEpoch(),
    setLayout: (layout) => core.setLayout(layout),
    get muteRect() {
      return core.muteRect;
    },
    onActivate: (listener) => core.onActivate(listener),
    get pauseRect() {
      return core.pauseRect;
    },
    get flashesRect() {
      return core.flashesRect;
    },
    onMute: (listener) => core.onMute(listener),
    onPause: (listener) => core.onPause(listener),
    onFlashes: (listener) => core.onFlashes(listener),
    get endlessRect() {
      return core.endlessRect;
    },
    onEndless: (listener) => core.onEndless(listener),
    setEndlessInput: (on) => core.setEndlessInput(on),
    setPauseInput: (input) => core.setPauseInput(input),
    isHeld: (dir) => core.isHeld(dir),
    destroy: () => {
      listeners.abort();
      detachKeyboard();
    },
  };
};
