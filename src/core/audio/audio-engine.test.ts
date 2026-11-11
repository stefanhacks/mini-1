// The engine's scheduling against a fake AudioContext: a clock that only moves on `advance`, sources that record
// start/stop, params that record their automation calls. Trimmed from the M3 audio review's fuzz harness.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, describe, it } from "node:test";
import type { AudioEngine } from "./audio-engine.ts";

// The manifest imports Vite `?url` assets; under node each becomes its file name.
registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!specifier.includes("?url")) {
      return nextResolve(specifier, context);
    }

    const name = specifier.split("?")[0]?.split("/").pop() ?? "";

    const source = `export default ${JSON.stringify(name)}`;

    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  },
});

const { createAudioEngine } = await import("./audio-engine.ts");

// Decoded lengths (offset 0.1 + clip + padding), as Chromium decodes the real files.
const DURATIONS: Readonly<Record<string, number>> = {
  "bgm01.m4a": 9.8,
  "bgm02.m4a": 20.525,
  "overlay_phase02.m4a": 9.8,
  "overlay_phase03.m4a": 9.8,
  "overlay_phase04.m4a": 7.276,
  "thunderclap.m4a": 2.845,
  "kraken.m4a": 7.312,
  "creak_loop.m4a": 1.8,
  "haul_tick.m4a": 0.07,
};
const OVERLAYS = new Set(["overlay_phase02.m4a", "overlay_phase03.m4a", "overlay_phase04.m4a", "bgm02.m4a"]);
const BAR = 9.6;
const LEAD = 0.1;

type Call = readonly [string, ...number[]];
type ResumeMode = "run" | "stay" | "hang";

interface World {
  t: number;
  state: string;
  resumeMode: ResumeMode;
  sources: FakeSource[];
  gains: FakeGain[];
  ended: { at: number; source: FakeSource }[];
  failUrls: Set<string>;
  storage: Map<string, string>;
}

let world: World;

class FakeParam {
  value: number;
  readonly calls: Call[] = [];

  constructor(value: number) {
    this.value = value;
  }

  cancelScheduledValues(t: number) {
    this.calls.push(["cancel", t]);
  }

  setValueAtTime(v: number, t: number) {
    this.calls.push(["set", v, t]);
  }

  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["ramp", v, t]);
  }

  setTargetAtTime(v: number, t: number, c: number) {
    this.calls.push(["target", v, t, c]);
  }
}

class FakeNode {
  readonly outputs = new Set<FakeNode>();

  connect(node: FakeNode) {
    this.outputs.add(node);

    return node;
  }

  disconnect() {
    this.outputs.clear();
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);

  constructor() {
    super();
    world.gains.push(this);
  }
}

class FakeBuffer {
  readonly name: string;
  readonly duration: number;

  constructor(name: string, duration: number) {
    this.name = name;
    this.duration = duration;
  }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  /** The `when` passed to start; null before. */
  when: number | null = null;
  startAt = Infinity;
  offset = 0;
  stopAt = Infinity;
  durationArg: number | undefined;
  stops = 0;
  ended = false;

  constructor() {
    super();
    world.sources.push(this);
  }

  get name() {
    return this.buffer?.name ?? "";
  }

  start(when = 0, offset = 0, duration?: number) {
    if (this.when !== null) {
      throw new Error("InvalidStateError: start twice");
    }

    this.when = when;
    this.startAt = Math.max(when, world.t);
    this.offset = offset;
    this.durationArg = duration;
  }

  // The last stop wins, as in the current spec.
  stop(when = 0) {
    if (this.when === null) {
      throw new Error("InvalidStateError: stop before start");
    }

    this.stops += 1;
    this.stopAt = Math.max(when, world.t);
  }

  /** When it stops sounding: its natural end or its stop, whichever is first. */
  get endAt() {
    if (this.when === null || this.buffer === null) {
      return Infinity;
    }

    const length = (this.buffer.duration - this.offset) / this.playbackRate.value;
    const natural = this.loop ? Infinity : this.startAt + length;

    return Math.min(natural, Math.max(this.stopAt, this.startAt));
  }

  soundsAt(time: number) {
    return this.startAt <= time && time < this.endAt && this.endAt > this.startAt;
  }
}

