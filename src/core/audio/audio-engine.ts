// The audio engine: plain Web Audio, no dependency. Loads and decodes the AUDIO manifest, unlocks on a user
// gesture, plays BGM01 with the story overlays on its 9.6 s bars, the world and UI SFX, mute, and the suspend/resume
// lifecycle.
// The maths lives in the pure modules next to it (bar-clock, overlay-plan, audio-rules). Written by Claude Code.
//
// Graph: sources -> bgm gain / overlay gain -> music bus \
//                                world SFX source -> world bus -> master (mute) -> destination
//                                  UI SFX sources -> UI bus   /
//
// Overlay scheduling: changes land on the next bar (bar-clock). Loops and one-shots are single sources scheduled
// with `start(t)` / `stop(t)`. A one-shot overlay (`bgm02`) is never cut: the next change waits for the first bar at
// or after its natural end (owner decision, as the original let a non-looping clip finish). `overlayPhase04` needs a
// new source every bar: it is scheduled up to two bars ahead and refilled from two triggers, both idempotent
// (planPerBarStarts keeps a "next bar index"): each voice's `ended` event (~7.2 s into its bar) and `tick()`, once per
// frame, as a safety net. This isn't polling: they only do work once per bar, and all timing is on the audio clock.
import { AUDIO, type AudioAsset, type AudioKey } from "../../assets/manifest.ts";
import { barIndexAtOrAfter, barLength, barsFromAnchor, changeBarTime, MIN_LEAD } from "./bar-clock.ts";
import {
  MUTE_STORAGE_KEY,
  parseMuted,
  randomPitch,
  serializeMuted,
  sourceParams,
  statusFor,
  type AudioStatus,
} from "./audio-rules.ts";
import {
  OVERLAY_FADE,
  OVERLAY_GAIN,
  overlayForPart,
  planPerBarStarts,
  type OverlayKey,
  type OverlayMode,
  type OverlayPlan,
} from "./overlay-plan.ts";

export type { AudioStatus } from "./audio-rules.ts";

export type AudioManifest = Readonly<Record<AudioKey, AudioAsset>>;

/** The world channel's sounds: one voice, a new one cuts the previous (the original's `efxSource`). */
export type WorldSfxKey = "thunderclap" | "kraken";

/** The UI channel's one-shots, for `playUi`. */
export type UiSfxKey = "haulTick";

/** The UI channel's loops, for `loopUi`. */
export type UiLoopKey = "creakLoop";

export interface UiPlayOptions {
  /** `playbackRate`, 1 by default. */
  readonly rate?: number;
}

export interface UiLoop {
  /** Stops the loop now. Calling it again does nothing. */
  stop(): void;
}

/** Thrown by `load` when some entries failed; they are in `keys`, and the next `load` retries only those. */
export class AudioLoadError extends Error {
  readonly keys: readonly AudioKey[];
  /** The first failure's error (a network error, an HTTP status, or a decode error). */
  readonly reason: unknown;

  constructor(keys: readonly AudioKey[], reason: unknown) {
    super(`Audio failed to load: ${keys.join(", ")}`);
    this.name = "AudioLoadError";
    this.keys = keys;
    this.reason = reason;
  }
}

