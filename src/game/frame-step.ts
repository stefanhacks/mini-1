// One game frame, with the resume guard. Pure TypeScript.
//
// The machine ticks the clock before the state drains input (state-machine.ts), so the first frame after a hidden tab
// would advance game time before the state sees the "cancel" the router queued when the tab hid: a Hold close to its
// end, let go while hidden, would complete on that tick. Pixi caps a frame's delta at 100 ms (Ticker.minFPS 10), which
// is plenty for that, and more under `?timescale`. So the frame after the page becomes visible again runs the machine
// with no time at all: the state drains the cancel first, and the hidden time never counts. Frames after it are
// normal. Calling `router.beginEpoch()` on resume instead would drop the queued cancel unread, and leave the Hold
// running with nothing held.

export interface FrameStepper {
  /** Runs one frame: `machine.update(deltaMS)`, or `machine.update(0)` for the first frame after `resume`. */
  step(deltaMS: number): void;
  /** Call when the page becomes visible again. */
  resume(): void;
}

export const createFrameStepper = (machine: { update(deltaMS: number): void }): FrameStepper => {
  let resumed = false;

  return {
    step: (deltaMS) => {
      if (resumed) {
        resumed = false;
        machine.update(0);
        return;
      }

      machine.update(deltaMS);
    },
    resume: () => {
      resumed = true;
    },
  };
};
