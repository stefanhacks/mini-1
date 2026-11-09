import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "./clock.ts";

const setup = () => {
  const clock = new GameClock();
  const scope = clock.createScope();
  const log: string[] = [];
  const record = (name: string) => () => log.push(`${name}@${clock.now}`);

  return { clock, scope, log, record };
};

describe("GameClock", () => {
  it("advances now by each tick and ignores deltas that are not finite and above zero", () => {
    const { clock } = setup();

    clock.tick(16);
    clock.tick(0);
    clock.tick(-5);
    clock.tick(NaN);
    clock.tick(Infinity);
    clock.tick(4);

    assert.equal(clock.now, 20);
  });

  it("fires timers due within one tick in chronological order, ties in scheduling order", () => {
    const { clock, scope, log, record } = setup();

    scope.after(30, record("c"));
    scope.after(10, record("a"));
    scope.after(30, record("d"));
    scope.after(20, record("b"));
    clock.tick(100);

    assert.deepEqual(log, ["a@10", "b@20", "c@30", "d@30"]);
    assert.equal(clock.now, 100);
  });

  it("orders ties across scopes by scheduling order", () => {
    const { clock, scope, log, record } = setup();
    const other = clock.createScope();

    other.after(10, record("first"));
    scope.after(10, record("second"));
    clock.tick(10);

    assert.deepEqual(log, ["first@10", "second@10"]);
  });

  it("fires a timer exactly at its due time, not before", () => {
    const { clock, scope, log, record } = setup();

    scope.after(50, record("a"));
    clock.tick(49);
    assert.deepEqual(log, []);

    clock.tick(1);
    assert.deepEqual(log, ["a@50"]);
  });

  it("fires timers scheduled by a callback in the same tick when they fall due within it", () => {
    const { clock, scope, log, record } = setup();

    scope.after(10, () => {
      record("a")();
      scope.after(15, record("nested"));
      scope.after(0, record("now"));
      scope.after(500, record("later"));
    });
    scope.after(10, record("tie"));
    scope.after(20, record("b"));
    clock.tick(30);

    assert.deepEqual(log, ["a@10", "tie@10", "now@10", "b@20", "nested@25"]);
  });

  it("does not advance or fire while paused", () => {
    const { clock, scope, log, record } = setup();

    scope.after(10, record("a"));
    clock.paused = true;
    clock.tick(100);

    assert.equal(clock.now, 0);
    assert.deepEqual(log, []);

    clock.paused = false;
    clock.tick(10);

    assert.deepEqual(log, ["a@10"]);
  });

  it("stops the tick at the callback that pauses the clock", () => {
    const { clock, scope, log, record } = setup();

    scope.after(10, () => {
      record("pause")();
      clock.paused = true;
    });
    scope.after(20, record("b"));
    clock.tick(50);

    assert.equal(clock.now, 10);
    assert.deepEqual(log, ["pause@10"]);

    clock.paused = false;
    clock.tick(10);

    assert.deepEqual(log, ["pause@10", "b@20"]);
  });

  it("throws when tick is called from inside a timer callback, and keeps working afterwards", () => {
    const { clock, scope, log, record } = setup();

    scope.after(10, () => clock.tick(5));
    scope.after(20, record("b"));

    assert.throws(() => clock.tick(15), /inside a timer callback/);
    assert.equal(clock.now, 10);

    clock.tick(10);

    assert.deepEqual(log, ["b@20"]);
  });
});

