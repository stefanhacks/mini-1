// Generic state machine whose states own their timers. Pure TypeScript with no Pixi import.
import type { GameClock, TimerScope } from "./clock.ts";

export interface State<Id extends string> {
  /** Called on entry with a fresh TimerScope, which is disposed when the state asks to leave or exits. */
  enter?(scope: TimerScope, machine: StateMachine<Id>): void;
  /** Called once per `machine.update` while the clock runs and no transition is pending. */
  update?(deltaMS: number, machine: StateMachine<Id>, scope: TimerScope): void;
  /** Requests made here are ignored. */
  exit?(): void;
}

interface Active<Id extends string> {
  readonly id: Id;
  readonly state: State<Id>;
  readonly scope: TimerScope;
}

/**
 * Runs one state at a time from a typed map of states.
 *
 * `update(deltaMS)` drives the whole frame: it ticks the clock (firing timers), updates the current state, then
 * applies the pending transition. Tick the clock only through the machine, or time advances twice.
 *
 * A `request(id)` made inside `update`, a timer callback or `enter` disposes the current state's scope at once, so
 * none of its timers fire later, and the transition itself is deferred until that call finishes, so transitions
 * never re-enter. The last request wins. A request made outside the machine (e.g. a DOM event, even while paused)
 * applies at once. Requests made inside `exit` are ignored. Requesting the current state restarts it: exit, dispose
 * its scope, then enter with a new scope.
 *
 * If `enter` throws, the state still counts as entered and exits on the next transition. If `exit` throws, its scope
 * is still disposed, the transition is dropped and the machine is left idle. Either way the error propagates.
 */
export class StateMachine<Id extends string> {
  private readonly clock: GameClock;
  private readonly states: Record<Id, State<Id>>;
  private active: Active<Id> | undefined;
  private pending: Id | undefined;
  private busy = false;
  private exiting = false;

  constructor(clock: GameClock, states: Record<Id, State<Id>>) {
    this.clock = clock;
    this.states = states;
  }

  /** The active state's id, or undefined before the first request. */
  get current(): Id | undefined {
    return this.active?.id;
  }

  /** Asks for a transition. The first request starts the machine. */
  request(id: Id): void {
    if (this.exiting) {
      return;
    }

    this.pending = id;

    if (this.busy) {
      this.active?.scope.dispose();
    } else {
      this.flush();
    }
  }

  update(deltaMS: number): void {
    this.run(() => {
      this.clock.tick(deltaMS);

      if (this.active && !this.clock.paused && this.pending === undefined) {
        this.active.state.update?.(deltaMS, this, this.active.scope);
      }
    });

    this.flush();
  }

  private flush(): void {
    while (this.pending !== undefined) {
      const id = this.pending;
      this.pending = undefined;

      this.run(() => this.transition(id));
    }
  }

  private transition(id: Id): void {
    const leaving = this.active;
    this.active = undefined;
    this.exiting = true;

    try {
      leaving?.state.exit?.();
    } finally {
      this.exiting = false;
      leaving?.scope.dispose();
    }

    const state = this.states[id];
    const scope = this.clock.createScope();

    this.active = { id, state, scope };
    state.enter?.(scope, this);
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