class FakeAudioContext {
  readonly sampleRate = 48000;
  readonly destination = new FakeNode();
  private readonly listeners = new Set<() => void>();

  get currentTime() {
    return world.t;
  }

  get state() {
    return world.state;
  }

  createGain() {
    return new FakeGain();
  }

  createBufferSource() {
    return new FakeSource();
  }

  createBuffer(_channels: number, length: number, rate: number) {
    return new FakeBuffer("silence", length / rate);
  }

  decodeAudioData(data: ArrayBuffer) {
    const name = new TextDecoder().decode(data);

    return Promise.resolve(new FakeBuffer(name, DURATIONS[name] ?? 1));
  }

  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }

  setState(state: string) {
    if (world.state !== state) {
      world.state = state;
      this.listeners.forEach((listener) => listener());
    }
  }

  resume() {
    if (world.resumeMode === "hang") {
      return new Promise<void>(() => undefined);
    }

    if (world.resumeMode === "run") {
      this.setState("running");
    }

    return Promise.resolve();
  }

  suspend() {
    this.setState("suspended");

    return Promise.resolve();
  }

  close() {
    this.setState("closed");

    return Promise.resolve();
  }
}

const install = () => {
  world = {
    t: 0,
    state: "suspended",
    resumeMode: "run",
    sources: [],
    gains: [],
    ended: [],
    failUrls: new Set(),
    storage: world?.storage ?? new Map(),
  };

  const globals = globalThis as unknown as Record<string, unknown>;

  globals.AudioContext = FakeAudioContext;
  globals.window = {
    localStorage: {
      getItem: (key: string) => world.storage.get(key) ?? null,
      setItem: (key: string, value: string) => world.storage.set(key, value),
    },
  };
  globals.fetch = (url: string) =>
    Promise.resolve({
      ok: !world.failUrls.has(url),
      status: world.failUrls.has(url) ? 404 : 200,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer),
    });
  Object.defineProperty(globalThis, "navigator", {
    value: { audioSession: { type: "auto", state: "inactive" } },
    configurable: true,
    writable: true,
  });
};

const audioSession = () => (globalThis.navigator as unknown as { audioSession: { type: string } }).audioSession;

/**
 * Moves the audio clock (only while running) in 50 ms steps; sources that end are reported `late` seconds after their
 * end, through `onended`, like the main thread getting the event late.
 */
const advance = (seconds: number, late = 0) => {
  if (world.state !== "running") {
    return;
  }

  const end = world.t + seconds;

  while (world.t < end - 1e-9) {
    world.t = Math.min(end, world.t + 0.05);
    world.sources
      .filter((source) => !source.ended && source.endAt <= world.t)
      .forEach((source) => {
        source.ended = true;
        world.ended.push({ at: source.endAt + late, source });
      });

    const due = world.ended.filter((entry) => entry.at <= world.t);

    world.ended = world.ended.filter((entry) => entry.at > world.t);
    due.forEach((entry) => entry.source.onended?.());
  }
};

const overlaySources = () => world.sources.filter((source) => OVERLAYS.has(source.name) && source.when !== null);
const soundingAt = (time: number) => overlaySources().filter((source) => source.soundsAt(time)).map((s) => s.name);
const sourceNamed = (name: string) => world.sources.filter((source) => source.name === name);
const gainOf = (source: FakeSource | undefined) => {
  const gain = [...(source?.outputs ?? [])][0];

  assert.ok(gain instanceof FakeGain);

  return gain.gain;
};
// Creation order in the engine: master, music bus, world bus, UI bus, BGM gain, overlay gain.
const masterGain = () => world.gains[0]?.gain;
const overlayGain = () => world.gains[5]?.gain;

/** An engine with everything decoded, unlocked and running, the clock at `at`, music started. */
const running = async (at = 2): Promise<{ engine: AudioEngine; anchor: number }> => {
  const engine = createAudioEngine(undefined, () => 0.5);

  await engine.load();
  world.t = at;
  engine.unlock();
  engine.startMusic();

  return { engine, anchor: engine.debug.barAnchor ?? NaN };
};

