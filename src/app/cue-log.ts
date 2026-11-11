// The last cues fired, for `window.debug.cues` (e2e checks their times). Pure TypeScript. Written by Claude Code.
import type { CueLogEntry } from "../debug-api.ts";
import type { CueEvent } from "../game/states/types.ts";

/** How many cues the log keeps (the DebugApi documents it). */
export const CUE_LOG_SIZE = 64;

export interface CueLog {
  /** `GameDeps.onCue`: logs `event` with the game clock's time. M4 hangs the visuals next to it. */
  readonly onCue: (event: CueEvent) => void;
  /** Copies of the logged cues, oldest first. */
  readonly entries: () => CueLogEntry[];
}

/** `now` is the game clock's time (ms). */
export const createCueLog = (now: () => number, size = CUE_LOG_SIZE): CueLog => {
  const log: CueLogEntry[] = [];

  return {
    onCue: (event) => {
      log.push({ ...event, time: now() });

      if (log.length > size) {
        log.shift();
      }
    },
    entries: () => log.map((entry) => ({ ...entry })),
  };
};
