// The input router's decisions, without the DOM: which pointer goes to a corner button (mute, pause, reduce flashes)
// and which to the pads, and the synchronous hooks (activation, mute, pause, reduce flashes). Pure TypeScript, so it
// runs under `node --test`; dom-router.ts only translates browser events into these calls. Coordinates are #game CSS
// px. Written by Claude Code.
//
// Contract:
// - The corner buttons are hit-tested FIRST, before the pads: mute while a mute listener is registered, pause while a
//   pause listener is registered and the pause input is "ready", and the "reduce flashes" toggle while its listener is
//   registered (paused or not: like mute, a tap on it only toggles). A pointer that goes down on one belongs to it
//   until it lifts: it never reaches the PointerMap, so it gives no press, no release, no advance and no activation.
//   Its pointerup calls that button's listeners if it lifts still on the button; sliding off and lifting elsewhere,
//   or a cancel, does nothing.
// - The pause input (`setPauseInput`, driven by pause.ts): "off" (Gate, whose own tap begins the game) makes the pause
//   button's square and the pause keys ordinary input; "ready" turns both on; "paused" leaves only the keys on, so a
//   tap on the button's square is an ordinary tap, which resumes through the activation hook (with its touchend
//   fallback) like a tap anywhere else.
// - The M key (keyboard.ts `isMuteKey`) toggles mute the same way while a mute listener is registered, and then
//   neither presses nor advances. Without a listener it is an ordinary key. The pause keys (`isPauseKey`: Escape, P)
//   call the pause listeners while one is registered and the pause input isn't "off", and then do nothing else.
// - Activation listeners run synchronously, inside the DOM event, exactly when an "advance" is queued: a pointerup that
//   ends a live tap (not a stale or cancelled one, not a corner button tap) and a non-repeat keydown that advances.
//   Never on pointerdown, so a listener may call `AudioContext.resume()`: touch only counts as a gesture on the up.
//   The advance is queued first, then the listeners run.
// - iOS fallback: an activation from a touch pointerup sets a flag, and the `touchend` that follows (dom-router.ts)
//   clears it and runs the activation listeners once more, with no second "advance". Some WebKit versions only accept
//   `touchend` as the gesture that may resume audio. Listeners must therefore be idempotent (Gate.activate and the
//   audio engine's unlock/startMusic are). Any pointerdown clears a flag whose touchend never came.
// - A listener that throws is reported (reportError) and the others still
//   run; the event stays queued.

import type { Layout, Rect } from "../../core/layout.ts";
import type { Direction } from "../direction.ts";
import { CORNER_BUTTONS, cornerButtonRect, hitsCornerButton, type CornerButton } from "./corner-geometry.ts";
import { computePads, hitTest, type Pad } from "./pad-geometry.ts";
import { PointerMap } from "./pointer-map.ts";

export type Listener = () => void;

/** What the pause button and keys do now (see the contract above). */
export type PauseInput = "off" | "ready" | "paused";

const reportListenerError = (error: unknown) => {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
};

const callAll = (listeners: ReadonlySet<Listener>) => {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      reportListenerError(error);
    }
  }
};

const subscribe = (listeners: Set<Listener>, listener: Listener) => {
  // A wrapper, so the same function subscribed twice runs twice and each unsubscribe removes one.
  const entry: Listener = () => listener();

  listeners.add(entry);

  return () => {
    listeners.delete(entry);
  };
};

export const createRouterCore = () => {
  const activateListeners = new Set<Listener>();
  const listeners: Record<CornerButton, Set<Listener>> = { mute: new Set(), pause: new Set(), flashes: new Set() };
  let activated = false;
  let touchActivation = false;
  const map = new PointerMap(() => {
    activated = true;
    callAll(activateListeners);
  });
  // Pointers that went down on a corner button, and which.
  const buttonPointers = new Map<number, CornerButton>();
  let pads: readonly Pad[] = [];
  const rects: Record<CornerButton, Rect | null> = { mute: null, pause: null, flashes: null };
  let pauseInput: PauseInput = "off";

  const active = (button: CornerButton) => listeners[button].size > 0 && rects[button] !== null
    && (button !== "pause" || pauseInput === "ready");

  // The stack's squares never overlap, so at most one is hit.
  const buttonAt = (x: number, y: number) =>
    CORNER_BUTTONS.find((button) => active(button) && hitsCornerButton(rects[button], x, y));

  return {
    map,
    setLayout: (layout: Layout) => {
      pads = computePads(layout);

      for (const button of CORNER_BUTTONS) {
        rects[button] = cornerButtonRect(layout, button);
      }
    },
    /** The mute button's hit square in the current layout, or null. */
    get muteRect() {
      return rects.mute;
    },
    /** The pause button's hit square in the current layout, or null. */
    get pauseRect() {
      return rects.pause;
    },
    /** The "reduce flashes" toggle's hit square in the current layout, or null. */
    get flashesRect() {
      return rects.flashes;
    },
    /** What the pause button and keys do from now on (pause.ts drives it). */
    setPauseInput: (input: PauseInput) => {
      pauseInput = input;
    },
    pointerDown: (id: number, x: number, y: number) => {
      touchActivation = false;
      // A down for an id already tracked means its up was lost.
      buttonPointers.delete(id);

      const button = buttonAt(x, y);

      if (button !== undefined) {
        map.pointerCancel(id);
        buttonPointers.set(id, button);
        return;
      }

      map.pointerDown(id, hitTest(pads, x, y)?.dir ?? null);
    },
    /** `touch`: a touch contact (`pointerType === "touch"`), so its `touchend` repeats the activation. */
    pointerUp: (id: number, x: number, y: number, touch = false) => {
      const button = buttonPointers.get(id);

      if (button !== undefined) {
        buttonPointers.delete(id);

        if (buttonAt(x, y) === button) {
          callAll(listeners[button]);
        }

        return;
      }

      activated = false;
      map.pointerUp(id);
      touchActivation = touch && activated;
    },
    /** A `touchend` on the canvas: repeats the activation of the touch pointerup just before it, once. */
    touchEnd: () => {
      if (touchActivation) {
        touchActivation = false;
        callAll(activateListeners);
      }
    },
    pointerCancel: (id: number) => {
      if (!buttonPointers.delete(id)) {
        map.pointerCancel(id);
      }
    },
    /** The M key: true if it toggled mute (then the key does nothing else). */
    muteKey: () => {
      if (listeners.mute.size === 0) {
        return false;
      }

      callAll(listeners.mute);

      return true;
    },
    /** A pause key (Escape, P): true if it called the pause listeners (then the key does nothing else). */
    pauseKey: () => {
      if (listeners.pause.size === 0 || pauseInput === "off") {
        return false;
      }

      callAll(listeners.pause);

      return true;
    },
    cancelAll: () => {
      buttonPointers.clear();
      map.cancelAll();
    },
    isHeld: (dir: Direction) => map.isHeld(dir),
    onActivate: (listener: Listener) => subscribe(activateListeners, listener),
    onMute: (listener: Listener) => subscribe(listeners.mute, listener),
    /** The pause button's tap and the pause keys call `listener` (to pause or resume). Returns the unsubscribe. */
    onPause: (listener: Listener) => subscribe(listeners.pause, listener),
    /** The "reduce flashes" toggle's tap calls `listener`. Returns the unsubscribe. */
    onFlashes: (listener: Listener) => subscribe(listeners.flashes, listener),
  };
};

export type RouterCore = ReturnType<typeof createRouterCore>;
