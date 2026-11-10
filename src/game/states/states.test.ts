import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../../core/clock.ts";
import { StateMachine } from "../../core/state-machine.ts";
import type { ChallengeProgress, ChallengeSpec } from "../challenges/rule.ts";
import { TUNING } from "../challenges/tuning.ts";
import type { Direction } from "../direction.ts";
import { createFrameStepper } from "../frame-step.ts";
import type { InputEvent } from "../input/pointer-map.ts";
import type { StoryPage } from "../story/cursor.ts";
import { fixedWidthMeasure } from "../story/fake-measure.ts";
import { STORY_PARTS } from "../story/script.ts";
import { TAP_TO_PLAY_AGAIN } from "./ending.ts";
import { createGame, type GameDeps, type GameStateId } from "./index.ts";
import { snapshotSession } from "./session.ts";
import { AFTER_ROUND_MS, ENDING_MS, STORY_DEBOUNCE_MS, STORY_PREAMBLE_MS, TRANSITION_MS } from "./timings.ts";
import { TAP_TO_BEGIN } from "./title.ts";
import type { Backdrop, Boat, Paging, SceneView } from "./types.ts";

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

class FakeScene implements SceneView {
  title = false;
  prompt: string | null = null;
  page: StoryPage | null = null;
  challenge: ChallengeSpec | null = null;
  progress: ChallengeProgress | null = null;
  backdrops = new Set<Backdrop>();
  boat: Boat = "whole";
  kraken = false;
  black = false;
  paging: Paging = { linesPerPage: 2, measure: fixedWidthMeasure(30) };

  reset() {
    this.title = false;
    this.prompt = null;
    this.page = null;
    this.challenge = null;
    this.progress = null;
    this.backdrops.clear();
    this.boat = "whole";
    this.kraken = false;
    this.black = false;
  }

  setTitle(visible: boolean) {
    this.title = visible;
  }

  setPrompt(text: string | null) {
    this.prompt = text;
  }

  setStoryPage(page: StoryPage | null) {
    this.page = page;
  }

  setChallenge(spec: ChallengeSpec | null) {
    this.challenge = spec;
  }

  setProgress(progress: ChallengeProgress | null) {
    this.progress = progress;
  }

  setBackdrop(backdrop: Backdrop, visible: boolean) {
    if (visible) {
      this.backdrops.add(backdrop);
    } else {
      this.backdrops.delete(backdrop);
    }
  }

  setBoat(boat: Boat) {
    this.boat = boat;
  }

  setKraken(visible: boolean) {
    this.kraken = visible;
  }

  setBlack(visible: boolean) {
    this.black = visible;
  }
}

class FakeInput {
  queue: InputEvent[] = [];
  epochs = 0;

  drain() {
    const events = this.queue;

    this.queue = [];

    return events;
  }

  beginEpoch() {
    this.epochs += 1;
    this.queue = [];
  }

  advance() {
    this.queue.push({ kind: "advance" });
  }

  press(dir: Direction) {
    this.queue.push({ kind: "press", dir });
  }

  release(dir: Direction) {
    this.queue.push({ kind: "release", dir });
  }
}

class FakePad {
  visible = false;
  dimmed = false;
  hint: Direction | null = null;

  setVisible(visible: boolean) {
    this.visible = visible;
  }

  setDimmed(dimmed: boolean) {
    this.dimmed = dimmed;
  }

  setHint(dir: Direction | null) {
    this.hint = dir;
  }
}

// The clock's live timers. `timers` is private to TypeScript only.
const timerCount = (clock: GameClock) => (clock as unknown as { timers: Map<number, unknown> }).timers.size;

const setup = (loaded: Promise<unknown> = Promise.resolve()) => {
  const clock = new GameClock();
  const scene = new FakeScene();
  const input = new FakeInput();
  const pad = new FakePad();
  let seed = 41;
  const deps: GameDeps = {
    loaded,
    clock,
    input,
    pad,
    scene: () => scene,
    nextSeed: () => ++seed,
    tuning: TUNING,
  };
  const game = createGame(deps);
  const machine = new StateMachine<GameStateId>(clock, game.states);

  machine.request("gate");

  const frame = (ms = FRAME_MS) => machine.update(ms);
  const wait = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      frame();
    }
  };

  return { clock, scene, input, pad, game, machine, frame, wait };
};

type Setup = ReturnType<typeof setup>;

const toTitle = async (t: Setup) => {
  await settle();
  t.frame();
  assert.equal(t.machine.current, "title");
};

/** Reads the current story part to its end, a page per advance, waiting out the debounce each time. */
const readPart = (t: Setup) => {
  let pages = 0;

  while (t.machine.current === "story") {
    t.wait(STORY_DEBOUNCE_MS);
    t.input.advance();
    t.frame();
    pages += 1;
    assert.ok(pages < 100, "the story never ends");
  }

  return pages;
};

