// Scene motion in the real page (m4-plan, deliverable 4): Title's intro and exit, the ambient loops on whole art
// pixels, the vignette over the sea's right-edge gap, the arrow pulses, the backdrop's fade and the ending's phases.
// Frame-stepped, not real time: an init script holds every requestAnimationFrame, and the tests run Pixi's ticker
// themselves, FRAME_MS of game time per frame, recording the scene after each one. Desktop only: nothing here depends
// on the device. Written by Claude Code.
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { GameSnapshot } from "../src/debug-api.ts";
import { AFTER_ROUND_MS, ENDING_MS, TITLE_EXIT_MS, TITLE_PROMPT_MS } from "../src/game/states/timings.ts";
import { SEED } from "./game.ts";

test.skip(({ isMobile }) => isMobile, "desktop only: no device-specific path");

// A small viewport at DPR 1: every stepped frame renders, and the checks read the scene, not pixels.
test.use({ deviceScaleFactor: 1, viewport: { width: 640, height: 400 } });

// Hundreds of frames each, stepped and sampled in the page.
test.describe.configure({ timeout: 60_000 });

/** Game ms per stepped frame where the samples matter, and where the test only gets somewhere (Pixi's cap: 100). */
const FRAME_MS = 16;
const SKIP_MS = 100;

/** The ending's 16 s, sampled every 50 ms: 20 samples a second fade. */
const ENDING_FRAME_MS = 50;

const ARROW_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;

/** One node as a frame left it. */
interface NodeSample {
  readonly visible: boolean;
  readonly alpha: number;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
  /** The texture's left and top edges, in art px: whole numbers on the art grid. */
  readonly left: number;
  readonly top: number;
}

interface Frame {
  readonly now: number;
  readonly state: string | undefined;
  readonly phase: string;
  readonly clips: number;
  readonly nodes: Readonly<Record<string, NodeSample | null>>;
}

declare global {
  interface Window {
    frameLock?: { held: Map<number, FrameRequestCallback>; time: number; started: boolean };
  }
}

/** Holds every requestAnimationFrame callback: Pixi's ticker runs only when a test steps it. */
const lockFrames = (page: Page) => page.addInitScript(() => {
  const held = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  window.frameLock = { held, time: 0, started: false };
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;

    held.set(id, callback);

    return id;
  };
  window.cancelAnimationFrame = (id) => {
    held.delete(id);
  };
});

/** When a run of frames stops: before the first frame at which any of these holds, or after `frames` frames. */
interface Until {
  readonly frames?: number;
  /** Game ms per frame: FRAME_MS by default. */
  readonly frameMs?: number;
  /** Game ms on the clock. */
  readonly now?: number;
  readonly state?: string;
  /** The challenge at this index is done (or the round is). */
  readonly leaveChallenge?: number;
}

/**
 * Runs frames of the ticker in the page until `until` holds, each followed by the other held frame callbacks, as a
 * real frame would, and returns the scene after each frame. One round trip for the whole run. The nodes are found by
 * label: the ui texts and the logo through `scene.parts`, the rest in their layers.
 */
