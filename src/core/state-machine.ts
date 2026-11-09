// Generic state machine whose states own their timers. Pure TypeScript with no Pixi import.
import type { GameClock, TimerScope } from "./clock.ts";

export interface State<Id extends string> {
  /** Called on entry with a fresh TimerScope, which is disposed right after `exit`. */
  enter?(scope: TimerScope, machine: StateMachine<Id>): void;
  /** Called once per `machine.update` while the clock runs and no transition is pending. */
  update?(deltaMS: number, machine: StateMachine<Id>): void;
  exit?(): void;
}

/**
 * Runs one state at a time from a typed map of states.
 *
 * `update(deltaMS)` drives the whole frame: it ticks the clock (firing timers), updates the current state, then
 * applies the pending transition. Tick the clock only through the machine, or time advances twice.
 *
 * `request(id)` made inside `update`, a timer callback, `enter` or `exit` is deferred until that call finishes, so
 * transitions never re-enter. The last request wins. A request made outside the machine (e.g. a DOM event) applies
 * at once. Requesting the current state restarts it: exit, dispose its scope, then enter with a new scope.
 */
export class StateMachine<Id extends string> {
  private readonly clock: GameClock;
  private readonly states: Record<Id, State<Id>>;
  private state: State<Id> | undefined;
  private scope: TimerScope | undefined;
  private currentId: Id | undefined;
  private pending: Id | undefined;
  private busy = false;

  constructor(clock: GameClock, states: Record<Id, State<Id>>) {
    this.clock = clock;
    this.states = states;
  }

  /** The active state's id, or undefined before the first request. */
  get current(): Id | undefined {
    return this.currentId;
  }

  /** Asks for a transition. The first request starts the machine. */
  request(id: Id): void {
    this.pending = id;

    if (!this.busy) {
      this.flush();
    }
  }

  update(deltaMS: number): void {
    this.run(() => {
      this.clock.tick(deltaMS);

      if (!this.clock.paused && this.pending === undefined) {
        this.state?.update?.(deltaMS, this);
      }
    });

    this.flush();
  }

  private flush(): void {
    while (this.pending !== undefined) {
      const id = this.pending;
      this.pending = undefined;

      this.run(() => {
        this.state?.exit?.();
        this.scope?.dispose();

        this.currentId = id;
        this.state = this.states[id];
        this.scope = this.clock.createScope();
        this.state.enter?.(this.scope, this);
      });
    }
  }

  private run(work: () => void): void {
    this.busy = true;

    try {
      work();
    } finally {
      this.busy = false;
    }
  }
}