/** A plain snapshot for the console and e2e (`window.debug`). Times are on the AudioContext clock, in seconds. */
export interface AudioDebugSnapshot {
  readonly contextState: string;
  readonly status: AudioStatus;
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly unlocked: boolean;
  readonly muted: boolean;
  /** BGM01's start time, the bar grid's origin; null before `startMusic`. */
  readonly barAnchor: number | null;
  readonly bar: number;
  /** The last part passed to `setStoryPart` (undefined before any). */
  readonly storyPart: number | null | undefined;
  /**
   * The overlay asked for last: what plays (or will, from `startAt`; `pending` until then) and when it stops (null:
   * plays on). Null when the last request was no overlay, or before any.
   */
  readonly overlay: {
    readonly part: number;
    readonly key: OverlayKey;
    readonly mode: OverlayMode;
    readonly startAt: number;
    readonly stopAt: number | null;
    readonly pending: boolean;
  } | null;
  /**
   * The last overlay starts scheduled, oldest first (at most 32), with their distance from the anchor in bars. A start
   * cancelled before it played (a newer change before its bar) is removed.
   */
  readonly overlayStarts: readonly { readonly key: OverlayKey; readonly time: number; readonly bars: number }[];
  /** Live sources per channel (scheduled or playing). Must not grow across replays. */
  readonly voices: { readonly music: number; readonly overlay: number; readonly world: number; readonly ui: number };
  readonly decoded: readonly AudioKey[];
  readonly failed: readonly AudioKey[];
}

export interface AudioEngine {
  /**
   * Fetches and decodes every entry not decoded yet, reporting progress (decoded so far, total). Rejects with an
   * `AudioLoadError` when any entry failed; call it again to retry just those. Concurrent calls share one run, and
   * each caller's `onProgress` gets the current count at once, then every later step.
   */
  load(onProgress?: (loaded: number, total: number) => void): Promise<void>;
  /** The entries whose last load failed. */
  readonly failed: readonly AudioKey[];
  /**
   * Call synchronously inside a user-gesture handler (`pointerup`, `touchend`, `keydown`; never `pointerdown`).
   * While the context isn't running it asks iOS for the "playback" audio session, resumes the context and plays a
   * 1-sample silent buffer (older iOS), on every call, so a second gesture (e.g. a touchend fallback) retries it all.
   * Also the way back from `needs-gesture` ("Tap to continue").
   */
  unlock(): void;
  /**
   * Starts BGM01, looped, with a 1 s fade-in (the original's `WakeUp`), and anchors the bar grid. Once per engine;
   * later calls do nothing. Does nothing if BGM01 isn't decoded (see `debug.barAnchor`).
   */
  startMusic(): void;
  /**
   * The overlay for a story part (0..3), or none (null). A change lands on the next bar, or, after `bgm02` (part 3,
   * played once), on the first bar after it ends. The part already playing (or already pending) changes nothing, and
   * asking again for the playing part while another change is pending cancels that change. Before `startMusic` it
   * only records the part, which then starts with the music. Throws a RangeError on a part that doesn't exist.
   */
  setStoryPart(part: number | null): void;
  /** A world SFX at a random pitch (0.95..1.05), cutting the previous one. Skipped while the context isn't running. */
  playSfx(key: WorldSfxKey): void;
  /** A UI one-shot; many can overlap. Skipped while the context isn't running. */
  playUi(key: UiSfxKey, opts?: UiPlayOptions): void;
  /** A looping UI sound until its handle's `stop()`. Skipped (a handle that does nothing) while not running. */
  loopUi(key: UiLoopKey, opts?: UiPlayOptions): UiLoop;
  /** Mutes or unmutes (a short master ramp), and stores the choice. */
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Suspends the context (hidden tab). Never rejects. */
  suspend(): Promise<void>;
  /**
   * Tries to resume without a gesture (visible again, bfcache restore). Settles within about 0.4 s even where
   * `AudioContext.resume()` hangs outside a gesture (some iOS versions). True if the context runs afterwards; false
   * means "show Tap to continue" and call `unlock()` on the tap.
   */
  resume(): Promise<boolean>;
  readonly status: AudioStatus;
  /** Called with the new status whenever it changes (including iOS interruptions); returns the unsubscribe. */
  onStatusChange(listener: (status: AudioStatus) => void): () => void;
  /** Call once per frame: tops up the bar-by-bar overlay schedule. Cheap; does nothing most frames. */
  tick(): void;
  readonly debug: AudioDebugSnapshot;
  /** Stops everything and closes the context. The engine is dead afterwards. */
  destroy(): void;
}

