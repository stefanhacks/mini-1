// `window.debug`: what the console, the debug overlay and the e2e tests read (debug-api.ts has the shape).
// Written by Claude Code.
import type { Application } from "pixi.js";
import type { ClipPlayer } from "../core/anim/player.ts";
import type { AudioEngine } from "../core/audio/audio-engine.ts";
import type { GameClock } from "../core/clock.ts";
import type { PlayfieldDisplay } from "../core/display.ts";
import type { Layers } from "../core/layers.ts";
import type { StateMachine } from "../core/state-machine.ts";
import type { DebugApi } from "../debug-api.ts";
import type { AudioLifecycle } from "../game/audio-lifecycle.ts";
import type { InputRouter } from "../game/input/dom-router.ts";
import type { Scene } from "../game/scene.ts";
import { snapshotSession } from "../game/states/session.ts";
import type { Game, GameStateId } from "../game/states/index.ts";
import type { CueLog } from "./cue-log.ts";
import type { ErrorSink } from "./halting-guard.ts";
import type { LayoutBus } from "./layout-bus.ts";
import type { Timescale } from "./launch-options.ts";

export interface DebugWiring {
  readonly app: Application;
  readonly clock: GameClock;
  readonly machine: StateMachine<GameStateId>;
  readonly layers: Layers;
  readonly display: PlayfieldDisplay;
  readonly layouts: LayoutBus;
  readonly router: InputRouter;
  readonly audio: AudioEngine;
  readonly cueLog: CueLog;
  readonly lifecycle: AudioLifecycle;
  readonly game: Game;
  readonly timescale: Timescale;
  readonly loading: { readonly scene: Scene | null };
  readonly errors: ErrorSink;
  readonly clips: Pick<ClipPlayer, "active">;
}

/**
 * The objects are handed over as they are, so e2e can replace their methods (`debug.audio.resume`,
 * `debug.display.render`...). `scene` and `error` are getters: nothing writes into `window.debug`.
 */
export const createDebugApi = (wiring: DebugWiring): DebugApi => {
  const {
    app, clock, machine, layers, display, layouts, router, audio, cueLog, lifecycle, game, timescale, loading, errors,
    clips,
  } = wiring;

  return {
    app,
    clock,
    machine,
    layers,
    display,
    onLayout: layouts.onLayout,
    router,
    audio,
    get cues() {
      return cueLog.entries();
    },
    get continuePromptShown() {
      return lifecycle.prompting;
    },
    get gate() {
      return { phase: game.gate.phase, progress: game.gate.progress };
    },
    get layout() {
      return layouts.current;
    },
    /** The game as plain data: state, seed, part, phase, current challenge and story page. */
    get game() {
      return { state: machine.current, ...snapshotSession(game.session) };
    },
    /** Listener counts, for the replay leak test. */
    get counts() {
      return {
        pendingTimers: clock.pendingTimers,
        layoutListeners: layouts.listenerCount,
        tickerListeners: app.ticker.count,
      };
    },
    /** The animation clips playing. */
    get anim() {
      return { active: clips.active };
    },
    get timescale() {
      return timescale.value;
    },
    /** Changes the time scale; only with `?debug`. */
    setTimescale: (value: number) => timescale.set(value),
    /** Set once the scene is built. */
    get scene() {
      return loading.scene ?? undefined;
    },
    get error() {
      return errors.error;
    },
  };
};
