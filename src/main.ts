// The bootstrap, in startup order: each step is a module in src/app/. Several of these orders are contracts
// (m4-refactor.md, rules 1–2): the ui layer's children (debug overlay, pad, mute button, Tap to continue, the gate's
// view, then the scene's texts), the router's `visibilitychange` listener before the page lifecycle's, Gate's
// activation hook before the lifecycle's, and the ticker's game logic → audio tick → render pass.
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
import { wireResize } from "./app/resize.ts";
import { createStage } from "./app/stage.ts";
import { createClipPlayer } from "./core/anim/player.ts";
import { GameClock } from "./core/clock.ts";
import { StateMachine } from "./core/state-machine.ts";
import { TUNING } from "./game/challenges/tuning.ts";
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
const { audio, lifecycle, muteButton } = wireAudio(layers, layouts);
const cueLog = createCueLog(() => clock.now);

// The gate's view needs nothing loaded; the scene needs the textures and the font.
const gateView = createGateView(layers, layouts.current);

layouts.onLayout(gateView.relayout);

const loading = createGameLoader({ layers, layouts, gateView, audio, clips });
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
});
const machine = new StateMachine<GameStateId>(clock, game.states);
const stepper = createFrameStepper(machine);

wireGestures({ router, audio, muteButton, lifecycle, machine, gate: game.gate });
wirePageLifecycle(stepper, lifecycle);

window.debug = createDebugApi({
  app, clock, machine, layers, display, layouts, router, audio, cueLog, lifecycle, game, timescale, loading, errors,
  clips,
});

startFrameLoop({
  ticker: app.ticker, stepper, padView, router, audio, timescale, clock, clips, errors, renderPlayfield,
});
resizeRenderer();
machine.request("gate");
