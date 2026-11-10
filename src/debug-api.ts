// The shape of `window.debug`: what main.ts exposes for the console, the debug overlay and the e2e tests. Types only.
import type { Application } from "pixi.js";
import type { GameClock } from "./core/clock.ts";
import type { PlayfieldDisplay } from "./core/display.ts";
import type { Layers } from "./core/layers.ts";
import type { Layout } from "./core/layout.ts";
import type { StateMachine } from "./core/state-machine.ts";
import type { InputRouter } from "./game/input/dom-router.ts";
import type { Scene } from "./game/scene.ts";
import type { SessionSnapshot } from "./game/states/session.ts";
import type { GameStateId } from "./game/states/types.ts";

/** The game as plain data, safe to hand to `page.evaluate`. */
export type GameSnapshot = SessionSnapshot & { readonly state: GameStateId | undefined };

/** Counts that must not grow from one game to the next (the replay leak test). */
export interface DebugCounts {
  /** Timers scheduled on the game clock and not yet fired or cancelled. */
  readonly pendingTimers: number;
  readonly layoutListeners: number;
  readonly tickerListeners: number;
}

export interface DebugApi {
  readonly app: Application;
  readonly clock: GameClock;
  readonly machine: StateMachine<GameStateId>;
  readonly layers: Layers;
  readonly display: PlayfieldDisplay;
  readonly router: InputRouter;
  /** Subscribes to every new layout; returns the unsubscribe function. */
  readonly onLayout: (listener: (layout: Layout) => void) => () => void;
  readonly layout: Layout;
  readonly game: GameSnapshot;
  readonly counts: DebugCounts;
  readonly timescale: number;
  /** Changes the time scale. Does nothing without `?debug`. */
  readonly setTimescale: (value: number) => void;
  /** Set once the scene is built. */
  scene?: Scene;
  /** The first error that halted the game logic or the render passes. */
  error?: unknown;
}
