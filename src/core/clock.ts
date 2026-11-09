// Game clock and timer scopes. Pure TypeScript with no Pixi import, so it runs under `node --test`.
// Game code never uses setTimeout: timers live in a TimerScope and only advance when the clock ticks.

export type TimerCallback = () => void;

/** Identifies a timer within the scope that created it. Handles are never reused. */
export type TimerHandle = number;

export interface TimerScope {
  /** Calls `cb` once, `ms` of game time from now. Throws a RangeError if `ms` is negative or NaN. */
  after(ms: number, cb: TimerCallback): TimerHandle;
  /** Calls `cb` every `ms` of game time, once per elapsed period. Throws a RangeError unless `ms` > 0. */
  every(ms: number, cb: TimerCallback): TimerHandle;
  /** Cancels a pending timer. Unknown, finished or foreign handles are ignored. */
  cancel(handle: TimerHandle): void;
  /** Cancels every timer of this scope. Afterwards `after`/`every` schedule nothing and the rest are no-ops. */
  dispose(): void;
  readonly disposed: boolean;
}

interface Timer {
  readonly id: TimerHandle;
  readonly owner: object;
  readonly period: number;
  readonly callback: TimerCallback;
  due: number;
}

export class GameClock {
  /** While true, `tick` does nothing and game time stands still. */
  paused = false;

  private elapsed = 0;
  private lastId = 0;
  // Map iteration follows insertion order, which is also id (scheduling) order.
  private readonly timers = new Map<TimerHandle, Timer>();

  /** Elapsed game time in ms. Inside a timer callback it equals that timer's due time. */
  get now(): number {
    return this.elapsed;
  }

  /**
   * Advances game time by `deltaMS` and fires every timer that falls due, in chronological order (ties fire in
   * scheduling order). Timers scheduled by a callback also fire in this tick if they are due within it. If a callback
   * pauses the clock, the tick stops at that callback's due time.
   */
  tick(deltaMS: number): void {
    if (this.paused || !(deltaMS > 0)) {
      return;
    }

    const target = this.elapsed + deltaMS;
    let timer = this.nextDue(target);

    while (timer !== undefined && !this.paused) {
      this.elapsed = timer.due;

      if (timer.period > 0) {
        timer.due += timer.period;
      } else {
        this.timers.delete(timer.id);
      }

      timer.callback();
      timer = this.nextDue(target);
    }

    if (!this.paused) {
      this.elapsed = target;
    }
  }

  createScope(): TimerScope {
    const owner = {};
    let disposed = false;

    const schedule = (delay: number, period: number, callback: TimerCallback) => {
      const id = ++this.lastId;

      if (!disposed) {
        this.timers.set(id, { id, owner, period, callback, due: this.elapsed + delay });
      }

      return id;
    };

    return {
      after: (ms, cb) => {
        if (!(ms >= 0)) {
          throw new RangeError(`after() needs a delay >= 0, got ${ms}`);
        }

        return schedule(ms, 0, cb);
      },
      every: (ms, cb) => {
        if (!(ms > 0) || !Number.isFinite(ms)) {
          throw new RangeError(`every() needs a finite period > 0, got ${ms}`);
        }

        return schedule(ms, ms, cb);
      },
      cancel: (handle) => {
        if (this.timers.get(handle)?.owner === owner) {
          this.timers.delete(handle);
        }
      },
      dispose: () => {
        disposed = true;

        for (const timer of this.timers.values()) {
          if (timer.owner === owner) {
            this.timers.delete(timer.id);
          }
        }
      },
      get disposed() {
        return disposed;
      },
    };
  }

  private nextDue(limit: number): Timer | undefined {
    let next: Timer | undefined;

    for (const timer of this.timers.values()) {
      if (timer.due <= limit && (next === undefined || timer.due < next.due)) {
        next = timer;
      }
    }

    return next;
  }
}
