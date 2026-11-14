import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout } from "../../core/layout.ts";
import { computePads } from "./pad-geometry.ts";
import { createRouterCore, type PauseInput } from "./router-core.ts";

// iPhone 13 portrait: the mute button in the safe top-right corner, the pad in the bottom zone.
const LAYOUT = computeLayout({ width: 390, height: 844, insets: { top: 47, right: 0, bottom: 34, left: 0 }, dpr: 3 });

type Core = ReturnType<typeof createRouterCore>;

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

  it("a pointer that went down on mute and lifts on pause does nothing", () => {
    const { core, log, muteCentre, pauseCentre } = setupPause("ready");

    core.pointerDown(1, muteCentre.x, muteCentre.y);
    core.pointerUp(1, pauseCentre.x, pauseCentre.y);
    assert.deepEqual(log, []);
  });
});

/** The setup above with a reduce-flashes listener, the pause input set to `input`, and the toggle's centre. */
const setupFlashes = (input: PauseInput) => {
  const { core, log, muteCentre } = setupPause(input);

  core.onFlashes(() => log.push("flashes"));

  const rect = core.flashesRect;

  if (rect === null) {
    throw new Error("no reduce-flashes button");
  }

  return { core, log, muteCentre, flashesCentre: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
};

describe("router core: the reduce-flashes toggle", () => {
  it("a tap only toggles, with no press, advance or activation, whatever the pause input", () => {
    for (const input of ["off", "ready", "paused"] as const) {
      const { core, log, flashesCentre } = setupFlashes(input);

      core.pointerDown(1, flashesCentre.x, flashesCentre.y);
      core.pointerUp(1, flashesCentre.x, flashesCentre.y, true);
      core.touchEnd();
      assert.deepEqual(log, ["flashes"], `pause input ${input}`);
      assert.deepEqual(core.map.drain(), [], `pause input ${input}`);
    }
  });
});

/** The setup above with an endless listener, the pause input set to `input`, and the icon's centre. */
const setupEndless = (input: PauseInput) => {
  const { core, log } = setupPause(input);

  core.onEndless(() => log.push(`endless(${core.map.drain().map((event) => event.kind).join(",")})`));

  const rect = core.endlessRect;

  if (rect === null) {
    throw new Error("no endless-mode icon");
  }

  return { core, log, endlessCentre: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
};

describe("router core: the endless-mode icon", () => {
  it("sits under the reduce-flashes toggle", () => {
    const { core } = setupEndless("ready");

    assert.equal(core.endlessRect?.y, (core.flashesRect?.y ?? NaN) + (core.flashesRect?.height ?? NaN));
    assert.equal(core.endlessRect?.x, core.flashesRect?.x);
  });

  it("queues an \"endless\" event on a tap or E while its input is on, with no advance or activation", () => {
    const { core, log, endlessCentre } = setupEndless("ready");

    core.setEndlessInput(true);
    core.pointerDown(1, endlessCentre.x, endlessCentre.y);
    core.pointerUp(1, endlessCentre.x, endlessCentre.y, true);
    core.touchEnd();
    assert.equal(core.endlessKey(), true);
    assert.deepEqual(log, ["endless(endless)", "endless(endless)"]);
  });

  it("is ordinary input while its input is off, or while paused", () => {
    for (const [input, on] of [["ready", false], ["paused", true]] as const) {
      const { core, log, endlessCentre } = setupEndless(input);

      core.setEndlessInput(on);
      core.pointerDown(1, endlessCentre.x, endlessCentre.y);
      core.pointerUp(1, endlessCentre.x, endlessCentre.y);
      assert.equal(core.endlessKey(), false);
      assert.deepEqual(log, ["activate(advance)"], `pause input ${input}, endless input ${on}`);
    }
  });
});

describe("router core: every corner button", () => {
  it("does nothing when the pointer slides off before lifting, or is cancelled", () => {
    const CASES = [
      { name: "mute", start: () => setup(), rectOf: (core: Core) => core.muteRect },
      { name: "pause", start: () => setupPause("ready"), rectOf: (core: Core) => core.pauseRect },
      { name: "reduce flashes", start: () => setupFlashes("ready"), rectOf: (core: Core) => core.flashesRect },
      {
        name: "endless",
        start: () => {
          const started = setupEndless("ready");

          started.core.setEndlessInput(true);

          return started;
        },
        rectOf: (core: Core) => core.endlessRect,
      },
    ];

    for (const { name, start, rectOf } of CASES) {
      const { core, log } = start();
      const rect = rectOf(core);

      if (rect === null) {
        throw new Error(`no ${name} button`);
      }

      const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

      core.pointerDown(1, centre.x, centre.y);
      core.pointerUp(1, centre.x - 100, centre.y + 100);
      core.pointerDown(2, centre.x, centre.y);
      core.pointerCancel(2);
      core.pointerUp(2, centre.x, centre.y);
      assert.deepEqual(log, [], name);
      assert.deepEqual(core.map.drain(), [], name);
    }
  });

  it("is ordinary input while no listener is registered, and the mute button keeps its own square", () => {
    const tap = (core: Core, id: number, x: number, y: number) => {
      core.pointerDown(id, x, y);
      core.pointerUp(id, x, y);
    };
    const CASES = [
      {
        name: "mute",
        expected: ["activate(advance)"],
        run: () => {
          const { core, log, muteCentre } = setup({ mute: false });

          tap(core, 1, muteCentre.x, muteCentre.y);

          return { log, key: core.muteKey() };
        },
      },
      {
        name: "pause",
        expected: ["activate(advance)", "mute"],
        run: () => {
          const { core, log, muteCentre } = setup();

          core.setPauseInput("ready");

          const rect = core.pauseRect;

          if (rect === null) {
            throw new Error("no pause button");
          }

          tap(core, 1, rect.x + 1, rect.y + rect.height / 2);
          tap(core, 2, muteCentre.x, muteCentre.y);

          return { log, key: core.pauseKey() };
        },
      },
      {
        name: "reduce flashes",
        expected: ["activate(advance)"],
        run: () => {
          const { core, log } = setupPause("ready");
          const rect = core.flashesRect;

          if (rect === null) {
            throw new Error("no reduce-flashes button");
          }

          tap(core, 1, rect.x + rect.width / 2, rect.y + rect.height / 2);

          // The toggle has no key.
          return { log, key: false };
        },
      },
    ];

    for (const { name, expected, run } of CASES) {
      const { log, key } = run();

      assert.deepEqual(log, expected, name);
      assert.equal(key, false, `${name}: key`);
    }
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
