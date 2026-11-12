import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../core/clock.ts";
import { StateMachine } from "../core/state-machine.ts";
import { Round } from "./challenges/round.ts";
import { ruleContext, type ChallengeSpec } from "./challenges/rule.ts";
import { TUNING } from "./challenges/tuning.ts";
import { createFrameStepper } from "./frame-step.ts";
import { createPause, type PauseDeps } from "./pause.ts";

const FRAME_MS = 16;

/**
 * A pause over a real clock, machine and frame stepper, with one state that runs a round and drains a fake input
 * queue. `frame` runs one app frame as the frame loop does: `pause.frame()`, then the stepper.
 */
const setUp = (specs: readonly ChallengeSpec[] = [{ kind: "hold", direction: "up" }]) => {
  const clock = new GameClock();
  const log: string[] = [];
  let queue: string[] = [];
  let state = "round";
  let audioPrompt = false;
  let round: Round | null = null;
  let fired = 0;
  const machine = new StateMachine<"gate" | "round">(clock, {
    gate: {},
    round: {
      enter: (scope) => {
        round = new Round(specs, ruleContext(clock, scope, TUNING));
        // A timer, as the states' cues and fades: it must not fire while paused.
        scope.every(100, () => {
          fired += 1;
        });
      },
      update: () => {
        for (const event of queue) {
          log.push(`drained ${event}`);

          if (event === "press") {
            round?.press(specs[0]?.kind === "sequence" ? specs[0].directions[0] ?? "up" : "up");
          }
        }

        queue = [];
      },
    },
  });
  const stepper = createFrameStepper(machine);
  const deps: PauseDeps = {
    clock,
    view: { setPaused: (paused) => log.push(`view ${paused}`) },
    input: {
      beginEpoch: () => {
        log.push("beginEpoch");
        queue = [];
      },
    },
    stepper,
    resetChallenge: () => {
      log.push("resetChallenge");
      round?.resetCurrent();
    },
    suspendAudio: () => log.push("suspendAudio"),
    available: () => state !== "gate",
    audioPrompt: () => audioPrompt,
    onInput: (input) => log.push(`input ${input}`),
  };
  const pause = createPause(deps);
  const frame = (deltaMS = FRAME_MS) => {
    pause.frame();
    stepper.step(deltaMS);
  };

  machine.request("round");

  return {
    clock,
    pause,
    log,
    frame,
    queue: (event: string) => queue.push(event),
    round: () => round,
    fired: () => fired,
    setState: (next: string) => {
      state = next;
    },
    setAudioPrompt: (shown: boolean) => {
      audioPrompt = shown;
    },
  };
};

