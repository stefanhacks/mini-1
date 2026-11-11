// Small steps the states share. Pure TypeScript. Written by Claude Code.
import type { InputSource, PadControl } from "./types.ts";

/** Drains the input queue (every state does on every update) and says whether it held an "advance". */
export const drainAdvanced = (input: InputSource) => input.drain().some((event) => event.kind === "advance");

/** Hides the pad and its hint (Title, Story, Ending). */
export const hidePad = (pad: PadControl) => {
  pad.setVisible(false);
  pad.setHint(null);
};
