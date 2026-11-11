// The input router's decisions, without the DOM: which pointer goes to the mute button and which to the pads, and the
// two synchronous hooks (activation, mute). Pure TypeScript, so it runs under `node --test`; dom-router.ts only
// translates browser events into these calls. Coordinates are #game CSS px. Written by Claude Code.
//
// Contract:
// - The mute button is hit-tested FIRST, and only while a mute listener is registered. A pointer that goes down on it
//   belongs to it until it lifts: it never reaches the PointerMap, so it gives no press, no release, no advance and no
//   activation. Its pointerup toggles mute (calls every mute listener) if it lifts still on the button; sliding off
//   and lifting elsewhere, or a cancel, does nothing.
// - The M key (keyboard.ts `isMuteKey`) toggles mute the same way while a mute listener is registered, and then
//   neither presses nor advances. Without a listener it is an ordinary key.
// - Activation listeners run synchronously, inside the DOM event, exactly when an "advance" is queued: a pointerup that
//   ends a live tap (not a stale or cancelled one, not a mute tap) and a non-repeat keydown that advances. Never on
//   pointerdown, so a listener may call `AudioContext.resume()`: touch only counts as a gesture on the up. The advance
//   is queued first, then the listeners run.
// - iOS fallback: an activation from a touch pointerup sets a flag, and the `touchend` that follows (dom-router.ts)
//   clears it and runs the activation listeners once more, with no second "advance". Some WebKit versions only accept
//   `touchend` as the gesture that may resume audio. Listeners must therefore be idempotent (Gate.activate and the
//   audio engine's unlock/startMusic are). Any pointerdown clears a flag whose touchend never came.
// - A listener that throws is reported (reportError) and the others still
//   run; the event stays queued.

import type { Layout, Rect } from "../../core/layout.ts";
import type { Direction } from "../direction.ts";
import { hitsMuteButton, muteButtonRect } from "./mute-geometry.ts";
import { computePads, hitTest, type Pad } from "./pad-geometry.ts";
import { PointerMap } from "./pointer-map.ts";

export type Listener = () => void;

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
  const muteListeners = new Set<Listener>();
  let activated = false;
  let touchActivation = false;
  const map = new PointerMap(() => {
    activated = true;
    callAll(activateListeners);
  });
  const mutePointers = new Set<number>();
  let pads: readonly Pad[] = [];
  let muteRect: Rect | null = null;

  const muteActive = () => muteListeners.size > 0 && muteRect !== null;

  return {
    map,
    setLayout: (layout: Layout) => {
      pads = computePads(layout);
      muteRect = muteButtonRect(layout);
    },
    /** The mute button's hit square in the current layout, or null. */
    get muteRect() {
      return muteRect;
    },
    pointerDown: (id: number, x: number, y: number) => {
      touchActivation = false;
      // A down for an id already tracked means its up was lost.
      mutePointers.delete(id);

      if (muteActive() && hitsMuteButton(muteRect, x, y)) {
        map.pointerCancel(id);
        mutePointers.add(id);
        return;
      }

      map.pointerDown(id, hitTest(pads, x, y)?.dir ?? null);
    },
    /** `touch`: a touch contact (`pointerType === "touch"`), so its `touchend` repeats the activation. */
    pointerUp: (id: number, x: number, y: number, touch = false) => {
      if (mutePointers.delete(id)) {
        if (muteActive() && hitsMuteButton(muteRect, x, y)) {
          callAll(muteListeners);
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
      if (!mutePointers.delete(id)) {
        map.pointerCancel(id);
      }
    },
    /** The M key: true if it toggled mute (then the key does nothing else). */
    muteKey: () => {
      if (muteListeners.size === 0) {
        return false;
      }

      callAll(muteListeners);

      return true;
    },
    cancelAll: () => {
      mutePointers.clear();
      map.cancelAll();
    },
    isHeld: (dir: Direction) => map.isHeld(dir),
    onActivate: (listener: Listener) => subscribe(activateListeners, listener),
    onMute: (listener: Listener) => subscribe(muteListeners, listener),
  };
};

export type RouterCore = ReturnType<typeof createRouterCore>;