const run = (page: Page, until: Until) => page.evaluate(({ until, frameMs }) => {
  const lock = window.frameLock;
  const debug = window.debug;
  const { ticker } = debug.app;

  if (lock === undefined) {
    throw new Error("frames aren't locked");
  }

  if (!lock.started) {
    lock.started = true;
    ticker.lastTime = 0;
  }

  type Node = {
    visible: boolean;
    alpha: number;
    position: { x: number; y: number };
    rotation: number;
    scale: { x: number; y: number };
    anchor?: { x: number; y: number };
    width: number;
    height: number;
  };
  const sample = (node: Node | null | undefined) => node === null || node === undefined ? null : {
    visible: node.visible,
    alpha: node.alpha,
    x: node.position.x,
    y: node.position.y,
    rotation: node.rotation,
    scale: node.scale.x,
    left: node.position.x - (node.anchor?.x ?? 0) * node.width,
    top: node.position.y - (node.anchor?.y ?? 0) * node.height,
  };
  const recorded = [];
  const reached = () => {
    const game = debug.game;

    return (until.now !== undefined && debug.clock.now >= until.now)
      || (until.state !== undefined && game.state === until.state)
      || (until.leaveChallenge !== undefined
        && (game.challenge?.index !== until.leaveChallenge || game.phase !== "play"));
  };

  for (let index = 0; index < (until.frames ?? 20_000) && !reached(); index++) {
    lock.time += frameMs;
    ticker.update(lock.time);

    const pending = [...lock.held.entries()];

    lock.held.clear();

    for (const [id, callback] of pending) {
      // Pixi's own frame request stays held, for the next step.
      if (callback === (ticker as unknown as { _tick: FrameRequestCallback })._tick) {
        lock.held.set(id, callback);
      } else {
        callback(lock.time);
      }
    }

    const parts = debug.scene?.parts;
    const world = (label: string) => debug.layers.world.getChildByLabel(label) as Node | null;
    const pulse = parts?.arrows.children.find((child) => child.label === "arrow-pulse" && child.visible);

    recorded.push({
      now: debug.clock.now,
      state: debug.machine.current,
      phase: debug.game.phase,
      clips: debug.anim.active,
      nodes: {
        logo: sample(parts?.logo),
        credits: sample(parts?.credits),
        prompt: sample(parts?.tapPrompt),
        black: sample(debug.layers.fx.getChildByLabel("black")),
        pulse: sample(pulse),
        ...Object.fromEntries(["seaF", "seaM", "seaB", "clouds", "clouds-2", "boat", "pillars", "kraken-body",
          "kraken-tail", "broken-boat"].map((label) => [label, sample(world(label))])),
      },
    });
  }

  if (until.frames === undefined && !reached()) {
    throw new Error(`never reached ${JSON.stringify(until)}`);
  }

  return recorded;
}, { until, frameMs: until.frameMs ?? FRAME_MS });

const step = (page: Page, frames: number) => run(page, { frames });

const readGame = (page: Page): Promise<GameSnapshot & { readonly now: number }> =>
  page.evaluate(() => ({ ...window.debug.game, now: window.debug.clock.now }));

/** Steps `ms` of game time from now, recording every frame. */
const stepFor = (page: Page, ms: number) => step(page, Math.ceil(ms / FRAME_MS));

const node = (frame: Frame, name: string) => {
  const sample = frame.nodes[name];

  if (sample === null || sample === undefined) {
    throw new Error(`no ${name} at ${frame.now}`);
  }

  return sample;
};

/** The frames from `from` (inclusive) to `to` (exclusive), in game ms. */
const between = (frames: readonly Frame[], from: number, to: number) =>
  frames.filter((frame) => frame.now >= from && frame.now < to);

const alphas = (frames: readonly Frame[], name: string) => frames.map((frame) => node(frame, name).alpha);

const nonDecreasing = (values: readonly number[]) =>
  values.every((value, index) => index === 0 || value >= values[index - 1]);

const nonIncreasing = (values: readonly number[]) =>
  values.every((value, index) => index === 0 || value <= values[index - 1]);

const press = async (page: Page, key: string) => {
  await page.keyboard.down(key);
  await page.keyboard.up(key);
};

const screenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  const path = testInfo.outputPath(`${name}.png`);

  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
};

/** Opens the game at time scale 1 with frames locked, and taps through the gate; returns Title's enter time. */
const openToTitle = async (page: Page) => {
  await lockFrames(page);
  await page.goto(`/?debug&seed=${SEED}&timescale=1`);
  // Loading runs in wall time, with no frame: `polling` in ms, as the default waits on animation frames.
  await page.waitForFunction(() => window.debug?.scene !== undefined && window.debug.gate.progress === 1, undefined, {
    polling: 50,
    timeout: 45_000,
  });

  for (let attempt = 0; attempt < 200 && (await page.evaluate(() => window.debug.gate.phase)) !== "ready"; attempt++) {
    await step(page, 1);
    await page.waitForTimeout(10);
  }

  await press(page, "Space");
  await run(page, { state: "title" });

  return (await readGame(page)).now;
};

/**
 * Plays the shown round to its win, a key per frame; `onPulse` steps a few frames into each Hold and Many. Returns
 * every frame stepped, `onPulse`'s included, the win's last.
 */
const playRound = async (page: Page, onPulse?: (kind: string) => Promise<readonly Frame[]>) => {
  const frames: Frame[] = [];

  for (let guard = 0; guard < 50; guard++) {
    const game = await readGame(page);

    if (game.phase !== "play" || game.challenge === null) {
      return frames;
    }

    const { spec, index, progress } = game.challenge;

    if (spec.kind === "sequence") {
      for (const dir of spec.directions) {
        await press(page, ARROW_KEYS[dir]);
        frames.push(...await step(page, 1));
      }
    } else if (spec.kind === "hold") {
      await page.keyboard.down(ARROW_KEYS[spec.direction]);
      frames.push(...await onPulse?.("hold") ?? []);
      frames.push(...await run(page, { leaveChallenge: index }));
      await page.keyboard.up(ARROW_KEYS[spec.direction]);
    } else {
      frames.push(...await onPulse?.("many") ?? []);

      for (let count = 0; count < (progress.kind === "many" ? progress.target : 0); count++) {
        await press(page, ARROW_KEYS[spec.direction]);
        frames.push(...await step(page, 1));
      }
    }

    frames.push(...await run(page, { leaveChallenge: index }));
  }

  throw new Error("the round never ended");
};

