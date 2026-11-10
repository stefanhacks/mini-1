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

// Keys that never advance on their own: they start shortcuts or change other keys.
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Fn"]);

/** The KeyboardEvent fields the mapping reads. */
export type KeyInput = Pick<KeyboardEvent, "key" | "repeat" | "altKey" | "ctrlKey" | "metaKey">;

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
 * Many), shortcuts, and lone modifiers. Any other key advances, as in the original; an arrow also presses.
 */
export const readKeyDown = (event: KeyInput): KeyAction | null => {
  if (event.repeat || isShortcut(event)) {
    return null;
  }

  const dir = keyToDirection(event.key);
  const advance = !MODIFIER_KEYS.has(event.key);

  return dir === null && !advance ? null : { dir, advance };
};

/**
 * Feeds `window` keydown/keyup into `map`, and lets everything go on `blur` (04, correction 8). Arrow keydowns that
 * aren't shortcuts, repeats included, have their default (scrolling) prevented. Keyups are never filtered, so an arrow
 * lifted with a modifier held still releases. Returns a function that removes the listeners.
 */
export const attachKeyboard = (map: PointerMap, target: Window = window) => {
  const onKeyDown = (event: KeyboardEvent) => {
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
    }
  };

  const onBlur = () => map.cancelAll();

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", onBlur);
  };
};
