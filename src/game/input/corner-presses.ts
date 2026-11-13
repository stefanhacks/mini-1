// The corner buttons' presses, for router-core.ts: their hit squares in the current layout, and which pointer went
// down on which button. A pointer that goes down on one belongs to it until it lifts or is cancelled. Pure TypeScript.
// Written by Claude Code.
import type { Layout, Rect } from "../../core/layout.ts";
import { CORNER_BUTTONS, cornerButtonRect, hitsCornerButton, type CornerButton } from "./corner-geometry.ts";

/**
 * `enabled` says whether a button takes taps now (it also needs a square in the layout); `onTap` runs when a pointer
 * lifts still on the button it went down on.
 */
export const createCornerPresses = (
  enabled: (button: CornerButton) => boolean,
  onTap: (button: CornerButton) => void,
) => {
  const rects: Record<CornerButton, Rect | null> = { mute: null, pause: null, flashes: null };
  // Pointers that went down on a corner button, and which.
  const pressed = new Map<number, CornerButton>();

  // The stack's squares never overlap, so at most one is hit.
  const buttonAt = (x: number, y: number) =>
    CORNER_BUTTONS.find((button) => enabled(button) && rects[button] !== null && hitsCornerButton(rects[button], x, y));

  return {
    rects: rects as Readonly<Record<CornerButton, Rect | null>>,
    setLayout: (layout: Layout) => {
      for (const button of CORNER_BUTTONS) {
        rects[button] = cornerButtonRect(layout, button);
      }
    },
    /** A pointerdown: true if it went down on a button, which now holds it. */
    down: (id: number, x: number, y: number) => {
      // A down for an id already tracked means its up was lost.
      pressed.delete(id);

      const button = buttonAt(x, y);

      if (button === undefined) {
        return false;
      }

      pressed.set(id, button);

      return true;
    },
    /** A pointerup: true if a button held it, whose tap runs if it lifts still on that button. */
    up: (id: number, x: number, y: number) => {
      const button = pressed.get(id);

      if (button === undefined) {
        return false;
      }

      pressed.delete(id);

      // A button turned off mid-press (the Escape key paused while a finger was on the pause button) swallows the
      // press: no tap, and the pointer never reached the pads, so no advance either. The next tap resumes.
      if (buttonAt(x, y) === button) {
        onTap(button);
      }

      return true;
    },
    /** A pointercancel: true if a button held it. */
    cancel: (id: number) => pressed.delete(id),
    clear: () => pressed.clear(),
  };
};
