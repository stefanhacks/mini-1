import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout } from "../../core/layout.ts";
import { computePads } from "./pad-geometry.ts";
import { createRouterCore, type PauseInput } from "./router-core.ts";

// iPhone 13 portrait: the mute button in the safe top-right corner, the pad in the bottom zone.
const LAYOUT = computeLayout({ width: 390, height: 844, insets: { top: 47, right: 0, bottom: 34, left: 0 }, dpr: 3 });

const setup = ({ mute = true } = {}) => {
  const core = createRouterCore();
  const log: string[] = [];

  core.setLayout(LAYOUT);
  core.onActivate(() => {
    // The advance is already queued when the hook runs.
    log.push(`activate(${core.map.drain().map((event) => event.kind).join(",")})`);
  });

  if (mute) {
    core.onMute(() => log.push("mute"));
  }

  const rect = core.muteRect;

  if (rect === null) {
    throw new Error("no mute button");
  }

  const muteCentre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const up = computePads(LAYOUT)[0].buttons.up;
  const upCentre = { x: up.x + up.width / 2, y: up.y + up.height / 2 };

  return { core, log, muteCentre, upCentre };
};

describe("router core: the mute button", () => {
  it("toggles on a tap, with no press, advance or activation", () => {
    const { core, log, muteCentre } = setup();

    core.pointerDown(1, muteCentre.x, muteCentre.y);
    core.pointerUp(1, muteCentre.x, muteCentre.y);
    assert.deepEqual(log, ["mute"]);
    assert.deepEqual(core.map.drain(), []);
  });

  it("does nothing when the pointer slides off before lifting, or is cancelled", () => {
    const { core, log, muteCentre } = setup();

    core.pointerDown(1, muteCentre.x, muteCentre.y);
    core.pointerUp(1, muteCentre.x - 100, muteCentre.y + 100);
    core.pointerDown(2, muteCentre.x, muteCentre.y);
    core.pointerCancel(2);
    core.pointerUp(2, muteCentre.x, muteCentre.y);
    assert.deepEqual(log, []);
    assert.deepEqual(core.map.drain(), []);
  });

  it("is ordinary input while no mute listener is registered", () => {
    const { core, log, muteCentre } = setup({ mute: false });

    core.pointerDown(1, muteCentre.x, muteCentre.y);
    core.pointerUp(1, muteCentre.x, muteCentre.y);
    assert.deepEqual(log, ["activate(advance)"]);
    assert.equal(core.muteKey(), false);
  });

  it("toggles on the M key while a listener is registered, and unsubscribes", () => {
    const core = createRouterCore();
    let toggles = 0;
    const off = core.onMute(() => {
      toggles += 1;
    });

    assert.equal(core.muteKey(), true);
    off();
    assert.equal(core.muteKey(), false);
    assert.equal(toggles, 1);
  });
});