test("Title: the prompt fades in at 7.25 s, earlier taps are dropped, the tap fades Title out, then the story", async ({
  page,
}, testInfo) => {
  const enteredAt = await openToTitle(page);
  const intro: Frame[] = [];

  // Taps all through the intro, the last a frame before its end: coarse frames to 7 s, then fine ones.
  for (const at of [1000, 4000, 7000]) {
    intro.push(...await run(page, { now: enteredAt + at, frameMs: SKIP_MS }));
    await press(page, "Space");
  }

  intro.push(...await run(page, { now: enteredAt + TITLE_PROMPT_MS - FRAME_MS }));
  await press(page, "Space");

  intro.push(...await step(page, 1));
  await screenshot(page, testInfo, "title-intro");

  const before = intro.filter((frame) => frame.now < enteredAt + TITLE_PROMPT_MS);

  expect(before.length).toBeGreaterThan(80);
  expect(before.every((frame) => frame.state === "title" && frame.phase === "title")).toBe(true);
  expect(before.every((frame) => !node(frame, "prompt").visible && !node(frame, "credits").visible)).toBe(true);

  // The fade-in (TMPFadeIn, 1 s), then the pulse (TMPIdle, 1 → 0.647 → 1 over 1.6 s).
  const fading = [...intro.slice(before.length), ...await stepFor(page, 2600)];
  const fadeIn = between(fading, enteredAt + TITLE_PROMPT_MS, enteredAt + TITLE_PROMPT_MS + 1000);

  expect(fading.every((frame) => frame.phase === "prompt" && node(frame, "prompt").visible)).toBe(true);
  expect(alphas(fadeIn, "prompt")[0]).toBeLessThan(0.05);
  expect(nonDecreasing(alphas(fadeIn, "prompt"))).toBe(true);
  expect(alphas(fadeIn, "credits")).toEqual(alphas(fadeIn, "prompt"));

  const pulse = alphas(between(fading, enteredAt + TITLE_PROMPT_MS + 1000, Infinity), "prompt");

  expect(Math.min(...pulse)).toBeCloseTo(0.647, 2);
  expect(Math.max(...pulse)).toBeCloseTo(1, 2);
  expect(node(fading.at(-1) as Frame, "credits").alpha).toBe(1);
  await screenshot(page, testInfo, "title-prompt");

  // The tap: Inicio's fade-outs, and the story at its end (FimInicio), 1 s on.
  await press(page, "Space");

  const exit = await run(page, { state: "story" });
  const tappedAt = exit[0].now;
  const leaving = exit.filter((frame) => frame.state === "title");

  // The frame whose tick reaches FimInicio starts the story.
  expect(exit.at(-1)?.now).toBeGreaterThanOrEqual(tappedAt + TITLE_EXIT_MS);
  expect(exit.at(-1)?.now).toBeLessThan(tappedAt + TITLE_EXIT_MS + FRAME_MS);
  expect(leaving.every((frame) => frame.phase === "leaving")).toBe(true);

  for (const name of ["logo", "credits", "prompt"]) {
    expect(nonIncreasing(alphas(leaving, name)), name).toBe(true);
    expect(alphas(leaving, name)[0], name).toBeGreaterThan(0.9);
    expect(node(exit.at(-1) as Frame, name), name).toMatchObject({ visible: false, alpha: 0 });
  }

  // More taps during the fade changed nothing: one story start, from part 0's preamble.
  expect((await readGame(page)).phase).toBe("preamble");
});

