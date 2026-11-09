// The game flow as stub states, mirroring the original: Gate → Title → Story → Transition → Round → Ending.
// Pure TypeScript with no Pixi import. Each state gets its own file once it has real content.
import type { State } from "../core/state-machine.ts";

export type GameStateId = "gate" | "title" | "story" | "transition" | "round" | "ending";

export type GameState = State<GameStateId>;

export interface GameStateDeps {
  /** Settles when the assets Gate waits for are loaded. A rejection is reported by whoever loads them, not here. */
  readonly loaded: Promise<unknown>;
}

/**
 * Start gate, replacing the original 5 s load screen. Later (M3): load progress, the flashing-lights warning and
 * "Tap to begin", whose tap also unlocks audio. For now it moves to Title on the first frame after the assets load.
 *
 * Loading only sets a flag; the request happens in `update`, so every transition runs on a frame (inside main's
 * ticker guard) and waits while the clock is paused. The flag outlives Gate, so re-entering it after the load moves
 * on at once.
 */
const gate = ({ loaded }: GameStateDeps): GameState => {
  let ready = false;

  void loaded.then(() => {
    ready = true;
  }, () => undefined);

  return {
    update: (_deltaMS, machine) => {
      if (ready) {
        machine.request("title");
      }
    },
  };
};

/** Title: timed lightning, the logo revealed at the flash peak, then "Tap to begin" and ambient thunder (M2/M4). */
const title: GameState = {};

/** Story part N: a preamble on part 0, then typed lines advanced by tap (M2). */
const story: GameState = {};

/** Transition: the `Troca` timeline, a thunder strike at 0.167 s and the round at 0.5 s (M2/M4). */
const transition: GameState = {};

/** Gameplay round: the round's challenges, then the background fade and more bubbles before the next part (M2). */
const round: GameState = {};

/** Ending: the broken ship, the kraken, fade to black, the empty sea, then the logo and credits. Terminal (M2/M4). */
const ending: GameState = {};

export const createGameStates = (deps: GameStateDeps): Record<GameStateId, GameState> => ({
  gate: gate(deps),
  title,
  story,
  transition,
  round,
  ending,
});
