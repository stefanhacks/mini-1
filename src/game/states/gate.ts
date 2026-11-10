import type { GameDeps, GameState } from "./types.ts";

/**
 * Start gate, replacing the original 5 s load screen. Later (M3): load progress, the flashing-lights warning and
 * "Tap to begin", whose tap also unlocks audio. For now it moves to Title on the first frame after the scene is built.
 *
 * Loading only sets a flag; the request happens in `update`, so every transition runs on a frame (inside main's
 * ticker guard) and waits while the clock is paused. The flag outlives Gate, so re-entering it after the load moves
 * on at once. Input that arrives meanwhile is drained and dropped.
 */
export const createGate = ({ loaded, input }: Pick<GameDeps, "loaded" | "input">): GameState => {
  let ready = false;

  void loaded.then(() => {
    ready = true;
  }, () => undefined);

  return {
    enter: () => {
      input.beginEpoch();
    },
    update: (_deltaMS, machine) => {
      input.drain();

      if (ready) {
        machine.request("title");
      }
    },
  };
};
