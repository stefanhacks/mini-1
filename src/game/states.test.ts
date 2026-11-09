import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../core/clock.ts";
import { StateMachine } from "../core/state-machine.ts";
import { createGameStates, type GameStateId } from "./states.ts";

// Lets every pending promise callback run: setImmediate fires after the microtask queue drains.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const setup = (loaded: Promise<unknown>) => {
  const machine = new StateMachine<GameStateId>(new GameClock(), createGameStates({ loaded }));

  machine.request("gate");

  return machine;
};

describe("gate", () => {
  it("waits for the assets, then requests title", async() => {
    let finish = () => {};
    const machine = setup(new Promise<void>((resolve) => (finish = resolve)));

    await settle();
    assert.equal(machine.current, "gate");

    finish();
    await settle();
    assert.equal(machine.current, "title");
  });

  it("stays on gate when loading fails", async() => {
    const machine = setup(Promise.reject(new Error("load failed")));

    await settle();
    assert.equal(machine.current, "gate");
  });

  it("requests nothing once it was left before loading finished", async() => {
    let finish = () => {};
    const machine = setup(new Promise<void>((resolve) => (finish = resolve)));

    machine.request("story");
    finish();
    await settle();
    assert.equal(machine.current, "story");
  });
});