/** The setup above with a pause listener, the pause input set to `input`, and the pause button's centre. */
const setupPause = (input: PauseInput) => {
  const { core, log, muteCentre, upCentre } = setup();

  core.onPause(() => log.push("pause"));
  core.setPauseInput(input);

  const rect = core.pauseRect;

  if (rect === null) {
    throw new Error("no pause button");
  }

  return { core, log, muteCentre, upCentre, pauseCentre: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
};

describe("router core: the pause button and keys", () => {
  it("sits right under the mute button", () => {
    const { core } = setupPause("ready");

    assert.equal(core.pauseRect?.x, core.muteRect?.x);
    assert.equal(core.pauseRect?.y, (core.muteRect?.y ?? 0) + (core.muteRect?.height ?? 0));
  });

  it("while ready: a tap calls the pause listeners, with no press, advance or activation, and so does a key", () => {
    const { core, log, pauseCentre } = setupPause("ready");

    core.pointerDown(1, pauseCentre.x, pauseCentre.y);
    core.pointerUp(1, pauseCentre.x, pauseCentre.y, true);
    core.touchEnd();
    assert.deepEqual(log, ["pause"]);
    assert.deepEqual(core.map.drain(), []);
    assert.equal(core.pauseKey(), true);
    assert.deepEqual(log, ["pause", "pause"]);
  });

  it("does nothing when the pointer slides off before lifting, or is cancelled", () => {
    const { core, log, pauseCentre } = setupPause("ready");

    core.pointerDown(1, pauseCentre.x, pauseCentre.y);
    core.pointerUp(1, pauseCentre.x - 100, pauseCentre.y + 100);
    core.pointerDown(2, pauseCentre.x, pauseCentre.y);
    core.pointerCancel(2);
    core.pointerUp(2, pauseCentre.x, pauseCentre.y);
    assert.deepEqual(log, []);
    assert.deepEqual(core.map.drain(), []);
  });

  it("while paused: its square is an ordinary tap (advance, activation, touchend retry); keys still call", () => {
    const { core, log, pauseCentre } = setupPause("paused");

    core.pointerDown(1, pauseCentre.x, pauseCentre.y);
    core.pointerUp(1, pauseCentre.x, pauseCentre.y, true);
    core.touchEnd();
    assert.deepEqual(log, ["activate(advance)", "activate()"]);
    assert.equal(core.pauseKey(), true);
    assert.deepEqual(log, ["activate(advance)", "activate()", "pause"]);
  });

  it("while off (the gate): its square and the keys are ordinary input", () => {
    const { core, log, pauseCentre } = setupPause("off");

    core.pointerDown(1, pauseCentre.x, pauseCentre.y);
    core.pointerUp(1, pauseCentre.x, pauseCentre.y);
    assert.deepEqual(log, ["activate(advance)"]);
    assert.equal(core.pauseKey(), false);
  });

  it("is ordinary input while no pause listener is registered, and the mute button keeps its own square", () => {
    const { core, log, muteCentre } = setup();

    core.setPauseInput("ready");
    assert.equal(core.pauseKey(), false);

    const rect = core.pauseRect;

    if (rect === null) {
      throw new Error("no pause button");
    }

    core.pointerDown(1, rect.x + 1, rect.y + rect.height / 2);
    core.pointerUp(1, rect.x + 1, rect.y + rect.height / 2);
    core.pointerDown(2, muteCentre.x, muteCentre.y);
    core.pointerUp(2, muteCentre.x, muteCentre.y);
    assert.deepEqual(log, ["activate(advance)", "mute"]);
  });

  it("a pointer that went down on mute and lifts on pause does nothing", () => {
    const { core, log, muteCentre, pauseCentre } = setupPause("ready");

    core.pointerDown(1, muteCentre.x, muteCentre.y);
    core.pointerUp(1, pauseCentre.x, pauseCentre.y);
    assert.deepEqual(log, []);
  });
});

describe("router core: activation", () => {
  it("fires inside the begin tap's pointerup, after its advance is queued, and never on pointerdown", () => {
    const { core, log } = setup();

    core.pointerDown(1, 195, 300);
    assert.deepEqual(log, []);
    core.pointerUp(1, 195, 300);
    assert.deepEqual(log, ["activate(advance)"]);
  });

  it("fires on a pad tap's up, after its release", () => {
    const { core, log, upCentre } = setup();

    core.pointerDown(1, upCentre.x, upCentre.y);
    assert.deepEqual(core.map.drain(), [{ kind: "press", dir: "up" }]);
    core.pointerUp(1, upCentre.x, upCentre.y);
    assert.deepEqual(log, ["activate(release,advance)"]);
  });

  it("fires on an advancing keydown, not for stale or cancelled pointers", () => {
    const { core, log } = setup();

    core.map.keyDown(null, true);
    core.pointerDown(1, 195, 300);
    core.map.beginEpoch();
    core.pointerUp(1, 195, 300);
    core.pointerDown(2, 195, 300);
    core.pointerCancel(2);
    core.pointerUp(2, 195, 300);
    assert.deepEqual(log, ["activate(advance)"]);
  });

  it("keeps running the other listeners when one throws", () => {
    const core = createRouterCore();
    const reportError = globalThis.reportError;
    const reported: unknown[] = [];
    let calls = 0;

    globalThis.reportError = (error) => reported.push(error);

    try {
      core.onActivate(() => {
        throw new Error("boom");
      });
      core.onActivate(() => {
        calls += 1;
      });
      core.pointerDown(1, 10, 10);
      core.pointerUp(1, 10, 10);
    } finally {
      globalThis.reportError = reportError;
    }

    assert.equal(calls, 1);
    assert.equal(reported.length, 1);
    assert.deepEqual(core.map.drain(), [{ kind: "advance" }]);
  });
});

describe("router core: the iOS touchend fallback", () => {
  it("repeats a touch tap's activation once on the touchend, with no second advance", () => {
    const { core, log } = setup();

    core.pointerDown(1, 195, 300);
    core.pointerUp(1, 195, 300, true);
    core.touchEnd();
    core.touchEnd();
    assert.deepEqual(log, ["activate(advance)", "activate()"]);
  });

  it("does nothing on the touchend of a mouse tap, a mute tap, a stale tap, or after a new down", () => {
    const { core, log, muteCentre } = setup();

    core.pointerDown(1, 195, 300);
    core.pointerUp(1, 195, 300, false);
    core.touchEnd();
    core.pointerDown(2, muteCentre.x, muteCentre.y);
    core.pointerUp(2, muteCentre.x, muteCentre.y, true);
    core.touchEnd();
    core.pointerDown(3, 195, 300);
    core.map.beginEpoch();
    core.pointerUp(3, 195, 300, true);
    core.touchEnd();
    core.pointerDown(4, 195, 300);
    core.pointerUp(4, 195, 300, true);
    core.pointerDown(5, 195, 300);
    core.touchEnd();
    assert.deepEqual(log, ["activate(advance)", "mute", "activate(advance)"]);
  });
});