/** BGM01's fade-in (SoundManager.WakeUp: volume 0 to 1 at 1/s). */
const BGM_FADE = 1;
/** The mute ramp's time constant; ~99% there after 5 constants (75 ms). */
const MUTE_TIME_CONSTANT = 0.015;
/** How many overlay starts `debug.overlayStarts` keeps. */
const MAX_OVERLAY_LOG = 32;
/** How long `resume()` waits for the context, in ms of real time. */
const RESUME_TIMEOUT_MS = 400;

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly key: OverlayKey;
  readonly start: number;
  /** When it ends by itself (Infinity for a loop). */
  readonly end: number;
  stopAt: number;
}

/** One `setStoryPart` request: an overlay (or none, `plan` null) from `startAt` until `stopAt`. */
interface OverlayTrack {
  readonly part: number | null;
  readonly plan: OverlayPlan | null;
  readonly startAt: number;
  /** Infinity while it plays on. One-shot (`once`) tracks are never stopped: they end by themselves. */
  stopAt: number;
  nextIndex: number;
  readonly voices: Set<Voice>;
  /** Whether the overlay gain was up before this track: restored if the track is cancelled before its bar. */
  readonly upBefore: boolean;
}

type ProgressListener = (loaded: number, total: number) => void;

const readStoredMute = (): boolean => {
  try {
    return parseMuted(window.localStorage.getItem(MUTE_STORAGE_KEY));
  } catch {
    // Storage blocked (privacy mode, sandboxed iframe): the default.
    return false;
  }
};

const writeStoredMute = (muted: boolean): void => {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, serializeMuted(muted));
  } catch {
    // Storage blocked or full: the choice lasts for this session only.
  }
};

const fetchAndDecode = async (ctx: BaseAudioContext, url: string): Promise<AudioBuffer> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return ctx.decodeAudioData(await response.arrayBuffer());
};

/**
 * Resolves after `ms` of real time. `AbortSignal.timeout` is a wall-clock timer that isn't the banned global
 * `setTimeout` (which is banned so game timers follow the game clock; this one must not). Where it doesn't exist
 * (Safari < 16) it never resolves, and `resume()` falls back to waiting for the context.
 */
const realTimeout = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    if (typeof AbortSignal.timeout === "function") {
      AbortSignal.timeout(ms).addEventListener("abort", () => resolve(), { once: true });
    }
  });

