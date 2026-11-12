// The "reduce flashes" setting (m5-plan owner decisions 7 and 9): on, a strike's flash is capped and the screen tone is
// off (lightning.ts `flashRule`). Persisted like mute. Pure TypeScript with no Pixi import, so it runs under
// `node --test`. Written by Claude Code.

export const REDUCE_FLASHES_STORAGE_KEY = "mini-one.flashes.reduced";

/** The stored flag. Anything but "1" (missing, corrupt, from another version) is the default: off. */
export const parseReduceFlashes = (raw: string | null): boolean => raw === "1";

export const serializeReduceFlashes = (on: boolean): string => (on ? "1" : "0");

/** The part of `Storage` the setting uses. */
export type FlashesStorage = Pick<Storage, "getItem" | "setItem">;

export interface ReduceFlashes {
  readonly on: boolean;
  /** Flips the setting and stores it; returns the new value. */
  readonly toggle: () => boolean;
}

/** `storage` is read once, now, and written on each toggle. A throw (storage blocked) keeps the value it had. */
export const createReduceFlashes = (storage: () => FlashesStorage = () => window.localStorage): ReduceFlashes => {
  let on = false;

  try {
    on = parseReduceFlashes(storage().getItem(REDUCE_FLASHES_STORAGE_KEY));
  } catch {
    // Storage blocked (privacy mode, sandboxed iframe): the default.
  }

  return {
    get on() {
      return on;
    },
    toggle: () => {
      on = !on;

      try {
        storage().setItem(REDUCE_FLASHES_STORAGE_KEY, serializeReduceFlashes(on));
      } catch {
        // Storage blocked or full: the choice lasts for this session only.
      }

      return on;
    },
  };
};