/** Answers the current challenge the way a player would, a frame per input. */
const answer = (t: Setup) => {
  const spec = t.scene.challenge;

  if (spec === null) {
    throw new Error("no challenge shown");
  }

  if (spec.kind === "sequence") {
    for (const dir of spec.directions) {
      t.input.press(dir);
      t.input.release(dir);
      t.frame();
    }
  } else if (spec.kind === "hold") {
    t.input.press(spec.direction);
    t.wait(TUNING.holdMs + FRAME_MS);
    t.input.release(spec.direction);
    t.frame();
  } else {
    for (let i = 0; i < TUNING.manyPresses; i++) {
      t.input.press(spec.direction);
      t.input.release(spec.direction);
      t.frame();
    }
  }
};

const playRound = (t: Setup) => {
  t.wait(TRANSITION_MS);
  assert.equal(t.machine.current, "round");

  while (t.game.session.phase === "play") {
    answer(t);
  }

  assert.equal(t.game.session.phase, "won");
  t.wait(AFTER_ROUND_MS);
  assert.equal(t.machine.current, "story");
};

describe("gate", () => {
  it("waits for the scene, then requests title on the next frame", async () => {
    const load = deferred();
    const t = setup(load.promise);

    await settle();
    t.frame();
    assert.equal(t.machine.current, "gate");

    load.resolve();
    await settle();
    assert.equal(t.machine.current, "gate");

    t.frame();
    assert.equal(t.machine.current, "title");
  });

  it("waits while the clock is paused", async () => {
    const t = setup();

    await settle();
    t.clock.paused = true;
    t.frame();
    assert.equal(t.machine.current, "gate");

    t.clock.paused = false;
    t.frame();
    assert.equal(t.machine.current, "title");
  });

  it("stays on gate when loading fails, and drains input meanwhile", async () => {
    const t = setup(Promise.reject(new Error("load failed")));

    await settle();
    t.input.advance();
    t.frame();
    assert.equal(t.machine.current, "gate");
    assert.deepEqual(t.input.queue, []);
  });

  it("requests nothing once it was left before loading finished", async () => {
    const load = deferred();
    const t = setup(load.promise);

    t.machine.request("ending");
    load.resolve();
    await settle();
    t.frame();
    assert.equal(t.machine.current, "ending");
  });
});

describe("title", () => {
  it("starts a new game, shows the title frame and ignores presses", async () => {
    const t = setup();

    await toTitle(t);
    assert.equal(t.game.session.games, 1);
    assert.equal(t.game.session.seed, 42);
    assert.equal(t.game.session.rounds.length, 3);
    assert.equal(t.scene.title, true);
    assert.equal(t.scene.prompt, TAP_TO_BEGIN);
    assert.equal(t.pad.visible, false);

    t.input.press("up");
    t.frame();
    assert.equal(t.machine.current, "title");

    t.input.advance();
    t.frame();
    assert.equal(t.machine.current, "story");
    assert.equal(t.scene.title, false);
    assert.equal(t.scene.prompt, null);
  });
});

describe("story", () => {
  it("waits out part 0's preamble with the text box hidden, dropping taps", async () => {
    const t = setup();

    await toTitle(t);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS - 2 * FRAME_MS);
    t.input.advance();
    t.frame();
    assert.equal(t.scene.page, null);
    assert.equal(t.game.session.phase, "preamble");

    t.wait(2 * FRAME_MS);
    assert.equal(t.game.session.phase, "page");
    assert.equal((t.scene.page as StoryPage | null)?.text.startsWith("[First Mate]: "), true);
  });

  it("ignores advances within the debounce after a page appears", async () => {
    const t = setup();

    await toTitle(t);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS);

    const first = t.scene.page;

    t.input.advance();
    t.frame();
    assert.equal(t.scene.page, first);

    t.wait(STORY_DEBOUNCE_MS);
    t.input.advance();
    t.input.advance();
    t.frame();
    assert.notEqual(t.scene.page, first);
    assert.equal(snapshotSession(t.game.session).page?.page, 1, "a double tap shows one page, not two");
  });

  it("pages again when the paging changes, from the current page", async () => {
    const t = setup();

    await toTitle(t);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS);

    const before = t.game.session.cursor?.pageCount ?? 0;

    t.scene.paging = { linesPerPage: 10, measure: fixedWidthMeasure(100) };
    t.frame();
    assert.ok(before > 1);
    assert.equal(t.game.session.cursor?.pageCount, 1);
    assert.equal(t.scene.page?.text, "[First Mate]: \"Captain! This wind is too strong! We're gonna lose the sails!\"");
  });
});

