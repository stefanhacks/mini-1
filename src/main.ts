// The bootstrap, in startup order: each step is a module in src/app/. Several of these orders are contracts
// (m4-refactor.md, rules 1–2): the ui layer's children (debug overlay, pad, mute button, pause button, reduce-flashes
// button, Tap to continue, the gate's view, then the scene's texts), the router's `visibilitychange` listener before
// the page lifecycle's, Gate's activation hook before the lifecycle's, and the ticker's game logic → audio tick →
// screen tone → render pass.
import "./style.css";
import { wireAudio, wireGestures } from "./app/audio-wiring.ts";
import { createCueLog } from "./app/cue-log.ts";
import { createDebugApi } from "./app/debug-wiring.ts";
import { startFrameLoop } from "./app/frame-loop.ts";
import { createGameLoader } from "./app/game-loader.ts";
import { createErrorSink, createHaltingGuard } from "./app/halting-guard.ts";
import { wireInput } from "./app/input-wiring.ts";
import { createSeeder, createTimescale, readLaunchOptions } from "./app/launch-options.ts";
import { wirePageLifecycle } from "./app/page-lifecycle.ts";
import { wirePause } from "./app/pause-wiring.ts";
import { wireResize } from "./app/resize.ts";
import { createStage } from "./app/stage.ts";
import { pruneTextCache } from "./app/text-cache.ts";
import { createClipPlayer } from "./core/anim/player.ts";
import { GameClock } from "./core/clock.ts";
import { StateMachine } from "./core/state-machine.ts";
import { ENDLESS_TUNING, TUNING } from "./game/challenges/tuning.ts";
import { createReduceFlashes } from "./game/reduce-flashes.ts";
import { createScreenTone } from "./game/screen-tone.ts";
import { createFrameStepper } from "./game/frame-step.ts";
import { createGateView } from "./game/scene.ts";
import { createGame, type GameStateId } from "./game/states/index.ts";

// `debug.error` keeps the first error any guard reports; every one is reported as an uncaught error.
const errors = createErrorSink((error) => reportError(error));
const stage = await createStage();
const { app, layers, display } = stage;

// Render-texture passes run outside the game-logic guard, behind their own: the first throw (from M4 render code, say)
// is reported once and stops further passes, so the stage keeps the last frame and the ticker survives.
const renderPlayfield = createHaltingGuard(() => display.render(), errors.report);
const { layouts, resizeRenderer } = wireResize(stage, renderPlayfield);

const launch = readLaunchOptions(window.location.search, stage.debugEnabled);
const timescale = createTimescale(launch.timescale, stage.debugEnabled);
const nextSeed = createSeeder(launch.seed);

const { router, padView } = wireInput(stage, layouts);
const clock = new GameClock();
// The animation clips, on game time: the frame loop syncs them after each step, the scene plays them.
const clips = createClipPlayer(clock);
// The "reduce flashes" toggle, as stored: the strikes and the screen tone read it.
const reduceFlashes = createReduceFlashes();
const { audio, lifecycle, muteButton, pauseButton, flashesButton, continuePrompt } = wireAudio(
  layers, layouts, reduceFlashes,
);
const cueLog = createCueLog(() => clock.now);

// The gate's view needs nothing loaded; the scene needs the textures and the font.
const gateView = createGateView(layers, layouts.current);

layouts.onLayout(gateView.relayout);

const loading = createGameLoader({
  layers, layouts, gateView, audio, clips, weather: { eyesAlways: launch.eyesAlways, now: () => clock.now },
  reduceFlashes: () => reduceFlashes.on,
});
const game = createGame({
  loader: loading.loader,
  gateView,
  audio,
  onCue: cueLog.onCue,
  clock,
  // Every drain goes through the lifecycle, which drops the "Tap to continue" tap's advance (audio-lifecycle.ts).
  input: {
    drain: () => lifecycle.filter(router.drain()),
    beginEpoch: () => router.beginEpoch(),
  },
  pad: padView,
  scene: loading.requireScene,
  nextSeed,
  tuning: TUNING,
  endless: ENDLESS_TUNING,
  // Pixi keeps a null key per text it let go (text-cache.ts); a new game starts without them.
  onTitle: () => pruneTextCache(app.renderer),
});
const machine = new StateMachine<GameStateId>(clock, game.states);
const stepper = createFrameStepper(machine);

const pause = wirePause({ clock, machine, game, stepper, router, lifecycle, continuePrompt, pauseButton });

wireGestures({
  router, audio, muteButton, lifecycle, machine, gate: game.gate, pause, reduceFlashes, flashesButton,
});
wirePageLifecycle(stepper, lifecycle, pause);

// The screen tone: the renderer's clear colour follows the scene's flash, off with "reduce flashes" (lightning.ts
// `flashRule`).
const screenTone = createScreenTone({
  background: app.renderer.background,
  flash: () => loading.scene?.parts.flash,
  shown: () => !reduceFlashes.on,
  paused: () => clock.paused,
});

window.debug = createDebugApi({
  app, clock, machine, layers, display, layouts, router, audio, cueLog, game, timescale, loading, errors, clips, pause,
  continuePrompt, reduceFlashes, screenTone,
});

// The weather exists once the scene is built; until then there is nothing to move. Reduced motion is read first, so a
// change to it applies to this frame's weather (and the clips from the next sync).
const weather = {
  sync: (now: number) => {
    loading.scene?.syncMotion();
    loading.scene?.weather.sync(now);
  },
};

startFrameLoop({
  ticker: app.ticker,
  stepper,
  pause,
  padView,
  router,
  audio,
  timescale,
  clock,
  clips,
  weather,
  screenTone,
  errors,
  renderPlayfield,
});
resizeRenderer();
machine.request("gate");