test("the sea, clouds and boat move on whole art pixels, and the vignette covers the sea's right-edge gap", async ({
  page,
}) => {
  const enteredAt = await openToTitle(page);
  // Title's first strike is at 2 s: these 1.9 s run under no bolt or flash.
  const frames = await stepFor(page, 1900);
  const moving = ["seaF", "seaM", "seaB", "clouds", "clouds-2", "boat"];

  expect(frames.every((frame) => frame.clips === 6), "the six ambient loops").toBe(true);

  for (const name of moving) {
    const samples = frames.map((frame) => node(frame, name));

    expect(samples.every((sample) => Number.isInteger(sample.left) && Number.isInteger(sample.top)), name).toBe(true);
    expect(new Set(samples.map((sample) => `${sample.x},${sample.y},${sample.rotation}`)).size, name)
      .toBeGreaterThan(3);
  }

  // The front strip slides left from 225 (16 px a second) and bobs 3 px; the clouds scroll 8.4 px a second, the
  // second sprite 500 px right of the first; the boat tilts within ±7° and bobs a pixel.
  const seaF = frames.map((frame) => node(frame, "seaF"));
  const clouds = frames.map((frame) => node(frame, "clouds"));
  const boat = frames.map((frame) => node(frame, "boat"));

  expect(nonIncreasing(seaF.map((sample) => sample.x))).toBe(true);
  expect(Math.max(...seaF.map((sample) => sample.x))).toBeLessThanOrEqual(225);
  expect(Math.min(...seaF.map((sample) => sample.x))).toBeGreaterThanOrEqual(193);
  expect(nonIncreasing(clouds.map((sample) => sample.x))).toBe(true);
  expect(frames.every((frame) => node(frame, "clouds-2").x - node(frame, "clouds").x === 500)).toBe(true);
  expect(Math.max(...boat.map((sample) => Math.abs(sample.rotation)))).toBeLessThanOrEqual((7.01 * Math.PI) / 180);
  expect(new Set(boat.map((sample) => sample.y))).toEqual(new Set([310, 311]));
  expect((await readGame(page)).now - enteredAt).toBeLessThan(2000);

  // The vignette draws above the world, and its rim hides the sea's right-edge gap (x ≥ 443 once a strip has slid
  // to 193): with the strips pushed right to cover the gap, the gap still renders black, unlike without the vignette.
  const gap = await page.evaluate(() => {
    const { app, display, layers } = window.debug;
    const vignette = layers.fx.getChildByLabel("vignette");
    const strips = ["seaF", "seaM", "seaB"].map((label) => layers.world.getChildByLabel(label));
    const brightest = () => {
      display.render();

      const k = display.renderScale;
      const { pixels, width } = app.renderer.extract.pixels(display.renderTexture);
      let max = 0;

      for (let y = 300 * k; y < 500 * k; y++) {
        for (let x = 443 * k; x < 500 * k; x++) {
          const index = (y * width + x) * 4;

          max = Math.max(max, pixels[index], pixels[index + 1], pixels[index + 2]);
        }
      }

      return max;
    };

    if (vignette === null || strips.some((strip) => strip === null)) {
      throw new Error("no scene");
    }

    const order = layers.playfield.children.map((child) => child.label);
    const saved = strips.map((strip) => strip?.x ?? 0);

    strips.forEach((strip) => {
      if (strip !== null) {
        strip.x = 290;
      }
    });

    const covered = brightest();

    vignette.visible = false;

    const uncovered = brightest();

    vignette.visible = true;
    strips.forEach((strip, index) => {
      if (strip !== null) {
        strip.x = saved[index];
      }
    });
    display.render();

    return { order, covered, uncovered };
  });

  expect(gap.order).toEqual(["world", "fx", "top"]);
  // The vignette's rim is at least 252/255 opaque there: at most 3/255 of the sea's white shows through.
  expect(gap.covered).toBeLessThanOrEqual(4);
  expect(gap.uncovered).toBeGreaterThan(100);
});