const near = (actual: number | undefined, expected: number, label = "") =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${label} ${actual} != ${expected}`);

describe("audio engine (fake AudioContext)", () => {
  beforeEach(install);

  describe("unlock and resume", () => {
    it("sets the playback session, resumes and plays a silent buffer on every call while not running", async () => {
      const engine = createAudioEngine();

      await engine.load();
      assert.equal(engine.status, "locked");

      world.resumeMode = "stay";
      engine.unlock();
      engine.unlock();
      assert.equal(sourceNamed("silence").length, 2);
      assert.equal(audioSession().type, "playback");
      assert.equal(engine.status, "needs-gesture");

      world.resumeMode = "run";
      engine.unlock();
      assert.equal(engine.status, "running");
      engine.unlock();
      assert.equal(sourceNamed("silence").length, 3, "no silent buffer once running");
    });

    it("resume() settles false when the context's resume never settles", async () => {
      const engine = createAudioEngine();

      engine.unlock();
      await engine.suspend();
      world.resumeMode = "hang";

      const started = Date.now();
      // Node's AbortSignal.timeout doesn't hold the event loop open (browsers have no such notion): hold it here.
      const keepAlive = setInterval(() => undefined, 50);

      try {
        assert.equal(await engine.resume(), false);
      } finally {
        clearInterval(keepAlive);
      }

      assert.ok(Date.now() - started < 2000);
    });

    it("resume() is true once the context runs again", async () => {
      const { engine } = await running();

      await engine.suspend();
      assert.equal(engine.status, "needs-gesture");
      assert.equal(await engine.resume(), true);
      assert.equal(engine.status, "running");
    });
  });

  describe("music", () => {
    it("starts BGM01 looped from its offset, now + the lead, with a 1 s fade-in", async () => {
      const { anchor } = await running(2);
      const bgm = sourceNamed("bgm01.m4a")[0];

      near(anchor, 2 + LEAD, "anchor");
      assert.ok(bgm !== undefined);
      near(bgm.when ?? undefined, anchor);
      near(bgm.offset, 0.1);
      assert.equal(bgm.loop, true);
      near(bgm.loopStart, 0.1);
      near(bgm.loopEnd, 9.7);
      assert.equal(bgm.durationArg, undefined);
      assert.deepEqual(gainOf(bgm).calls, [["set", 0, anchor], ["ramp", 1, anchor + 1]]);
    });

    it("starts a part on the next bar with a fade to 0.9; the same part again changes nothing", async () => {
      const { engine, anchor } = await running();

      advance(3);
      engine.setStoryPart(0);
      engine.setStoryPart(0);

      const t = anchor + BAR;
      const [overlay, ...others] = overlaySources();

      assert.equal(others.length, 0);
      assert.equal(overlay?.name, "overlay_phase02.m4a");
      near(overlay?.when ?? undefined, t);
      assert.equal(overlay?.loop, true);
      assert.deepEqual(overlayGain()?.calls, [["cancel", t], ["set", 0, t], ["ramp", 0.9, t + 0.9]]);

      advance(BAR + 5);
      engine.setStoryPart(0);
      assert.equal(overlaySources().length, 1, "still the same loop");
    });

    it("cuts between looping parts on the bar, without a new fade", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(0);
      advance(BAR + 4);
      engine.setStoryPart(1);

      const t = anchor + 2 * BAR;
      const [first, second] = overlaySources();

      near(first?.stopAt, t, "part 0 stops");
      near(second?.when ?? undefined, t, "part 1 starts");
      assert.deepEqual(soundingAt(t - 1), ["overlay_phase02.m4a"]);
      assert.deepEqual(soundingAt(t + 1), ["overlay_phase03.m4a"]);
      assert.equal(overlayGain()?.calls.length, 3, "only the first fade");
    });

    it("replaces or withdraws a change still pending, before its bar", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(0);
      advance(BAR + 3);
      engine.setStoryPart(1);
      engine.setStoryPart(2);

      const t = anchor + 2 * BAR;

      assert.deepEqual(soundingAt(t + 1), ["overlay_phase04.m4a"]);
      assert.equal(sourceNamed("overlay_phase03.m4a").every((source) => source.outputs.size === 0), true);

      engine.setStoryPart(0);
      assert.deepEqual(soundingAt(t - 1), ["overlay_phase02.m4a"]);
      assert.deepEqual(soundingAt(t + 1), ["overlay_phase02.m4a"]);
      assert.deepEqual(engine.debug.overlayStarts.map((start) => start.key), ["overlayPhase02", "overlayPhase02"]);
      assert.equal(engine.debug.overlay?.pending, true);
    });

    it("restarts overlayPhase04 on every bar from `ended` alone, even 3 s late, without tick", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(2);
      advance(12 * BAR, 3);

      const starts = sourceNamed("overlay_phase04.m4a").map((source) => ((source.when ?? 0) - anchor) / BAR);

      assert.ok(starts.every((bars) => Math.abs(bars - Math.round(bars)) < 1e-9), "on the grid");

      assert.deepEqual(starts.slice(0, 12).map(Math.round), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.ok(engine.debug.voices.overlay <= 3);
      assert.ok(overlaySources().every((source) => source.offset === 0.1 && source.durationArg === undefined));
    });

    it("tick is idempotent: per-frame calls schedule each bar once", async () => {
      const { engine } = await running();

      engine.setStoryPart(2);

      const scheduled = sourceNamed("overlay_phase04.m4a").length;

      for (let i = 0; i < 100; i += 1) {
        engine.tick();
      }

      assert.equal(sourceNamed("overlay_phase04.m4a").length, scheduled);

      for (let i = 0; i < 60 * 30; i += 1) {
        advance(1 / 60);
        engine.tick();
      }

      const bars = sourceNamed("overlay_phase04.m4a").map((source) => source.when);

      assert.equal(new Set(bars).size, bars.length);
    });

    it("drops the per-bar restarts at or after a change, and stops nothing it shouldn't", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(2);
      advance(2 * BAR + 1);
      engine.setStoryPart(0);

      const t = anchor + 3 * BAR;

      advance(3 * BAR);
      assert.ok(sourceNamed("overlay_phase04.m4a").every((source) => !source.soundsAt(t) && !source.soundsAt(t + BAR)));
      assert.deepEqual(soundingAt(t + 1), ["overlay_phase02.m4a"]);
      assert.deepEqual(soundingAt(t - 5), ["overlay_phase04.m4a"]);
    });

    it("lets bgm02 finish, then starts the next part on the first bar after its end", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(0);
      advance(BAR);
      engine.setStoryPart(3);
      advance(BAR + 5);
      engine.setStoryPart(0);

      const bgm02 = sourceNamed("bgm02.m4a")[0];
      const start = anchor + BAR;

      near(bgm02?.when ?? undefined, start);
      assert.equal(bgm02?.stops, 0, "never cut");

      // 20.425 s from bar 1 ends inside bar 3: part 0 waits for bar 4, not bar 3.
      const part0 = sourceNamed("overlay_phase02.m4a")[1];

      near(part0?.when ?? undefined, anchor + 4 * BAR);
      assert.equal(engine.debug.overlay?.pending, true);

      // Part 3 again while part 0 waits: bgm02 plays on, part 0 is withdrawn, nothing restarts from the top.
      engine.setStoryPart(3);
      assert.equal(sourceNamed("bgm02.m4a").length, 1);
      assert.equal(part0?.soundsAt(anchor + 4 * BAR + 1), false);
      assert.equal(engine.debug.overlay?.part, 3);

      // Replay after it has ended: part 0 lands on the next bar, without a new fade.
      advance(3 * BAR);
      engine.setStoryPart(0);
      assert.deepEqual(soundingAt(anchor + 6 * BAR + 1), ["overlay_phase02.m4a"]);
      assert.equal(overlayGain()?.calls.filter((call) => call[0] === "ramp").length, 1);
    });

    it("schedules a per-bar part waiting for bgm02 at once, and chains it without tick", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(3);
      advance(1);
      engine.setStoryPart(2);

      // bgm02 from bar 0 ends inside bar 2: part 2 starts on bar 3, more than two bars away.
      const starts = () =>
        sourceNamed("overlay_phase04.m4a").map((source) => Math.round(((source.when ?? 0) - anchor) / BAR));

      assert.deepEqual(starts().slice(0, 1), [3]);
      advance(6 * BAR);
      assert.deepEqual(starts().slice(0, 4), [3, 4, 5, 6]);
    });

    it("silences on the next bar for null, then fades the next part in again", async () => {
      const { engine, anchor } = await running();

      engine.setStoryPart(1);
      advance(BAR + 2);
      engine.setStoryPart(null);
      engine.setStoryPart(null);

      const t = anchor + 2 * BAR;

      assert.deepEqual(soundingAt(t + 1), []);
      assert.deepEqual(overlayGain()?.calls.slice(3), [["cancel", t], ["set", 0, t]]);
      assert.equal(engine.debug.overlay, null);

      advance(BAR);
      engine.setStoryPart(0);

      const t2 = anchor + 3 * BAR;

      assert.deepEqual(overlayGain()?.calls.slice(5), [["cancel", t2], ["set", 0, t2], ["ramp", 0.9, t2 + 0.9]]);
    });

    it("starts a part asked for before the music together with BGM01", async () => {
      const engine = createAudioEngine();

      await engine.load();
      engine.setStoryPart(0);
      world.t = 1;
      engine.unlock();
      engine.startMusic();
      near(overlaySources()[0]?.when ?? undefined, 1 + LEAD);
    });
  });

  describe("mute", () => {
    it("ramps the master gain from now without reading it, and persists", async () => {
      const { engine } = await running(4);

      engine.setMuted(true);
      assert.deepEqual(masterGain()?.calls, [["cancel", 4], ["target", 0, 4, 0.015]]);
      assert.equal(world.storage.get("mini-one.audio.muted"), "1");

      install();

      const next = createAudioEngine();

      assert.equal(next.muted, true);
      assert.equal(masterGain()?.value, 0);
      next.setMuted(false);
      assert.equal(world.storage.get("mini-one.audio.muted"), "0");
    });
  });

  describe("sfx", () => {
    it("world: one voice at a random pitch; skipped while not running", async () => {
      const engine = createAudioEngine(undefined, () => 0);

      await engine.load();
      engine.playSfx("thunderclap");
      assert.equal(sourceNamed("thunderclap.m4a").length, 0);

      engine.unlock();
      engine.playSfx("thunderclap");
      engine.playSfx("kraken");

      const [thunder] = sourceNamed("thunderclap.m4a");
      const [kraken] = sourceNamed("kraken.m4a");

      assert.equal(thunder?.outputs.size, 0, "cut and disconnected");
      near(kraken?.playbackRate.value, 0.95);
      assert.equal(engine.debug.voices.world, 1);
    });

    it("ui: one-shots overlap; a loop is skipped while not running", async () => {
      const engine = createAudioEngine();

      await engine.load();

      const idle = engine.loopUi("creakLoop");

      idle.stop();
      assert.equal(sourceNamed("creak_loop.m4a").length, 0);

      engine.unlock();
      engine.playUi("haulTick");
      engine.playUi("haulTick", { rate: 1.2 });

      const creak = engine.loopUi("creakLoop");

      assert.equal(engine.debug.voices.ui, 3);
      assert.equal(sourceNamed("creak_loop.m4a")[0]?.loop, true);
      creak.stop();
      creak.stop();
      assert.equal(engine.debug.voices.ui, 2);
    });
  });

  describe("load", () => {
    it("retries only failed entries and reports progress to every concurrent caller", async () => {
      const engine = createAudioEngine();

      world.failUrls.add("kraken.m4a");
      await assert.rejects(engine.load(), (error: Error) => error.name === "AudioLoadError");
      assert.deepEqual(engine.failed, ["kraken"]);

      world.failUrls.clear();

      const first: number[] = [];
      const second: number[] = [];
      const a = engine.load((loaded) => first.push(loaded));
      const b = engine.load((loaded) => second.push(loaded));

      await Promise.all([a, b]);
      assert.deepEqual(first, [8, 9]);
      assert.deepEqual(second, [8, 9]);
      assert.deepEqual(engine.failed, []);
      assert.equal(engine.debug.decoded.length, 9);
    });
  });
});