describe("TimerScope.every", () => {
  it("fires once per elapsed period and catches up within a long tick", () => {
    const { clock, scope, log, record } = setup();

    scope.every(10, record("e"));
    clock.tick(35);

    assert.deepEqual(log, ["e@10", "e@20", "e@30"]);
  });

  it("keeps its schedule without drift across uneven ticks", () => {
    const { clock, scope } = setup();
    const fired: number[] = [];

    scope.every(10, () => fired.push(clock.now));

    for (const delta of [7, 7, 7, 7, 7, 16, 1, 25]) {
      clock.tick(delta);
    }

    assert.equal(clock.now, 77);
    assert.deepEqual(fired, [10, 20, 30, 40, 50, 60, 70]);
  });

  it("interleaves with other timers in chronological order", () => {
    const { clock, scope, log, record } = setup();

    scope.every(10, record("e"));
    scope.after(15, record("a"));
    scope.after(20, record("b"));
    clock.tick(25);

    assert.deepEqual(log, ["e@10", "a@15", "e@20", "b@20"]);
  });

  it("anchors an every created inside a callback to that callback's due time", () => {
    const { clock, scope } = setup();
    const fired: number[] = [];

    scope.after(10, () => scope.every(10, () => fired.push(clock.now)));
    clock.tick(16);
    clock.tick(30);

    assert.deepEqual(fired, [20, 30, 40]);
  });

  it("does not drift over a long run of 60 fps ticks", () => {
    const { clock, scope } = setup();
    let fired = 0;

    scope.every(100, () => fired++);

    for (let frame = 0; frame < 108_000; frame++) {
      clock.tick(1000 / 60);
    }

    assert.equal(fired, Math.floor(clock.now / 100));
    assert.ok(fired >= 17_999);
  });

  it("rejects a period that is not a finite number of at least 1 ms", () => {
    const { scope } = setup();
    const noop = () => undefined;

    assert.throws(() => scope.every(0, noop), RangeError);
    assert.throws(() => scope.every(0.5, noop), RangeError);
    assert.throws(() => scope.every(-1, noop), RangeError);
    assert.throws(() => scope.every(NaN, noop), RangeError);
    assert.throws(() => scope.every(Infinity, noop), RangeError);
  });

  it("rejects a negative or NaN delay for after", () => {
    const { scope } = setup();
    const noop = () => undefined;

    assert.throws(() => scope.after(-1, noop), RangeError);
    assert.throws(() => scope.after(NaN, noop), RangeError);
  });
});

describe("TimerScope.cancel", () => {
  it("cancels a pending timer", () => {
    const { clock, scope, log, record } = setup();

    const handle = scope.after(10, record("a"));
    scope.after(20, record("b"));
    scope.cancel(handle);
    clock.tick(30);

    assert.deepEqual(log, ["b@20"]);
  });

  it("lets an every timer cancel itself from its own callback", () => {
    const { clock, scope } = setup();
    let count = 0;

    const handle = scope.every(10, () => {
      count++;

      if (count === 2) {
        scope.cancel(handle);
      }
    });
    clock.tick(100);

    assert.equal(count, 2);
  });

  it("cancels a timer due later in the same tick from an earlier callback", () => {
    const { clock, scope, log, record } = setup();

    const later = scope.after(20, record("later"));
    scope.after(10, () => scope.cancel(later));
    clock.tick(30);

    assert.deepEqual(log, []);
  });

  it("ignores handles of other scopes and unknown handles", () => {
    const { clock, scope, log, record } = setup();
    const other = clock.createScope();

    const handle = scope.after(10, record("a"));
    other.cancel(handle);
    scope.cancel(9999);
    clock.tick(10);

    assert.deepEqual(log, ["a@10"]);
  });
});

describe("TimerScope.dispose", () => {
  it("cancels all timers of the scope and leaves other scopes alone", () => {
    const { clock, scope, log, record } = setup();
    const other = clock.createScope();

    scope.after(10, record("a"));
    scope.every(5, record("e"));
    other.after(10, record("other"));
    scope.dispose();
    clock.tick(20);

    assert.equal(scope.disposed, true);
    assert.deepEqual(log, ["other@10"]);
  });

  it("stops the rest of the scope's timers when disposed from inside a callback", () => {
    const { clock, scope, log, record } = setup();

    scope.after(10, () => scope.dispose());
    scope.after(10, record("tie"));
    scope.every(5, record("e"));
    clock.tick(30);

    assert.deepEqual(log, ["e@5"]);
  });

  it("turns later calls on a disposed scope into no-ops", () => {
    const { clock, scope, log, record } = setup();

    scope.dispose();
    const handle = scope.after(10, record("a"));
    scope.every(10, record("e"));
    scope.cancel(handle);
    scope.dispose();
    clock.tick(30);

    assert.deepEqual(log, []);
  });
});