test("Hold and Many arrows pulse, and the backdrop fades in over the wait after a won round", async ({
  page,
}, testInfo) => {
  await openToTitle(page);
  // Straight to round 0 from Title: this test is about the round's look, playthrough.spec plays the way there.
  await page.evaluate(() => window.debug.machine.request("round"));

  const pulses: Record<string, Frame[]> = {};
  const onPulse = async (kind: string) => {
    pulses[kind] = await stepFor(page, 1100);

    if (kind === "hold") {
      await screenshot(page, testInfo, "round-hold-pulse");
    }

    return pulses[kind];
  };

  const round = await playRound(page, onPulse);

  // Hold (ArrowHold, looping every 1.03 s): the overlay fades in as it shrinks from 1.5× to the arrow.
  const hold = (pulses.hold ?? []).map((frame) => node(frame, "pulse"));

  expect(hold.length).toBeGreaterThan(60);
  expect(Math.max(...hold.map((sample) => sample.scale))).toBeGreaterThan(1.4);
  expect(Math.min(...hold.map((sample) => sample.scale))).toBeLessThan(1.05);
  expect(Math.min(...hold.map((sample) => sample.alpha))).toBeLessThan(0.1);

  // The won round: the pillars fade in from the win (FadeIn, 1 s), and the next part starts after AFTER_ROUND_MS.
  const after = await run(page, { state: "story" });
  const won = [...round, ...after];
  // The win shows the pillars and starts their fade on the same frame.
  const wonAt = won.find((frame) => node(frame, "pillars").visible)?.now ?? NaN;
  const fade = between(won, wonAt, wonAt + 1000);

  expect(won.at(-1)?.now).toBeGreaterThanOrEqual(wonAt + AFTER_ROUND_MS);
  expect(won.at(-1)?.now).toBeLessThan(wonAt + AFTER_ROUND_MS + 2 * FRAME_MS);
  expect(alphas(fade, "pillars")[0]).toBeLessThan(0.05);
  expect(nonDecreasing(alphas(won, "pillars"))).toBe(true);
  expect(alphas(between(won, wonAt + 400, wonAt + 600), "pillars").some((alpha) => alpha > 0.3 && alpha < 0.7))
    .toBe(true);
  expect(node(won.at(-1) as Frame, "pillars")).toMatchObject({ visible: true, alpha: 1 });
  expect(after.every((frame) => frame.nodes.pulse === null)).toBe(true);

  // Round 1 has a Many (ArrowMany, every 0.83 s): the overlay grows to 1.35× as it fades out.
  await page.evaluate(() => window.debug.machine.request("round"));
  await playRound(page, onPulse);

  const many = (pulses.many ?? []).map((frame) => node(frame, "pulse"));

  expect(many.length).toBeGreaterThan(60);
  expect(Math.max(...many.map((sample) => sample.scale))).toBeGreaterThan(1.3);
  expect(Math.max(...many.map((sample) => sample.alpha))).toBeGreaterThan(0.9);
  expect(Math.min(...many.map((sample) => sample.alpha))).toBeLessThan(0.1);
});

