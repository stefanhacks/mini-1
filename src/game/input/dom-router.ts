// The input router's DOM glue: canvas pointer events, the keyboard, and page visibility, fed into one PointerMap.
// It uses DOM events, not Pixi's federated events: Pixi never delivers pointercancel (04, correction 1), and the
// playfield is a render texture outside the hit-test tree. DOM handlers only queue events; the active state drains them
// in `update`, so input runs under the state machine's error guard and in game time.

import type { Direction } from "../direction.ts";
import type { Layout } from "../../core/layout.ts";
import { getGameElement } from "../../core/viewport.ts";
import { attachKeyboard } from "./keyboard.ts";
import { computePads, hitTest, type Pad } from "./pad-geometry.ts";
import { type InputEvent, PointerMap } from "./pointer-map.ts";

export interface InputRouter {
  /** The queued events, oldest first; empties the queue. See pointer-map.ts for the contract. */
  drain(): InputEvent[];
  /** Call when a state starts: drops queued events and ignores whatever is down until it lifts. */
  beginEpoch(): void;
  /** Recomputes the pads' hit areas. Call it with every new layout. */
  setLayout(layout: Layout): void;
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
  const map = new PointerMap();
  let pads: readonly Pad[] = [];

  const onPointerDown = (event: PointerEvent) => {
    // A touch or pen contact and the primary mouse button are 0. Other mouse buttons are ignored.
    if (event.button !== 0) {
      return;
    }

    const box = frame.getBoundingClientRect();
    const hit = hitTest(pads, event.clientX - box.left, event.clientY - box.top);

    map.pointerDown(event.pointerId, hit?.dir ?? null);

    // Keeps a mouse pointer's up on the canvas when it leaves it; touch is captured implicitly.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone (InvalidStateError): its up or cancel follows.
    }
  };

  const onPointerUp = (event: PointerEvent) => map.pointerUp(event.pointerId);

  // Also fires right after every pointerup, when the capture is released; the pointer is already forgotten by then.
  const onPointerCancel = (event: PointerEvent) => map.pointerCancel(event.pointerId);

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      map.cancelAll();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("lostpointercapture", onPointerCancel);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // keydown, keyup and blur.
  const detachKeyboard = attachKeyboard(map);

  return {
    drain: () => map.drain(),
    beginEpoch: () => map.beginEpoch(),
    setLayout: (layout) => {
      pads = computePads(layout);
    },
    isHeld: (dir) => map.isHeld(dir),
    destroy: () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      detachKeyboard();
    },
  };
};
