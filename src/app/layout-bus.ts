// The current layout and whatever follows it besides the display and the debug overlay (the pads, the mute button,
// the gate's view, the scene...). Pure TypeScript. Written by Claude Code.
import type { Layout } from "../core/layout.ts";

export type LayoutListener = (layout: Layout) => void;

export interface LayoutBus {
  /** The layout published last (the initial one until the first resize). */
  readonly current: Layout;
  /** How many listeners are subscribed, for `debug.counts` (the replay leak test). */
  readonly listenerCount: number;
  /** Calls `listener` with every new layout, in subscription order. Returns the unsubscribe (soft restart). */
  readonly onLayout: (listener: LayoutListener) => () => void;
  /** `onLayout`, then calls `listener` with the current layout at once. Returns the unsubscribe. */
  readonly follow: (listener: LayoutListener) => () => void;
  /** Makes `next` current and calls every listener with it. */
  readonly publish: (next: Layout) => void;
}

export const createLayoutBus = (initial: Layout): LayoutBus => {
  let current = initial;
  const listeners = new Set<LayoutListener>();

  const onLayout = (listener: LayoutListener) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  return {
    get current() {
      return current;
    },
    get listenerCount() {
      return listeners.size;
    },
    onLayout,
    follow: (listener) => {
      const unsubscribe = onLayout(listener);

      listener(current);

      return unsubscribe;
    },
    publish: (next) => {
      current = next;

      for (const listener of listeners) {
        listener(next);
      }
    },
  };
};