describe("createPause", () => {
  it("is ready on the first frame, and pausing stops the clock, shows the prompt and suspends audio", () => {
    const { clock, pause, log, frame } = setUp();

    frame();
    assert.equal(pause.input, "ready");
    log.length = 0;

    pause.pause();
    assert.equal(pause.paused, true);
    assert.equal(clock.paused, true);
    assert.deepEqual(log, ["view true", "suspendAudio", "input paused"]);

    // Idempotent.
    pause.pause();
    assert.equal(log.length, 3);
  });

  it("freezes game time and timers while paused: frames run, nothing moves", () => {
    const { clock, pause, frame, fired } = setUp();

    for (let i = 0; i < 10; i++) {
      frame();
    }

    const now = clock.now;
    const timers = fired();

    pause.pause();

    for (let i = 0; i < 100; i++) {
      frame(100);
    }

    assert.equal(clock.now, now);
    assert.equal(fired(), timers);
  });

  it("leaves the input queue alone while paused: the states don't update", () => {
    const { pause, log, frame, queue } = setUp();

    frame();
    pause.pause();
    queue("advance");
    frame();
    frame();
    assert.ok(!log.some((entry) => entry.startsWith("drained")));
  });

  it("resumes in two steps: the gesture hides the prompt, the next frame drops the queue and resets", () => {
    const { clock, pause, log, frame, queue } = setUp();

    frame();
    pause.pause();
    // The resume tap's own events, and a cancel the hidden tab queued.
    queue("cancel");
    queue("press");
    queue("advance");
    log.length = 0;

    pause.resume();
    assert.equal(pause.paused, false);
    assert.deepEqual(log, ["view false", "input ready"]);
    // Nothing runs before the next frame: still no game time.
    assert.equal(clock.paused, true);

    const now = clock.now;

    frame(100);
    assert.deepEqual(log, ["view false", "input ready", "beginEpoch", "resetChallenge"]);
    assert.equal(clock.paused, false);
    // The stepper's guard frame: the resume frame runs no game time.
    assert.equal(clock.now, now);

    frame(100);
    assert.equal(clock.now, now + 100);
  });

  it("resets the current challenge's progress on resume: a Hold close to its end starts over", () => {
    const { pause, frame, queue, round } = setUp([{ kind: "hold", direction: "up" }]);

    frame();
    queue("press");
    frame();

    for (let elapsed = 0; elapsed < TUNING.holdMs * 0.9; elapsed += FRAME_MS) {
      frame();
    }

    const before = round()?.current?.progress;

    assert.ok(before?.kind === "hold" && before.fraction > 0.8);
    pause.pause();
    pause.resume();
    frame();

    // Released and back to 0, and it never completes on its own.
    assert.deepEqual(round()?.current?.progress, { kind: "hold", held: false, fraction: 0 });

    for (let elapsed = 0; elapsed < TUNING.holdMs * 2; elapsed += FRAME_MS) {
      frame();
    }

    assert.equal(round()?.index, 0);
  });

  it("does a resume only once, and nothing when not paused", () => {
    const { pause, log, frame } = setUp();

    frame();
    log.length = 0;
    pause.resume();
    frame();
    assert.deepEqual(log, []);

    pause.pause();
    pause.resume();
    pause.resume();
    frame();
    frame();
    assert.equal(log.filter((entry) => entry === "resetChallenge").length, 1);
  });

  it("a pause before the resume applied cancels it: the clock never ran in between", () => {
    const { clock, pause, log, frame } = setUp();

    frame();
    pause.pause();
    pause.resume();
    pause.pause();
    log.length = 0;
    frame(100);
    frame(100);
    assert.equal(clock.paused, true);
    assert.equal(pause.paused, true);
    assert.ok(!log.includes("resetChallenge"));
  });

  it("is off at the gate: pause does nothing, and the input follows the state on each frame", () => {
    const { clock, pause, log, frame, setState } = setUp();

    setState("gate");
    frame();
    assert.equal(pause.input, "off");
    pause.pause();
    assert.equal(pause.paused, false);
    assert.equal(clock.paused, false);

    setState("round");
    frame();
    assert.equal(pause.input, "ready");
    // It starts "off": only the change is reported.
    assert.deepEqual(log.filter((entry) => entry.startsWith("input")), ["input ready"]);
  });

  it("pauses when the audio prompt rises while the game runs, once per rise", () => {
    const { pause, frame, setAudioPrompt } = setUp();

    frame();
    setAudioPrompt(true);
    frame();
    assert.equal(pause.paused, true);

    // The resume tap's unlock is still settling: the prompt is up for a frame or two more, and doesn't pause again.
    pause.resume();
    frame();
    frame();
    assert.equal(pause.paused, false);

    setAudioPrompt(false);
    frame();
    setAudioPrompt(true);
    frame();
    assert.equal(pause.paused, true);
  });

  it("doesn't pause again when the resume tap's unlock raises the audio prompt (a hidden tab's resume)", () => {
    const { clock, pause, frame, setAudioPrompt } = setUp();

    frame();
    // Hidden: the lifecycle shows nothing while hidden, nor on the way back while paused.
    pause.pause();
    frame();
    // The tap: the lifecycle's unlock doesn't take, so its prompt comes up before the resume.
    setAudioPrompt(true);
    pause.resume();
    frame();
    frame();
    assert.equal(pause.paused, false);
    assert.equal(clock.paused, false);
  });
});
