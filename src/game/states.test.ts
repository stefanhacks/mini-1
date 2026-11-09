import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../core/clock.ts";
import { StateMachine } from "../core/state-machine.ts";
import { createGameStates, type GameStateId } from "./states.ts";

const FRAME_MS = 16;

// Lets every pending promise callback run: setImmediate fires after the microtask queue drains.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

// A load promise the test settles by hand.
const deferred = () => {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
};

const setup = (loaded: Promise<unknown>) => {
  const clock = new GameClock();
  const machine = new StateMachine<GameStateId>(clock, createGameStates({ loaded }));

  machine.request("gate");

  return { clock, machine };
};

describe("gate", () => {
  it("waits for the assets, then requests title on the next frame", async () => {
    const load = deferred();
    const { machine } = setup(load.promise);

    await settle();
    machine.update(FRAME_MS);
    assert.equal(machine.current, "gate");

    load.resolve();
    await settle();
    assert.equal(machine.current, "gate");

    machine.update(FRAME_MS);
    assert.equal(machine.current, "title");
  });

  it("waits while the clock is paused", async () => {
    const { clock, machine } = setup(Promise.resolve());

    await settle();
    clock.paused = true;
    machine.update(FRAME_MS);
    assert.equal(machine.current, "gate");

    clock.paused = false;
    machine.update(FRAME_MS);
    assert.equal(machine.current, "title");
  });

  it("stays on gate when loading fails", async () => {
    const { machine } = setup(Promise.reject(new Error("load failed")));

    await settle();
    machine.update(FRAME_MS);
    assert.equal(machine.current, "gate");
  });

  it("moves on once when re-entered while loading", async () => {
    const load = deferred();
    const { machine } = setup(load.promise);

    machine.request("story");
    machine.request("gate");
    load.resolve();
    await settle();
    machine.update(FRAME_MS);
    assert.equal(machine.current, "title");

    machine.update(FRAME_MS);
    assert.equal(machine.current, "title");
  });

  it("moves on at once when re-entered after loading", async () => {
    const { machine } = setup(Promise.resolve());

    await settle();
    machine.request("story");
    machine.request("gate");
    machine.update(FRAME_MS);
    assert.equal(machine.current, "title");
  });

  it("requests nothing once it was left before loading finished", async () => {
    const load = deferred();
    const { machine } = setup(load.promise);

    machine.request("story");
    load.resolve();
    await settle();
    machine.update(FRAME_MS);
    assert.equal(machine.current, "story");
  });

  it("swallows a rejection that arrives after it was left", async () => {
    const load = deferred();
    const { machine } = setup(load.promise);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);

    process.on("unhandledRejection", onUnhandled);

    try {
      machine.request("story");
      load.reject(new Error("load failed"));
      await settle();
      machine.update(FRAME_MS);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    assert.equal(machine.current, "story");
    assert.deepEqual(unhandled, []);
  });
});