describe("a full game", () => {
  it("plays from Title through every part and round to the Ending, then plays again without leaks", async () => {
    const t = setup();

    await toTitle(t);

    const baseline = timerCount(t.clock);

    for (let game = 1; game <= 3; game++) {
      assert.equal(t.game.session.games, game);
      t.input.advance();
      t.frame();
      t.wait(STORY_PREAMBLE_MS);

      for (let part = 0; part < STORY_PARTS.length; part++) {
        assert.equal(t.machine.current, "story");
        assert.equal(t.game.session.part, part);
        assert.equal(t.pad.visible, false);
        assert.equal(t.scene.black, part === STORY_PARTS.length - 1, "the last part is read on black");
        readPart(t);

        if (part === STORY_PARTS.length - 1) {
          break;
        }

        assert.equal(t.machine.current, "transition");
        assert.deepEqual([t.pad.visible, t.pad.dimmed], [true, true]);
        playRound(t);
        assert.equal(t.scene.backdrops.has("pillars"), part >= 0);
        assert.equal(t.scene.backdrops.has("tentacles"), part >= 1);
      }

      assert.equal(t.machine.current, "ending");
      assert.equal(t.scene.boat, "broken");
      assert.equal(t.scene.black, false);
      assert.equal(t.pad.visible, false);

      t.wait(ENDING_MS.kraken);
      assert.equal(t.scene.kraken, true);
      t.wait(ENDING_MS.black - ENDING_MS.kraken);
      assert.equal(t.scene.black, true);
      t.wait(ENDING_MS.sea - ENDING_MS.black);
      assert.deepEqual(
        [t.scene.black, t.scene.kraken, t.scene.boat, t.scene.backdrops.size],
        [false, false, "none", 0],
      );

      // A tap before the card is dropped.
      t.input.advance();
      t.frame();
      assert.equal(t.machine.current, "ending");

      t.wait(ENDING_MS.card - ENDING_MS.sea);
      assert.equal(t.scene.title, true);
      assert.equal(t.scene.prompt, TAP_TO_PLAY_AGAIN);

      t.input.advance();
      t.frame();
      assert.equal(t.machine.current, "title");
      assert.equal(t.scene.boat, "whole");
      assert.equal(timerCount(t.clock), baseline, `no timer left behind after game ${game}`);
    }

    assert.deepEqual([t.game.session.games, t.game.session.seed], [4, 45], "each game has a new seed");
  });
});

describe("round", () => {
  const toRound = async () => {
    const t = setup();

    await toTitle(t);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS);
    readPart(t);
    t.wait(TRANSITION_MS);
    assert.equal(t.machine.current, "round");

    return t;
  };

  it("shows the pad undimmed, drops advances, and resets a Sequence on a wrong press", async () => {
    const t = await toRound();

    assert.deepEqual([t.pad.visible, t.pad.dimmed], [true, false]);

    while (t.scene.challenge?.kind !== "sequence") {
      answer(t);
    }

    const [first, second] = t.scene.challenge.directions;
    const wrong = (["up", "down", "left", "right"] as const).find((dir) => dir !== first && dir !== second);

    if (wrong === undefined) {
      throw new Error("unreachable");
    }

    t.input.advance();
    t.input.press(first);
    t.frame();
    assert.deepEqual(t.scene.progress, { kind: "sequence", pointer: 1, length: 3 });

    t.input.press(wrong);
    t.frame();
    assert.deepEqual(t.scene.progress, { kind: "sequence", pointer: 0, length: 3 });
  });

  it("hints the direction of a Hold and releases it on cancel", async () => {
    const t = await toRound();

    while (t.scene.challenge?.kind !== "hold") {
      answer(t);
    }

    const { direction } = t.scene.challenge;

    assert.equal(t.pad.hint, direction);
    t.input.press(direction);
    t.wait(TUNING.holdMs / 2);
    assert.equal(t.scene.progress?.kind === "hold" && t.scene.progress.held, true);

    t.input.queue.push({ kind: "cancel" });
    t.frame();
    assert.deepEqual(t.scene.progress, { kind: "hold", held: false, fraction: 0 });
  });
});

describe("frame stepper", () => {
  const holdAlmostDone = async () => {
    const t = setup();

    await toTitle(t);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS);
    readPart(t);
    t.wait(TRANSITION_MS);

    while (t.scene.challenge?.kind !== "hold") {
      answer(t);
    }

    const { direction } = t.scene.challenge;

    t.input.press(direction);
    t.frame();
    t.wait(TUNING.holdMs - 50);
    // The tab hides here: the router queues a cancel, and no frame runs until it is visible again.
    t.input.queue.push({ kind: "cancel" });

    return t;
  };

  it("without the guard, the first resumed tick completes a Hold that was let go", async () => {
    const t = await holdAlmostDone();
    const stepper = createFrameStepper(t.machine);

    stepper.step(100);
    assert.notEqual(t.scene.challenge?.kind, "hold");
  });

  it("with the guard, the queued cancel is applied before any time passes", async () => {
    const t = await holdAlmostDone();
    const stepper = createFrameStepper(t.machine);
    const before = t.clock.now;

    stepper.resume();
    stepper.step(100);
    assert.equal(t.clock.now, before, "the resumed frame adds no time");
    assert.equal(t.scene.challenge?.kind, "hold");
    assert.deepEqual(t.scene.progress, { kind: "hold", held: false, fraction: 0 });

    stepper.step(100);
    assert.equal(t.clock.now, before + 100);
    assert.equal(t.scene.challenge?.kind, "hold");
  });
});
