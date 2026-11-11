// Cues on a state's timeline: each plays its sound, strikes if it is lightning, and is reported through
// `GameDeps.onCue`. Pure TypeScript. Written by Claude Code.
import type { WorldSfxKey } from "../../core/audio/audio-engine.ts";
import type { TimerScope } from "../../core/clock.ts";
import type { Rng } from "../challenges/rng.ts";
import { isStrike } from "../lightning.ts";
import type { GameSession } from "./session.ts";
import { TITLE_AMBIENT, type Cue, type CueName } from "./timings.ts";
import type { GameDeps, GameStateId } from "./types.ts";

/** The sound of each cue (GameManager's `raioClip` and `krakenClip`). */
export const CUE_SFX: Readonly<Record<CueName, WorldSfxKey>> = {
  lightning: "thunderclap",
  "title-reveal": "thunderclap",
  kraken: "kraken",
};

/**
 * A state's cue player. Create it in `enter`: cue times (`CueEvent.at`) count from then. Its timers live on the state's
 * scope, so they die with the state (and wait while the clock is paused). A strike draws from the game's lightning
 * stream (`session.lightning`): a CueEvent has no payload, and the draws are game state, replayed by the seed.
 */
export const createCuePlayer = (
  deps: Pick<GameDeps, "audio" | "onCue" | "clock" | "scene">,
  session: Pick<GameSession, "lightning">,
  state: GameStateId,
) => {
  const { audio, onCue, clock, scene } = deps;
  const enteredAt = clock.now;

  const fire = (name: CueName) => {
    audio.playSfx(CUE_SFX[name]);

    if (isStrike(name)) {
      scene().strike(name, session.lightning);
    }

    onCue({ name, state, at: clock.now - enteredAt });
  };

  /** Calls `callback` at `ms` from the enter (at once if that has passed). */
  const at = (scope: TimerScope, ms: number, callback: () => void) =>
    scope.after(Math.max(0, ms - (clock.now - enteredAt)), callback);

  return {
    fire,
    at,
    /**
     * Fires `cues` (in time order) at their times, then calls `then`. One cue is pending at a time, each scheduled
     * when the one before fires, so a state's pending timer count doesn't drift with its cues: Title keeps one timer
     * pending, plus its exit timer while leaving (the replay leak test reads the count at any moment).
     */
    schedule: (scope: TimerScope, cues: readonly Cue[], then?: () => void) => {
      const next = (index: number) => {
        const cue = cues[index];

        if (cue === undefined) {
          then?.();
          return;
        }

        at(scope, cue.at, () => {
          fire(cue.name);
          next(index + 1);
        });
      };

      next(0);
    },
  };
};

export type CuePlayer = ReturnType<typeof createCuePlayer>;

/**
 * The delay from one ambient Title strike to the next (`TITLE_AMBIENT.next`), or from TITLE_AMBIENT.from to the first
 * (`TITLE_AMBIENT.first`), in ms: the original's timer counts from a start value drawn in `range` (whole seconds, max
 * exclusive) up to `interval`.
 */
export const ambientDelay = (rng: Rng, range: readonly [number, number]): number => {
  const [min, max] = range;

  return TITLE_AMBIENT.interval - (min + rng.nextInt(max - min)) * 1000;
};
