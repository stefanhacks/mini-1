import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameClock } from "../../core/clock.ts";
import { StateMachine } from "../../core/state-machine.ts";
import type { ChallengeProgress, ChallengeSpec } from "../challenges/rule.ts";
import { TUNING } from "../challenges/tuning.ts";
import type { Direction } from "../direction.ts";
import { createFrameStepper } from "../frame-step.ts";
import type { WorldSfxKey } from "../../core/audio/audio-engine.ts";
import type { InputEvent } from "../input/pointer-map.ts";
import type { StoryPage } from "../story/cursor.ts";
import { fixedWidthMeasure } from "../story/fake-measure.ts";
import { STORY_PARTS } from "../story/script.ts";
import { TAP_TO_PLAY_AGAIN } from "./ending.ts";
import { createGame, type GameDeps, type GameStateId } from "./index.ts";
import { snapshotSession } from "./session.ts";
import {
  AFTER_ROUND_MS,
  ENDING_MS,
  STORY_DEBOUNCE_MS,
  STORY_PREAMBLE_MS,
  TITLE_AMBIENT,
  TITLE_CUES,
  TYPE_MS_PER_CHAR,
  WHISPER_MS_PER_CHAR,
  TITLE_DEBOUNCE_MS,
  TRANSITION_MS,
} from "./timings.ts";
import { AMBIENT_SALT, TAP_TO_BEGIN } from "./title.ts";
import { ambientDelay } from "./cues.ts";
import { createRng, type Rng } from "../challenges/rng.ts";
import { drawStrike, LIGHTNING_SALT, type Strike, type StrikeKind } from "../lightning.ts";
import { LOAD_FAILED } from "./gate.ts";
import type { Backdrop, Boat, CueEvent, GateScreen, Paging, SceneView } from "./types.ts";

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
  logo = false;
  credits = false;
  /** Every strike, drawn as the real scene draws it. */
  strikes: Strike[] = [];
  prompt: string | null = null;
  page: StoryPage | null = null;
  /** The characters of `page` shown: Infinity for all. */
  revealed = Infinity;
  challenge: ChallengeSpec | null = null;
  progress: ChallengeProgress | null = null;
  backdrops = new Set<Backdrop>();
  boat: Boat = "whole";
  kraken = false;
  black = false;
  paging: Paging = { linesPerPage: 2, measure: fixedWidthMeasure(30) };

  reset() {
    this.logo = false;
    this.credits = false;
    this.prompt = null;
    this.page = null;
    this.revealed = Infinity;
    this.challenge = null;
    this.progress = null;
    this.backdrops.clear();
    this.boat = "whole";
    this.kraken = false;
    this.black = false;
  }

  /** Logo and credits both. */
  get title() {
    return this.logo && this.credits;
  }

  setTitle(visible: boolean) {
    this.logo = visible;
    this.credits = visible;
  }

  setCredits(visible: boolean) {
    this.credits = visible;
  }

  // The real scene shows the logo at the flash's peak, 250 ms later; the fake shows it at once.
  strike(kind: StrikeKind, rng: Rng) {
    this.strikes.push(drawStrike(kind, rng));

    if (kind === "title-reveal") {
      this.logo = true;
    }
  }

  setPrompt(text: string | null) {
    this.prompt = text;
  }

  setStoryPage(page: StoryPage | null, revealed = Infinity) {
    this.page = page;
    this.revealed = revealed;
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

// The gate's loader: every `load` call gets its own deferred, settled by the test (or at once with `auto`).
class FakeLoader {
  calls: ReturnType<typeof deferred>[] = [];
  progress: ((fraction: number) => void)[] = [];
  fontReady = true;
  auto: boolean;

  constructor(auto: boolean) {
    this.auto = auto;
  }

  load(onProgress: (fraction: number) => void) {
    const call = deferred();

    this.calls.push(call);
    this.progress.push(onProgress);

    if (this.auto) {
      onProgress(1);
      call.resolve();
    }

    return call.promise;
  }

  get last() {
    const call = this.calls.at(-1);

    if (call === undefined) {
      throw new Error("load was never called");
    }

    return call;
  }
}

class FakeGateView {
  screen: GateScreen | null = null;

  show(screen: GateScreen | null) {
    this.screen = screen;
  }
}

class FakeAudio {
  log: string[] = [];
  sfx: string[] = [];
  parts: (number | null)[] = [];

  unlock() {
    this.log.push("unlock");
  }

  startMusic() {
    this.log.push("startMusic");
  }

  playSfx(key: WorldSfxKey) {
    this.sfx.push(key);
  }

  setStoryPart(part: number | null) {
    this.parts.push(part);
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

const timerCount = (clock: GameClock) => clock.pendingTimers;

const setup = ({ auto = true } = {}) => {
  const clock = new GameClock();
  const loader = new FakeLoader(auto);
  const gateView = new FakeGateView();
  const audio = new FakeAudio();
  const scene = new FakeScene();
  const input = new FakeInput();
  const pad = new FakePad();
  let seed = 41;
  // Every cue with the clock's time, as main.ts logs them.
  const cues: (CueEvent & { time: number })[] = [];
  const deps: GameDeps = {
    loader,
    gateView,
    audio,
    onCue: (event) => cues.push({ ...event, time: clock.now }),
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

  return { clock, scene, input, pad, game, machine, frame, wait, loader, gateView, audio, cues };
};

type Setup = ReturnType<typeof setup>;

/** Loads, then taps to begin as the router would: the activation inside the gesture, then the advance. */
const toTitle = async (t: Setup) => {
  await settle();
  t.frame();
  assert.equal(t.game.gate.phase, "ready");
  t.game.gate.activate();
  t.input.advance();
  t.frame();
  assert.equal(t.machine.current, "title");
};

/**
 * Reads the current story part to its end, a page per advance: a tap completes a page still typing, then the next one,
 * after the debounce, advances.
 */
const readPart = (t: Setup) => {
  let pages = 0;

  while (t.machine.current === "story") {
    if (t.game.session.typewriter?.done === false) {
      t.input.advance();
      t.frame();
    }

    t.wait(STORY_DEBOUNCE_MS);
    t.input.advance();
    t.frame();
    pages += 1;
    assert.ok(pages < 100, "the story never ends");
  }

  return pages;
};

/** Reads one story page: completes it if it still types, then advances after the debounce. */
const readPage = (t: Setup) => {
  const page = t.scene.page;

  if (t.game.session.typewriter?.done === false) {
    t.input.advance();
    t.frame();
  }

  t.wait(STORY_DEBOUNCE_MS);
  t.input.advance();
  t.frame();
  assert.notEqual(t.scene.page, page);
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
  it("shows progress and the warning while loading, then the prompt once loaded", async () => {
    const t = setup({ auto: false });

    assert.deepEqual(t.gateView.screen, { progress: 0, warning: true, prompt: null });
    t.loader.progress[0](0.4);
    t.frame();
    assert.deepEqual(t.gateView.screen, { progress: 0.4, warning: true, prompt: null });

    t.loader.last.resolve();
    await settle();
    assert.equal(t.game.gate.phase, "loading");
    t.frame();
    assert.equal(t.game.gate.phase, "ready");
    assert.deepEqual(t.gateView.screen, { progress: null, warning: true, prompt: TAP_TO_BEGIN });
    assert.equal(t.scene.black, true);
    assert.equal(t.machine.current, "gate");
  });

  it("hides its texts until the font is in", () => {
    const t = setup({ auto: false });

    t.loader.fontReady = false;
    t.frame();
    assert.deepEqual(t.gateView.screen, { progress: 0, warning: false, prompt: null });
    t.loader.fontReady = true;
    t.frame();
    assert.equal(t.gateView.screen?.warning, true);
  });

  it("drops taps made while loading, and goes to title on a tap once ready", async () => {
    const t = setup({ auto: false });

    t.input.advance();
    t.frame();
    t.input.advance();
    t.loader.last.resolve();
    await settle();
    t.frame();
    assert.equal(t.machine.current, "gate");
    assert.deepEqual(t.input.queue, []);

    t.frame();
    assert.equal(t.machine.current, "gate");
    t.input.advance();
    t.frame();
    assert.equal(t.machine.current, "title");
    assert.equal(t.gateView.screen, null);
    assert.equal(t.scene.black, false);
  });

  it("unlocks audio and starts the music only on the begin tap", async () => {
    const t = setup({ auto: false });

    t.game.gate.activate();
    assert.deepEqual(t.audio.log, []);

    t.loader.last.resolve();
    await settle();
    t.frame();
    t.game.gate.activate();
    assert.deepEqual(t.audio.log, ["unlock", "startMusic"]);

    t.input.advance();
    t.frame();
    assert.equal(t.machine.current, "title");
    t.game.gate.activate();
    assert.deepEqual(t.audio.log, ["unlock", "startMusic"]);
  });

  it("shows the failure, and a tap retries the load", async () => {
    const t = setup({ auto: false });

    t.loader.last.reject(new Error("load failed"));
    await settle();
    t.frame();
    assert.equal(t.game.gate.phase, "failed");
    assert.deepEqual(t.gateView.screen, { progress: null, warning: true, prompt: LOAD_FAILED });

    t.game.gate.activate();
    assert.deepEqual(t.audio.log, []);
    t.input.advance();
    t.frame();
    assert.equal(t.loader.calls.length, 2);
    assert.equal(t.game.gate.phase, "loading");
    assert.deepEqual(t.gateView.screen, { progress: 0, warning: true, prompt: null });

    t.loader.last.resolve();
    await settle();
    t.frame();
    assert.equal(t.game.gate.phase, "ready");
  });

  it("shows the failure line even without the font", async () => {
    const t = setup({ auto: false });

    t.loader.fontReady = false;
    t.loader.last.reject(new Error("font failed"));
    await settle();
    t.frame();
    assert.deepEqual(t.gateView.screen, { progress: null, warning: true, prompt: LOAD_FAILED });
  });

  it("waits while the clock is paused", async () => {
    const t = setup();

    await settle();
    t.clock.paused = true;
    t.frame();
    assert.equal(t.game.gate.phase, "loading");

    t.clock.paused = false;
    t.frame();
    assert.equal(t.game.gate.phase, "ready");
  });

  it("does nothing on activation once it was left", async () => {
    const t = setup();

    await settle();
    t.frame();
    t.machine.request("ending");
    t.game.gate.activate();
    assert.deepEqual(t.audio.log, []);
    assert.equal(t.loader.calls.length, 1);
  });
});

describe("title", () => {
  it("starts a new game, shows the title frame and ignores presses", async () => {
    const t = setup();

    await toTitle(t);
    assert.equal(t.game.session.games, 1);
    assert.equal(t.game.session.seed, 42);
    assert.equal(t.game.session.rounds.length, 3);
    // The logo waits for its reveal strike.
    assert.equal(t.scene.logo, false);
    assert.equal(t.scene.credits, true);
    assert.equal(t.scene.prompt, TAP_TO_BEGIN);
    assert.equal(t.pad.visible, false);

    t.input.press("up");
    t.frame();
    assert.equal(t.machine.current, "title");

    // A tap within the debounce is dropped (the stopgap until M4 gates the prompt behind the intro).
    t.input.advance();
    t.frame();
    assert.equal(t.machine.current, "title");

    t.wait(TITLE_DEBOUNCE_MS);
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
    t.wait(TITLE_DEBOUNCE_MS);
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

  /** From Title to part 0's first page, just shown. */
  const toFirstPage = async () => {
    const t = setup();

    await toTitle(t);
    t.wait(TITLE_DEBOUNCE_MS);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS);
    assert.equal(t.game.session.phase, "page");

    return t;
  };

  it("types a page at about a character a frame, label first", async () => {
    const t = await toFirstPage();
    const page = t.scene.page;
    const typewriter = t.game.session.typewriter;

    assert.ok(page !== null && typewriter !== null);
    assert.ok(t.scene.revealed >= 1 && t.scene.revealed < 10, `just begun: ${t.scene.revealed}`);
    assert.ok(page.text.length > 40);

    const before = t.scene.revealed;

    t.wait(20 * FRAME_MS);
    // 20 frames of 16 ms: 320 ms at 1000/60 ms a character is 19.2 characters, 19 or 20 with the time carried in.
    assert.ok([19, 20].includes(t.scene.revealed - before), `typed ${t.scene.revealed - before}`);
    assert.equal(t.scene.page, page);

    t.wait(page.text.length * TYPE_MS_PER_CHAR);
    assert.equal(t.scene.revealed, page.text.length);
    assert.equal(snapshotSession(t.game.session).page?.typed, true);
  });

  it("completes the page on a tap while typing, and advances on the next tap after the debounce", async () => {
    const t = await toFirstPage();
    const first = t.scene.page;

    assert.ok(first !== null);
    t.input.advance();
    t.frame();
    assert.equal(t.scene.page, first, "the tap completes, it doesn't advance");
    assert.equal(t.scene.revealed, first.text.length);
    assert.equal(snapshotSession(t.game.session).page?.page, 0);

    t.wait(STORY_DEBOUNCE_MS - 2 * FRAME_MS);
    t.input.advance();
    t.frame();
    assert.equal(t.scene.page, first, "a tap within the debounce after completion is dropped");

    t.wait(2 * FRAME_MS);
    t.input.advance();
    t.input.advance();
    t.frame();
    assert.notEqual(t.scene.page, first);
    assert.equal(snapshotSession(t.game.session).page?.page, 1, "a double tap shows one page, not two");
    assert.ok(t.scene.revealed < (t.scene.page?.text.length ?? 0), "the next page types again");
  });

  it("starts the debounce when typing ends on its own", async () => {
    const t = await toFirstPage();
    const first = t.scene.page;

    assert.ok(first !== null);
    t.wait(first.text.length * TYPE_MS_PER_CHAR);
    assert.equal(snapshotSession(t.game.session).page?.typed, true);
    t.input.advance();
    t.frame();
    assert.equal(t.scene.page, first, "a tap right after typing ended is within the debounce");

    t.wait(STORY_DEBOUNCE_MS);
    t.input.advance();
    t.frame();
    assert.notEqual(t.scene.page, first);
  });

  it("types a whisper at 100 ms a character, and stops with the clock", async () => {
    const t = await toFirstPage();

    // Part 0's fourth line is the first whisper.
    while (t.scene.page?.whisper !== true) {
      readPage(t);
    }

    const whisper = t.scene.page;
    const start = t.scene.revealed;

    t.wait(10 * WHISPER_MS_PER_CHAR);
    assert.equal(t.scene.revealed - start, 10);

    t.clock.paused = true;
    t.wait(1000);
    assert.equal(t.scene.revealed - start, 10, "paused game time types nothing");
    t.clock.paused = false;

    t.wait(whisper.text.length * WHISPER_MS_PER_CHAR);
    assert.equal(t.scene.revealed, whisper.text.length);
  });

  it("keeps what shows when the layout changes mid-typing, and types on", async () => {
    const t = await toFirstPage();

    t.wait(10 * FRAME_MS);

    const shown = t.scene.revealed;

    t.scene.paging = { linesPerPage: 10, measure: fixedWidthMeasure(100) };
    t.frame();
    assert.equal(t.game.session.cursor?.pageCount, 1);
    assert.equal(t.scene.page?.text, "[First Mate]: \"Captain! This wind is too strong! We're gonna lose the sails!\"");
    assert.ok(t.scene.revealed >= shown && t.scene.revealed <= shown + 1, "never typed again from 0");
    assert.equal(snapshotSession(t.game.session).page?.typed, false);

    t.wait(10 * FRAME_MS);
    assert.ok(t.scene.revealed > shown + 5, "typing goes on");
  });

  it("completes the page when a relayout cuts it to what already shows", async () => {
    const t = await toFirstPage();

    t.wait(30 * FRAME_MS);
    assert.ok(t.scene.revealed > 20);
    t.scene.paging = { linesPerPage: 1, measure: fixedWidthMeasure(16) };
    t.frame();

    const page = t.scene.page;

    assert.ok(page !== null && page.text.length <= 16);
    assert.equal(t.scene.revealed, page.text.length);
    assert.equal(snapshotSession(t.game.session).page?.typed, true);
    t.wait(STORY_DEBOUNCE_MS);
    t.input.advance();
    t.frame();
    assert.notEqual(t.scene.page, page, "one tap advances a page completed by the relayout");
  });

  it("pages again when the paging changes, from the current page", async () => {
    const t = setup();

    await toTitle(t);
    t.wait(TITLE_DEBOUNCE_MS);
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
      t.wait(TITLE_DEBOUNCE_MS);
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
    t.wait(TITLE_DEBOUNCE_MS);
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
    t.wait(TITLE_DEBOUNCE_MS);
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

describe("cues", () => {
  const cuesOf = (t: Setup, state: string) =>
    t.cues.filter((cue) => cue.state === state).map(({ name, at }) => ({ name, at }));

  /** The ambient strikes' times on Title (ms from its enter), as the original's timer gives them for `seed`. */
  const expectedAmbient = (seed: number, count: number) => {
    const rng = createRng((seed ^ AMBIENT_SALT) >>> 0);
    const times: number[] = [];
    let at = TITLE_AMBIENT.from + ambientDelay(rng, TITLE_AMBIENT.first);

    for (let i = 0; i < count; i++) {
      times.push(at);
      at += ambientDelay(rng, TITLE_AMBIENT.next);
    }

    return times;
  };

  it("draws the ambient delays in whole seconds: 5–7 s after the intro, then 7–10 s apart", () => {
    const rng = createRng(7);
    const firsts = new Set<number>();
    const nexts = new Set<number>();

    for (let i = 0; i < 500; i++) {
      firsts.add(ambientDelay(rng, TITLE_AMBIENT.first));
      nexts.add(ambientDelay(rng, TITLE_AMBIENT.next));
    }

    assert.deepEqual([...firsts].sort((a, b) => a - b), [5000, 6000, 7000]);
    assert.deepEqual([...nexts].sort((a, b) => a - b), [7000, 8000, 9000, 10000]);
  });

  it("plays Title's intro strikes, then ambient lightning from the game's seed, until Title is left", async () => {
    const t = setup();

    await toTitle(t);

    const ambient = expectedAmbient(t.game.session.seed, 3);

    t.wait((ambient[2] ?? 0) + FRAME_MS);
    assert.deepEqual(cuesOf(t, "title"), [
      { name: "lightning", at: 2000 },
      { name: "lightning", at: 3250 },
      { name: "title-reveal", at: 5250 },
      ...ambient.map((at) => ({ name: "lightning", at })),
    ]);
    assert.deepEqual(t.audio.sfx, Array(6).fill("thunderclap"));

    const fired = t.cues.length;

    t.input.advance();
    t.frame();
    assert.equal(t.machine.current, "story");
    t.wait(30_000);
    assert.equal(cuesOf(t, "title").length, fired, "no Title cue after Title");
  });

  it("strikes on every lightning and title-reveal cue, drawn from the game's lightning stream", async () => {
    const t = setup();

    await toTitle(t);

    const { seed } = t.game.session;

    t.wait(TITLE_CUES[1].at + FRAME_MS);
    assert.equal(t.scene.logo, false, "no logo before the reveal");
    t.wait(TITLE_CUES[2].at - TITLE_CUES[1].at);
    assert.equal(t.scene.logo, true, "the reveal shows the logo");

    t.input.advance();
    t.frame();
    assert.equal(t.scene.logo, false);
    t.wait(STORY_PREAMBLE_MS);

    // The same draws, in the same order, from seed ^ LIGHTNING_SALT, apart from the rounds' and the ambient's.
    const rng = createRng((seed ^ LIGHTNING_SALT) >>> 0);
    const kinds: StrikeKind[] = ["lightning", "lightning", "title-reveal", "lightning"];

    assert.deepEqual(t.scene.strikes, kinds.map((kind) => drawStrike(kind, rng)));
    assert.deepEqual(cuesOf(t, "story"), [{ name: "lightning", at: 1250 }]);
  });

  it("draws the same strikes for the same seed and different ones for another game", async () => {
    const strikesOf = async () => {
      const t = setup();

      await toTitle(t);
      t.wait(TITLE_CUES[2].at + FRAME_MS);

      return t.scene.strikes;
    };
    const first = await strikesOf();

    assert.deepEqual(await strikesOf(), first);
    assert.equal(first.length, 3);

    const t = setup();

    await toTitle(t);
    t.wait(TITLE_DEBOUNCE_MS);
    // Replay to game 2 the quick way: a new Title enter starts a new game with the next seed.
    t.machine.request("title");
    t.frame();
    assert.equal(t.game.session.games, 2);
    t.wait(TITLE_CUES[2].at + FRAME_MS);
    assert.notDeepEqual(t.scene.strikes, first);
  });

  it("draws different ambient times for a different game", () => {
    assert.notDeepEqual(expectedAmbient(42, 4), expectedAmbient(43, 4));
  });

  it("drops Title's pending cues when it is left early", async () => {
    const t = setup();

    await toTitle(t);
    t.wait(1000);
    t.input.advance();
    t.frame();
    t.wait(STORY_PREAMBLE_MS);
    assert.deepEqual(cuesOf(t, "title"), []);
    assert.deepEqual(cuesOf(t, "story"), [{ name: "lightning", at: 1250 }]);
    assert.deepEqual(t.audio.sfx, ["thunderclap"]);
  });

  it("keeps one Title timer pending at any time, so the leak check can read it whenever", async () => {
    const t = setup();

    await toTitle(t);

    for (let i = 0; i < 40; i++) {
      assert.equal(t.clock.pendingTimers, 1);
      t.wait(1000);
    }
  });

  it("waits while the clock is paused", async () => {
    const t = setup();

    await toTitle(t);
    t.wait(1900);
    t.clock.paused = true;
    t.wait(1000);
    assert.deepEqual(t.cues, []);

    t.clock.paused = false;
    t.wait(200);
    assert.deepEqual(cuesOf(t, "title"), [{ name: "lightning", at: 2000 }]);
  });

  it("strikes in part 0's preamble and each Transition, roars in the Ending, and sets the music per part", async () => {
    const t = setup();

    await toTitle(t);

    for (let game = 1; game <= 2; game++) {
      t.wait(TITLE_DEBOUNCE_MS);
      t.cues.length = 0;
      t.input.advance();
      t.frame();
      assert.deepEqual(t.audio.parts.slice(-1), [0], "Story 0 asks for part 0's music, on replay too");
      t.wait(STORY_PREAMBLE_MS);

      for (let part = 0; part < STORY_PARTS.length; part++) {
        assert.equal(t.audio.parts.at(-1), part);
        readPart(t);

        if (part < STORY_PARTS.length - 1) {
          playRound(t);
        }
      }

      t.wait(ENDING_MS.card);
      assert.deepEqual(t.cues.map(({ name, state, at }) => ({ name, state, at })), [
        { name: "lightning", state: "story", at: 1250 },
        ...Array.from({ length: 3 }, () => ({ name: "lightning", state: "transition", at: 167 })),
        { name: "kraken", state: "ending", at: 1500 },
      ]);
      assert.equal(t.audio.sfx.at(-1), "kraken");

      t.input.advance();
      t.frame();
      assert.equal(t.machine.current, "title");
    }

    assert.deepEqual(t.audio.parts, [0, 1, 2, 3, 0, 1, 2, 3], "Title and the Ending leave the music alone");
  });
});