test("the ending throws the boat, raises the kraken, goes black at 8.5 s, then shows the card and the prompt", async ({
  page,
}, testInfo) => {
  await openToTitle(page);
  // Straight to the ending from Title, with part 3's black and a won round's pillars up as a game would leave them:
  // this test is about Fim's timeline, playthrough.spec plays the way there.
  await page.evaluate(() => {
    const { machine, scene } = window.debug;

    scene?.setBackdrop("pillars", true);
    scene?.setBlack(true);
    machine.request("ending");
  });

  const startedAt = (await readGame(page)).now;
  const frames: Frame[] = [];
  const moments = [[1200, "ending-thrown"], [2000, "ending-kraken"], [9000, "ending-black"], [10500, "ending-sea"],
    [14500, "ending-card"], [17750, "ending-prompt"]] as const;

  for (const [at, name] of moments) {
    frames.push(...await run(page, { now: startedAt + at, frameMs: ENDING_FRAME_MS }));
    await screenshot(page, testInfo, name);
  }

  frames.push(...await run(page, { now: startedAt + ENDING_MS.prompt + 1100, frameMs: ENDING_FRAME_MS }));

  const span = (from: number, to: number) => between(frames, startedAt + from, startedAt + to);
  const phases = frames.map((frame) => frame.phase).filter((phase, index, all) => phase !== all[index - 1]);

  expect(phases).toEqual(["boat", "thrown", "kraken", "black", "sea", "card", "prompt"]);

  // The broken boat waits at its spot, is thrown up (1.67 s) and stays at the top until FimFinal.
  expect(span(0, ENDING_MS.thrown).every((frame) => node(frame, "broken-boat").y === 294)).toBe(true);
  // It flies past its end pose by 4 art px at 1.1 s into the clip, and settles back (the clip's curve).
  const flight = span(ENDING_MS.thrown, ENDING_MS.thrown + 1000).map((frame) => node(frame, "broken-boat").y);

  expect(nonIncreasing(flight)).toBe(true);
  expect(Math.min(...flight)).toBeLessThan(220);
  expect(span(2300, ENDING_MS.sea).every((frame) => {
    const boat = node(frame, "broken-boat");

    return boat.visible && boat.x === 255 && boat.y === 199;
  })).toBe(true);

  // The kraken fades in from 1.5 s over 1 s, the body rising to (216, 224), and stays.
  expect(span(0, ENDING_MS.kraken).every((frame) => !node(frame, "kraken-body").visible)).toBe(true);
  expect(nonDecreasing(alphas(span(ENDING_MS.kraken, 2500), "kraken-body"))).toBe(true);
  const krakenFade = span(ENDING_MS.kraken, 2500);

  expect(alphas(krakenFade, "kraken-tail")).toEqual(alphas(krakenFade, "kraken-body"));
  expect(alphas(span(1900, 2100), "kraken-body").some((alpha) => alpha > 0.3 && alpha < 0.7)).toBe(true);
  expect(span(2600, ENDING_MS.sea).every((frame) => {
    const body = node(frame, "kraken-body");

    return body.alpha === 1 && body.x === 216 && body.y === 224;
  })).toBe(true);

  // Part 3's black stays full for 0.5 s, then fades out over 1 s.
  const lifting = span(ENDING_MS.lift, ENDING_MS.lift + 1000);

  expect(span(0, ENDING_MS.lift).every((frame) => node(frame, "black").visible && node(frame, "black").alpha === 1))
    .toBe(true);
  expect(nonIncreasing(alphas(lifting, "black"))).toBe(true);
  expect(alphas(lifting, "black").some((alpha) => alpha > 0.3 && alpha < 0.7)).toBe(true);
  expect(span(ENDING_MS.lift + 1000, ENDING_MS.black).every((frame) => !node(frame, "black").visible)).toBe(true);

  // Black from 8.5 s, full by 9.5 s; FimFinal cuts the scene under it at 10 s, and black fades out to the empty sea
  // from 10.25 s.
  expect(alphas(span(8900, 9100), "black").some((alpha) => alpha > 0.3 && alpha < 0.7)).toBe(true);
  expect(span(9500, ENDING_MS.seaLift).every((frame) => node(frame, "black").alpha === 1)).toBe(true);
  expect(span(0, ENDING_MS.sea).every((frame) => node(frame, "pillars").visible)).toBe(true);
  expect(span(ENDING_MS.sea, ENDING_MS.card).every((frame) => !node(frame, "kraken-body").visible
    && !node(frame, "broken-boat").visible && !node(frame, "pillars").visible)).toBe(true);
  expect(nonIncreasing(alphas(span(ENDING_MS.seaLift, ENDING_MS.seaLift + 1000), "black"))).toBe(true);
  expect(span(ENDING_MS.seaLift + 1000, Infinity).every((frame) => !node(frame, "black").visible)).toBe(true);

  // The card: the logo and the credits fade in at half speed, 2 s instead of 1.
  const card = span(ENDING_MS.card, ENDING_MS.card + 2000);

  for (const name of ["logo", "credits"]) {
    expect(nonDecreasing(alphas(card, name)), name).toBe(true);
    expect(alphas(card, name)[0], name).toBeLessThan(0.05);
    const halfway = alphas(span(ENDING_MS.card + 900, ENDING_MS.card + 1100), name);

    expect(halfway.some((alpha) => alpha > 0.3 && alpha < 0.7), name).toBe(true);
  }

  // Then the prompt, at the clip's own speed (1 s).
  const prompt = span(ENDING_MS.prompt, ENDING_MS.prompt + 1000);

  expect(span(0, ENDING_MS.prompt).every((frame) => !node(frame, "prompt").visible)).toBe(true);
  expect(nonDecreasing(alphas(prompt, "prompt"))).toBe(true);
  expect(alphas(prompt, "prompt")[0]).toBeLessThan(0.05);
  expect(alphas(span(ENDING_MS.prompt + 400, ENDING_MS.prompt + 600), "prompt")
    .some((alpha) => alpha > 0.3 && alpha < 0.7)).toBe(true);
  expect(node(frames.at(-1) as Frame, "logo").alpha).toBe(1);

  // The replay tap: Title's opening frame, with only the ambient loops playing.
  await press(page, "Space");

  const title = await run(page, { state: "title" });
  const back = [...title, ...await step(page, 2)].at(-1) as Frame;

  expect(back.clips).toBe(6);

  for (const name of ["logo", "credits", "prompt", "black", "kraken-body", "kraken-tail", "broken-boat", "pillars"]) {
    expect(node(back, name), name).toMatchObject({ visible: false, alpha: 0 });
  }

  expect(node(back, "boat").visible).toBe(true);
  expect([node(back, "kraken-body").x, node(back, "kraken-body").y]).toEqual([216, 239]);
  expect([node(back, "broken-boat").x, node(back, "broken-boat").y]).toEqual([250, 294]);
});
