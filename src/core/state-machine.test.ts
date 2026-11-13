import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "./clock.ts";
import { type State, StateMachine } from "./state-machine.ts";

type Id = "a" | "b" | "c";

// Every state logs its enter/update/exit, then runs the optional hook given for it.
const setup = (hooks: Partial<Record<Id, State<Id>>> = {}) => {
  const clock = new GameClock();
  const log: string[] = [];

  const spy = (id: Id): State<Id> => ({
    enter: (scope, machine) => {
      log.push(`enter ${id}`);
      hooks[id]?.enter?.(scope, machine);
    },
    update: (deltaMS, machine, scope) => {
      log.push(`update ${id}`);
      hooks[id]?.update?.(deltaMS, machine, scope);
    },
    exit: () => {
      log.push(`exit ${id}`);
      hooks[id]?.exit?.();
    },
  });

  const machine = new StateMachine<Id>(clock, { a: spy("a"), b: spy("b"), c: spy("c") });

  return { clock, log, machine };
};

describe("StateMachine", () => {
  it("starts idle and enters the first requested state at once", () => {
    const { log, machine } = setup();

    assert.equal(machine.current, undefined);
    machine.update(16);
    assert.deepEqual(log, []);

    machine.request("a");

    assert.equal(machine.current, "a");
    assert.deepEqual(log, ["enter a"]);
  });

  it("exits the old state before entering the new one", () => {
    const { log, machine } = setup();

    machine.request("a");
    machine.request("b");

    assert.equal(machine.current, "b");
    assert.deepEqual(log, ["enter a", "exit a", "enter b"]);
  });

  it("ticks the clock before updating the state with the frame delta and the state's scope", () => {
    const seen: [number, number][] = [];
    let enterScope: unknown;
    let updateScope: unknown;
    const { clock, machine } = setup({
      a: {
        enter: (scope) => {
          enterScope = scope;
        },
        update: (deltaMS, _machine, scope) => {
          seen.push([deltaMS, clock.now]);
          updateScope = scope;
        },
      },
    });

    machine.request("a");
    machine.update(16);
    machine.update(10);

    assert.deepEqual(seen, [[16, 16], [10, 26]]);
    assert.equal(updateScope, enterScope);
  });

  it("defers a transition requested during update until the update finishes", () => {
    const { log, machine } = setup({
      a: {
        update: (_deltaMS, m) => {
          m.request("b");
          log.push(`still ${m.current}`);
        },
      },
    });

    machine.request("a");
    machine.update(16);

    assert.equal(machine.current, "b");
    assert.deepEqual(log, ["enter a", "update a", "still a", "exit a", "enter b"]);
  });

  it("defers a transition requested by a timer and skips the leaving state's update", () => {
    const { log, machine } = setup({
      a: {
        enter: (scope, m) => {
          scope.after(10, () => {
            m.request("b");
            log.push(`timer in ${m.current}`);
          });
        },
      },
    });

    machine.request("a");
    machine.update(16);

    assert.deepEqual(log, ["enter a", "timer in a", "exit a", "enter b"]);
  });

  it("disposes the state's scope on exit so its timers never fire", () => {
    let scopeA: { readonly disposed: boolean } | undefined;
    const { log, machine } = setup({
      a: {
        enter: (scope) => {
          scopeA = scope;
          scope.after(100, () => log.push("a after"));
          scope.every(10, () => log.push("a every"));
        },
      },
    });

    machine.request("a");
    machine.request("b");
    machine.update(50);
    machine.update(100);

    assert.equal(scopeA?.disposed, true);
    assert.deepEqual(log, ["enter a", "exit a", "enter b", "update b", "update b"]);
  });

  it("stops the leaving state's timers and drops their later requests as soon as it requests a transition", () => {
    type Enter = NonNullable<State<Id>["enter"]>;
    const CASES: readonly { name: string; enter: (log: string[]) => Enter; expected: readonly string[] }[] = [
      {
        name: "timers later in the same tick",
        enter: (log) => (scope, m) => {
          scope.after(10, () => m.request("b"));
          scope.after(20, () => log.push("a late"));
          scope.every(5, () => log.push("a every"));
        },
        expected: ["enter a", "a every", "exit a", "enter b", "update b"],
      },
      {
        name: "a later request in the same tick",
        enter: () => (scope, m) => {
          scope.after(10, () => m.request("b"));
          scope.after(20, () => m.request("c"));
        },
        expected: ["enter a", "exit a", "enter b", "update b"],
      },
    ];

    for (const { name, enter, expected } of CASES) {
      // The hooks are read when a state enters, so the case's hook can log into the setup's own log.
      const hooks: Partial<Record<Id, State<Id>>> = {};
      const { log, machine } = setup(hooks);

      hooks.a = { enter: enter(log) };
      machine.request("a");
      machine.update(30);
      machine.update(30);

      assert.equal(machine.current, "b", name);
      assert.deepEqual(log, expected, name);
    }
  });

  it("applies only the last of several requests made in one update", () => {
    const { log, machine } = setup({
      a: {
        update: (_deltaMS, m) => {
          m.request("b");
          m.request("c");
        },
      },
    });

    machine.request("a");
    machine.update(16);

    assert.equal(machine.current, "c");
    assert.deepEqual(log, ["enter a", "update a", "exit a", "enter c"]);
  });

  it("applies a transition requested in enter right after that enter finishes", () => {
    const { log, machine } = setup({ b: { enter: (_scope, m) => m.request("c") } });

    machine.request("a");
    machine.request("b");

    assert.equal(machine.current, "c");
    assert.deepEqual(log, ["enter a", "exit a", "enter b", "exit b", "enter c"]);
  });

  it("restarts the state with a fresh scope when the current state is requested", () => {
    const scopes: { readonly disposed: boolean }[] = [];
    const { log, machine } = setup({
      a: {
        enter: (scope) => {
          scopes.push(scope);
          scope.after(10, () => log.push(`a timer ${scopes.length}`));
        },
      },
    });

    machine.request("a");
    machine.request("a");
    machine.update(10);

    assert.equal(machine.current, "a");
    assert.equal(scopes.length, 2);
    assert.notEqual(scopes[0], scopes[1]);
    assert.equal(scopes[0]?.disposed, true);
    assert.deepEqual(log, ["enter a", "exit a", "enter a", "a timer 2", "update a"]);
  });

  it("skips state updates and timers while the clock is paused", () => {
    const { clock, log, machine } = setup({ a: { enter: (scope) => scope.after(10, () => log.push("a timer")) } });

    machine.request("a");
    clock.paused = true;
    machine.update(16);

    assert.deepEqual(log, ["enter a"]);

    clock.paused = false;
    machine.update(16);

    assert.deepEqual(log, ["enter a", "a timer", "update a"]);
  });

  it("applies a request made while paused at once, with the new state's timers waiting for unpause", () => {
    let scopeA: { readonly disposed: boolean } | undefined;
    const { clock, log, machine } = setup({
      a: {
        enter: (scope) => {
          scopeA = scope;
          scope.every(10, () => log.push("a timer"));
        },
      },
      b: { enter: (scope) => scope.after(10, () => log.push("b timer")) },
    });

    machine.request("a");
    clock.paused = true;
    machine.request("b");

    assert.equal(machine.current, "b");
    assert.equal(scopeA?.disposed, true);

    machine.update(16);

    assert.deepEqual(log, ["enter a", "exit a", "enter b"]);

    clock.paused = false;
    machine.update(16);

    assert.deepEqual(log, ["enter a", "exit a", "enter b", "b timer", "update b"]);
  });

  it("ignores requests made inside exit", () => {
    let saved: StateMachine<Id> | undefined;
    const { log, machine } = setup({
      a: {
        enter: (_scope, m) => {
          saved = m;
        },
        exit: () => saved?.request("c"),
      },
    });

    machine.request("a");
    machine.request("b");

    assert.equal(machine.current, "b");
    assert.deepEqual(log, ["enter a", "exit a", "enter b"]);
  });

  it("counts a state whose enter throws as entered, and exits it on the next transition", () => {
    const { log, machine } = setup({
      b: {
        enter: (scope) => {
          scope.after(10, () => log.push("b timer"));
          throw new Error("enter failed");
        },
      },
    });

    machine.request("a");
    assert.throws(() => machine.request("b"), /enter failed/);
    assert.equal(machine.current, "b");

    machine.request("c");
    machine.update(20);

    assert.deepEqual(log, ["enter a", "exit a", "enter b", "exit b", "enter c", "update c"]);
  });

  it("disposes the scope and leaves the machine idle when exit throws", () => {
    let scopeA: { readonly disposed: boolean } | undefined;
    const { log, machine } = setup({
      a: {
        enter: (scope) => {
          scopeA = scope;
        },
        exit: () => {
          throw new Error("exit failed");
        },
      },
    });

    machine.request("a");
    assert.throws(() => machine.request("b"), /exit failed/);

    assert.equal(machine.current, undefined);
    assert.equal(scopeA?.disposed, true);

    machine.request("c");

    assert.equal(machine.current, "c");
    assert.deepEqual(log, ["enter a", "exit a", "enter c"]);
  });

  it("throws on an unknown state id without leaving the current state", () => {
    const { log, machine } = setup();

    machine.request("a");
    assert.throws(() => machine.request("missing" as Id), /unknown state "missing"/);
    assert.throws(() => machine.request("toString" as Id), /unknown state "toString"/);

    machine.update(16);

    assert.equal(machine.current, "a");
    assert.deepEqual(log, ["enter a", "update a"]);
  });

  it("stays usable after a state's update throws", () => {
    const { log, machine } = setup({
      a: {
        update: () => {
          throw new Error("boom");
        },
      },
    });

    machine.request("a");
    assert.throws(() => machine.update(16), /boom/);

    machine.request("b");

    assert.equal(machine.current, "b");
    assert.deepEqual(log, ["enter a", "update a", "exit a", "enter b"]);
  });
});