/** Creates the engine and its AudioContext, which stays suspended until `unlock()` (or runs if autoplay allows). */
export const createAudioEngine = (
  manifest: AudioManifest = AUDIO,
  rng: () => number = Math.random,
): AudioEngine => {
  const ctx = new AudioContext();
  const keys = Object.keys(manifest) as AudioKey[];
  const buffers = new Map<AudioKey, AudioBuffer>();
  const bgm01 = manifest.bgm01;

  if (!bgm01.loop) {
    throw new Error("bgm01 must be a loop: its loop length is the bar");
  }

  const bar = barLength(bgm01);
  // How far ahead per-bar overlays are scheduled. Two bars: a new track's first bar (up to a bar plus the lead away)
  // is scheduled at once, and the bar after the next is already scheduled when a voice's `ended` arrives, so one late
  // `ended` (or a missed frame) can't drop a bar.
  const schedulingHorizon = 2 * bar;

  const master = ctx.createGain();
  // The music bus sums BGM01 (1.0) and the overlay (0.9), as the original did, peaks included. If that ever clips
  // audibly, lower this bus's gain rather than the tracks, so their balance stays the original's.
  const musicBus = ctx.createGain();
  const worldBus = ctx.createGain();
  const uiBus = ctx.createGain();
  const bgmGain = ctx.createGain();
  const overlayGain = ctx.createGain();

  master.connect(ctx.destination);
  [musicBus, worldBus, uiBus].forEach((bus) => bus.connect(master));
  [bgmGain, overlayGain].forEach((gain) => gain.connect(musicBus));
  overlayGain.gain.value = 0;

  let muted = readStoredMute();

  master.gain.value = muted ? 0 : 1;

  let failed: readonly AudioKey[] = [];
  let loading: Promise<void> | null = null;
  let loadedCount = 0;
  const progressListeners = new Set<ProgressListener>();
  let unlocked = false;
  let destroyed = false;
  let anchor: number | null = null;
  let bgmVoice: AudioBufferSourceNode | null = null;
  let storyPart: number | null | undefined;
  // The track asked for last, and the one it replaces while it is still pending (null once it has started).
  let overlay: OverlayTrack | null = null;
  let outgoing: OverlayTrack | null = null;
  // Whether the overlay gain is (or is scheduled to be) up; a layer starting from silence fades in.
  let overlayUp = false;
  const overlayVoices = new Set<Voice>();
  const overlayLog: { key: OverlayKey; time: number; bars: number }[] = [];
  let worldVoice: AudioBufferSourceNode | null = null;
  const uiVoices = new Set<AudioBufferSourceNode>();
  const statusListeners = new Set<(status: AudioStatus) => void>();
  let lastStatus: AudioStatus | null = null;

  const status = (): AudioStatus => (destroyed ? "closed" : statusFor(ctx.state, unlocked));

  const notifyStatus = () => {
    const next = status();

    if (next !== lastStatus) {
      lastStatus = next;
      statusListeners.forEach((listener) => listener(next));
    }
  };

  ctx.addEventListener("statechange", notifyStatus);

  /** A source for a decoded entry, connected to `destination`, with its loop fields set. Null if not decoded. */
  const createSource = (key: AudioKey, destination: AudioNode): AudioBufferSourceNode | null => {
    const buffer = buffers.get(key);

    if (buffer === undefined) {
      return null;
    }

    const params = sourceParams(manifest[key]);
    const source = ctx.createBufferSource();

    source.buffer = buffer;
    source.loop = params.loop;

    if (params.loop) {
      source.loopStart = params.loopStart;
      source.loopEnd = params.loopEnd;
    }

    source.connect(destination);

    return source;
  };

  const stopNow = (source: AudioBufferSourceNode) => {
    source.onended = null;

    try {
      source.stop();
    } catch {
      // Never started: nothing to stop.
    }

    source.disconnect();
  };

  const reportProgress = (loaded: number) => {
    loadedCount = loaded;
    progressListeners.forEach((listener) => listener(loaded, keys.length));
  };

  const load = (onProgress?: ProgressListener): Promise<void> => {
    if (onProgress !== undefined) {
      progressListeners.add(onProgress);
    }

    if (loading !== null) {
      onProgress?.(loadedCount, keys.length);

      return loading;
    }

    loading = (async () => {
      const pending = keys.filter((key) => !buffers.has(key));

      reportProgress(keys.length - pending.length);

      const results = await Promise.allSettled(
        pending.map(async (key) => {
          const buffer = await fetchAndDecode(ctx, manifest[key].url);

          buffers.set(key, buffer);
          reportProgress(loadedCount + 1);
        }),
      );

      failed = pending.filter((_, i) => results[i]?.status === "rejected");

      const rejection = results.find((result) => result.status === "rejected");

      if (rejection !== undefined) {
        throw new AudioLoadError(failed, rejection.reason);
      }
    })().finally(() => {
      loading = null;
      progressListeners.clear();
    });

    return loading;
  };

  const unlock = () => {
    if (destroyed) {
      return;
    }

    unlocked = true;

    if (ctx.state !== "running") {
      // Before anything plays: ask iOS to treat this as media playback, which ignores the silent switch. Unverified.
      try {
        if (navigator.audioSession !== undefined) {
          navigator.audioSession.type = "playback";
        }
      } catch {
        // Not settable here: keep the default session.
      }

      // resume() must be called within the gesture; it settles later. A failure shows up in `status`.
      ctx.resume().catch(() => undefined);

      // Older iOS only unlocks Web Audio once a source has started inside a gesture.
      const silence = ctx.createBufferSource();

      silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silence.connect(ctx.destination);
      silence.onended = () => silence.disconnect();
      silence.start(0);
    }

    notifyStatus();
  };

  const logOverlayStart = (key: OverlayKey, time: number) => {
    overlayLog.push({ key, time, bars: anchor === null ? 0 : barsFromAnchor(time, anchor, bar) });

    if (overlayLog.length > MAX_OVERLAY_LOG) {
      overlayLog.shift();
    }
  };

  /** Schedules one overlay source of `track` at `time`, tracked until it ends. */
  const startOverlayVoice = (track: OverlayTrack, plan: OverlayPlan, time: number) => {
    const source = createSource(plan.key, overlayGain);

    if (source === null || source.buffer === null) {
      return;
    }

    const { offset, loop } = sourceParams(manifest[plan.key]);
    const voice: Voice = {
      source,
      key: plan.key,
      start: time,
      end: loop ? Infinity : time + source.buffer.duration - offset,
      stopAt: track.stopAt,
    };

    source.onended = () => {
      source.disconnect();
      overlayVoices.delete(voice);
      track.voices.delete(voice);

      if (plan.mode === "per-bar" && overlay === track) {
        refillPerBar(track, plan);
      }
    };
    source.start(time, offset);

    if (Number.isFinite(track.stopAt)) {
      source.stop(track.stopAt);
    }

    overlayVoices.add(voice);
    track.voices.add(voice);
    logOverlayStart(plan.key, time);
  };

  const refillPerBar = (track: OverlayTrack, plan: OverlayPlan) => {
    if (anchor === null) {
      return;
    }

    // The window opens at the track's own start at the latest, so a track waiting for bgm02 to end schedules its
    // first bar at once: with no voice yet, no `ended` would come to schedule it, and `tick` may not run (hidden tab).
    const next = planPerBarStarts({
      nextIndex: track.nextIndex,
      now: Math.max(ctx.currentTime, track.startAt - MIN_LEAD),
      anchor,
      bar,
      horizon: schedulingHorizon,
      stopAt: track.stopAt,
    });

    track.nextIndex = next.nextIndex;
    next.starts.forEach((time) => startOverlayVoice(track, plan, time));
  };

  /** Drops a voice that hasn't started: it never plays and leaves the debug log. */
  const dropVoice = (track: OverlayTrack, voice: Voice) => {
    const logged = overlayLog.findIndex((entry) => entry.key === voice.key && entry.time === voice.start);

    if (logged >= 0) {
      overlayLog.splice(logged, 1);
    }

    stopNow(voice.source);
    overlayVoices.delete(voice);
    track.voices.delete(voice);
  };

  /** Ends a looping or per-bar track at `time`: voices from `time` on are dropped now, the others stop at `time`. */
  const stopTrack = (track: OverlayTrack, time: number) => {
    track.stopAt = Math.min(track.stopAt, time);

    track.voices.forEach((voice) => {
      if (voice.start >= time) {
        dropVoice(track, voice);
      } else if (voice.stopAt > time) {
        voice.stopAt = time;
        voice.source.stop(time);
      }
    });
  };

  /** Undoes a track before its bar: its voices and gain automation go, and the gain state returns to before it. */
  const cancelPending = (track: OverlayTrack) => {
    track.voices.forEach((voice) => dropVoice(track, voice));
    track.stopAt = track.startAt;
    overlayGain.gain.cancelScheduledValues(track.startAt);
    overlayUp = track.upBefore;
  };

  const isPending = (track: OverlayTrack, now: number) => track.startAt >= now + MIN_LEAD;

  /** Whether a track still plays (or will) on its own: not stopped, and a one-shot not yet over. */
  const isLive = (track: OverlayTrack, now: number) => {
    if (Number.isFinite(track.stopAt)) {
      return false;
    }

    if (track.plan?.mode !== "once") {
      return true;
    }

    return track.startAt > now || [...track.voices].some((voice) => voice.end > now);
  };

  /** The natural end of a one-shot track (it is never cut), or -Infinity for the others. */
  const mustFinishBy = (track: OverlayTrack | null): number =>
    track?.plan?.mode === "once" ? Math.max(track.startAt, ...[...track.voices].map((voice) => voice.end)) : -Infinity;

  const applyStoryPart = (part: number | null) => {
    if (anchor === null) {
      return;
    }

    const now = ctx.currentTime;

    if (overlay !== null && isPending(overlay, now)) {
      if (overlay.part === part) {
        return;
      }

      cancelPending(overlay);
      overlay = outgoing;
      outgoing = null;
    }

    const base = overlay;

    if (base === null ? part === null : base.part === part && isLive(base, now)) {
      return;
    }

    const plan = overlayForPart(part);
    const time = changeBarTime(now, anchor, bar, mustFinishBy(base));

    if (base !== null && base.plan?.mode !== "once") {
      stopTrack(base, time);
    }

    const track: OverlayTrack = {
      part,
      plan,
      startAt: time,
      stopAt: Infinity,
      nextIndex: barIndexAtOrAfter(time, anchor, bar),
      voices: new Set(),
      upBefore: overlayUp,
    };

    overlay = track;
    outgoing = base;

    const gain = overlayGain.gain;

    if (plan === null) {
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(0, time);
      overlayUp = false;

      return;
    }

    if (!overlayUp) {
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(0, time);
      gain.linearRampToValueAtTime(OVERLAY_GAIN, time + OVERLAY_FADE);
      overlayUp = true;
    }

    if (plan.mode === "per-bar") {
      refillPerBar(track, plan);
    } else {
      startOverlayVoice(track, plan, time);
    }
  };

  const startMusic = () => {
    if (destroyed || anchor !== null) {
      return;
    }

    const source = createSource("bgm01", bgmGain);

    if (source === null) {
      return;
    }

    const start = ctx.currentTime + MIN_LEAD;

    anchor = start;
    bgmVoice = source;
    bgmGain.gain.setValueAtTime(0, start);
    bgmGain.gain.linearRampToValueAtTime(1, start + BGM_FADE);
    source.start(start, sourceParams(bgm01).offset);

    if (storyPart !== undefined) {
      applyStoryPart(storyPart);
    }
  };

  const setStoryPart = (part: number | null) => {
    overlayForPart(part); // Throws on a part that doesn't exist, before anything changes.
    storyPart = part;

    if (!destroyed) {
      applyStoryPart(part);
    }
  };

  const playSfx = (key: WorldSfxKey) => {
    if (destroyed || ctx.state !== "running") {
      return;
    }

    const source = createSource(key, worldBus);

    if (source === null) {
      return;
    }

    if (worldVoice !== null) {
      stopNow(worldVoice);
    }

    worldVoice = source;
    source.playbackRate.value = randomPitch(rng);
    source.onended = () => {
      source.disconnect();

      if (worldVoice === source) {
        worldVoice = null;
      }
    };
    source.start(0, sourceParams(manifest[key]).offset);
  };

  /** Starts a UI sound now; null while not running (a sound queued on a suspended context would burst out later). */
  const startUi = (key: UiSfxKey | UiLoopKey, opts: UiPlayOptions | undefined): AudioBufferSourceNode | null => {
    if (destroyed || ctx.state !== "running") {
      return null;
    }

    const source = createSource(key, uiBus);

    if (source === null) {
      return null;
    }

    source.playbackRate.value = opts?.rate ?? 1;
    source.onended = () => {
      source.disconnect();
      uiVoices.delete(source);
    };
    source.start(0, sourceParams(manifest[key]).offset);
    uiVoices.add(source);

    return source;
  };

  const playUi = (key: UiSfxKey, opts?: UiPlayOptions) => {
    startUi(key, opts);
  };

  const loopUi = (key: UiLoopKey, opts?: UiPlayOptions): UiLoop => {
    const source = startUi(key, opts);

    return {
      stop: () => {
        if (source !== null && uiVoices.delete(source)) {
          stopNow(source);
        }
      },
    };
  };

  const setMuted = (value: boolean) => {
    muted = value;
    writeStoredMute(value);

    if (destroyed) {
      return;
    }

    // No read of `gain.value` (stale or intrinsic on some engines): cancelling from now keeps the previous ramp's
    // curve up to now, and the new ramp continues from wherever that curve is.
    const now = ctx.currentTime;

    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(value ? 0 : 1, now, MUTE_TIME_CONSTANT);
  };

  const suspend = async () => {
    if (destroyed || ctx.state === "closed") {
      return;
    }

    try {
      await ctx.suspend();
    } catch {
      // Already closing: nothing to suspend.
    }
  };

  const resume = async () => {
    if (destroyed || ctx.state === "closed") {
      return false;
    }

    // Not allowed without a gesture rejects (or, on some iOS, never settles): both read as "not running".
    await Promise.race([ctx.resume().catch(() => undefined), realTimeout(RESUME_TIMEOUT_MS)]);
    notifyStatus();

    return ctx.state === "running";
  };

  const tick = () => {
    if (!destroyed && overlay?.plan?.mode === "per-bar") {
      refillPerBar(overlay, overlay.plan);
    }
  };

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    [bgmVoice, worldVoice, ...uiVoices, ...[...overlayVoices].map((voice) => voice.source)].forEach((source) => {
      if (source !== null) {
        stopNow(source);
      }
    });
    bgmVoice = null;
    worldVoice = null;
    uiVoices.clear();
    overlayVoices.clear();
    overlay = null;
    outgoing = null;
    ctx.removeEventListener("statechange", notifyStatus);
    ctx.close().catch(() => undefined);
    notifyStatus();
    statusListeners.clear();
  };

  const overlaySnapshot = (): AudioDebugSnapshot["overlay"] => {
    if (overlay === null || overlay.plan === null || overlay.part === null) {
      return null;
    }

    return {
      part: overlay.part,
      key: overlay.plan.key,
      mode: overlay.plan.mode,
      startAt: overlay.startAt,
      stopAt: Number.isFinite(overlay.stopAt) ? overlay.stopAt : null,
      pending: isPending(overlay, ctx.currentTime),
    };
  };

  return {
    load,
    get failed() {
      return failed;
    },
    unlock,
    startMusic,
    setStoryPart,
    playSfx,
    playUi,
    loopUi,
    setMuted,
    get muted() {
      return muted;
    },
    suspend,
    resume,
    get status() {
      return status();
    },
    onStatusChange: (listener) => {
      statusListeners.add(listener);

      return () => {
        statusListeners.delete(listener);
      };
    },
    tick,
    get debug(): AudioDebugSnapshot {
      return {
        contextState: ctx.state,
        status: status(),
        currentTime: ctx.currentTime,
        sampleRate: ctx.sampleRate,
        unlocked,
        muted,
        barAnchor: anchor,
        bar,
        storyPart,
        overlay: overlaySnapshot(),
        overlayStarts: overlayLog.map((entry) => ({ ...entry })),
        voices: {
          music: bgmVoice === null ? 0 : 1,
          overlay: overlayVoices.size,
          world: worldVoice === null ? 0 : 1,
          ui: uiVoices.size,
        },
        decoded: keys.filter((key) => buffers.has(key)),
        failed,
      };
    },
    destroy,
  };
};
