// The keyboard fallback: arrow keys feed the same direction state as the pads, as one more holder. The mapping is pure;
// `attachKeyboard` is the only DOM glue.

import type { Direction } from "../direction.ts";
import type { PointerMap } from "./pointer-map.ts";

const ARROW_KEYS: ReadonlyMap<string, Direction> = new Map([
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
]);

// Keys that never advance: modifiers, keys with another job (Escape is a pause key, Tab moves focus, F1–F12
// are browser keys), and the values of keys still being composed by an input method or a dead key.
const NON_ADVANCE_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "CapsLock",
  "Fn",
  "Escape",
  "Tab",
  "Dead",
  "Process",
  "Unidentified",
]);

const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

/** The KeyboardEvent fields the mapping reads. */
export type KeyInput = Pick<KeyboardEvent, "key" | "repeat" | "isComposing" | "altKey" | "ctrlKey" | "metaKey">;

/** What a keydown does: the direction it presses (or null) and whether it advances. */
export interface KeyAction {
  readonly dir: Direction | null;
  readonly advance: boolean;
}

/** The direction of an arrow key's `KeyboardEvent.key`, or null. */
export const keyToDirection = (key: string) => ARROW_KEYS.get(key) ?? null;

// Alt, Ctrl and Meta combinations are browser or OS shortcuts (Alt+← is "back"): leave them to the browser.
const isShortcut = (event: KeyInput) => event.altKey || event.ctrlKey || event.metaKey;

/**
 * What a keydown does, or null when it does nothing: auto-repeats (04, correction 8: otherwise holding a key passes
 * Many), shortcuts, keys typed into an input method's composition, and the NON_ADVANCE_KEYS. Any other key advances,
 * as in the original; an arrow also presses.
 */
export const readKeyDown = (event: KeyInput): KeyAction | null => {
  if (event.repeat || event.isComposing || isShortcut(event)) {
    return null;
  }

  const dir = keyToDirection(event.key);
  const advance = !NON_ADVANCE_KEYS.has(event.key) && !FUNCTION_KEY.test(event.key);

  return dir === null && !advance ? null : { dir, advance };
};

/**
 * Whether a keydown is the mute shortcut: M (either case), not a repeat, not composing, not a shortcut. When the router
 * has a mute handler, it toggles mute and neither presses nor advances.
 */
export const isMuteKey = (event: KeyInput) =>
  !event.repeat && !event.isComposing && !isShortcut(event) && (event.key === "m" || event.key === "M");

/**
 * Whether a keydown is a pause shortcut: Escape or P (either case), with the same filters as `isMuteKey`. When the
 * router takes it (pause input not "off"), it pauses or resumes and neither presses nor advances.
 */
export const isPauseKey = (event: KeyInput) =>
  !event.repeat && !event.isComposing && !isShortcut(event)
  && (event.key === "Escape" || event.key === "p" || event.key === "P");

export interface KeyboardOptions {
  readonly target?: Window;
  /** Called on the mute key; returns true if it handled it (then the key does nothing else). */
  readonly onMuteKey?: () => boolean;
  /** Called on a pause key; returns true if it handled it (then the key does nothing else). */
  readonly onPauseKey?: () => boolean;
}

/**
 * Feeds `window` keydown/keyup into `map`, and lets everything go on `blur` (04, correction 8). Arrow keydowns that
 * aren't shortcuts, repeats included, have their default (scrolling) prevented. Keyups are never filtered, so an arrow
 * lifted with a modifier held still releases. The Meta keyup releases every arrow: macOS sends no keyup for keys
 * released while Meta is held. Returns a function that removes the listeners.
 */
export const attachKeyboard = (map: PointerMap, { target = window, onMuteKey, onPauseKey }: KeyboardOptions = {}) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isMuteKey(event) && onMuteKey?.() === true) {
      return;
    }

    if (isPauseKey(event) && onPauseKey?.() === true) {
      return;
    }

    if (keyToDirection(event.key) !== null && !isShortcut(event)) {
      event.preventDefault();
    }

    const action = readKeyDown(event);

    if (action !== null) {
      map.keyDown(action.dir, action.advance);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const dir = keyToDirection(event.key);

    if (dir !== null) {
      map.keyUp(dir);
    } else if (event.key === "Meta") {
      map.releaseAllKeys();
    }
  };

  const onBlur = () => map.cancelAll();

  const listeners = new AbortController();
  const { signal } = listeners;

  target.addEventListener("keydown", onKeyDown, { signal });
  target.addEventListener("keyup", onKeyUp, { signal });
  target.addEventListener("blur", onBlur, { signal });

  return () => listeners.abort();
};
