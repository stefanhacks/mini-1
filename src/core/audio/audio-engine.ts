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
// with `start(t)` / `stop(t)`. `overlayPhase04` needs a new source every bar: it is scheduled up to a bar ahead and
// refilled from two triggers, both idempotent (planPerBarStarts keeps a "next bar index"): each voice's `ended` event
// (~7.2 s into its bar, ~2.4 s before the next one is due) and `tick()`, once per frame, as a safety net if `ended`
// comes late. This isn't polling: they only do work once per bar, and all timing is on the audio clock.
import { AUDIO, type AudioAsset, type AudioKey } from "../../assets/manifest.ts";
import { barLength, barsFromAnchor, barIndexAtOrAfter, MIN_LEAD, nextBarTime } from "./bar-clock.ts";
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

/** Manifest entries that loop, for `loopUi`. */
export type UiLoopKey = { [K in AudioKey]: (typeof AUDIO)[K] extends { readonly loop: true } ? K : never }[AudioKey];

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
  /** The overlay track asked for last: what plays (or will, from its bar) and when it stops (null: plays on). */
  readonly overlay: {
    readonly part: number;
    readonly key: OverlayKey;
    readonly mode: OverlayMode;
    readonly startAt: number;
    readonly stopAt: number | null;
  } | null;
  /**
   * The last overlay starts scheduled, oldest first (at most 32), with their distance from the anchor in bars. A start
   * cancelled before it played (a newer change on the same bar) is removed.
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
   * `AudioLoadError` when any entry failed; call it again to retry just those. Concurrent calls share one run.
   */
  load(onProgress?: (loaded: number, total: number) => void): Promise<void>;
  /** The entries whose last load failed. */
  readonly failed: readonly AudioKey[];
  /**
   * Call synchronously inside a user-gesture handler (`pointerup`, `touchend`, `keydown`; never `pointerdown`):
   * resumes the context, plays a 1-sample silent buffer (older iOS), and asks iOS for the "playback" audio session.
   * Idempotent; also the way back from `needs-gesture` ("Tap to continue").
   */
  unlock(): void;
  /**
   * Starts BGM01, looped, with a 1 s fade-in (the original's `WakeUp`), and anchors the bar grid. Once per engine;
   * later calls do nothing. Does nothing if BGM01 isn't decoded (see `debug.barAnchor`).
   */
  startMusic(): void;
  /**
   * The overlay for a story part (0..3), or none (null), from the next bar on. The same part again while it plays
   * changes nothing; any other change, a replay's part 0 included, lands on the next bar. Before `startMusic` it only
   * records the part, which then starts with the music. Throws a RangeError on a part that doesn't exist.
   */
  setStoryPart(part: number | null): void;
  /** A world SFX at a random pitch (0.95..1.05), cutting the previous one. Skipped while the context isn't running. */
  playSfx(key: WorldSfxKey): void;
  /** A UI one-shot; many can overlap. Skipped while the context isn't running. */
  playUi(key: AudioKey, opts?: UiPlayOptions): void;
  /** A looping UI sound (e.g. `creakLoop`) until its handle's `stop()`. */
  loopUi(key: UiLoopKey, opts?: UiPlayOptions): UiLoop;
  /** Mutes or unmutes (a short master ramp), and stores the choice. */
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Suspends the context (hidden tab). Never rejects. */
  suspend(): Promise<void>;
  /**
   * Tries to resume without a gesture (visible again, bfcache restore). True if the context runs afterwards; false
   * means "show Tap to continue" and call `unlock()` on the tap. The promise may stay pending on some iOS versions
   * outside a gesture, so don't block the game on it.
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

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly key: AudioKey;
  readonly start: number;
  stopAt: number;
}

interface OverlayTrack {
  readonly part: number;
  readonly plan: OverlayPlan;
  readonly startAt: number;
  stopAt: number;
  nextIndex: number;
  readonly voices: Set<Voice>;
}

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
  // How far ahead per-bar overlays are scheduled: one bar plus the lead, so a new track's first bar (up to a bar plus
  // the lead away) is scheduled at once, and each voice's `ended` schedules the next bar.
  const schedulingHorizon = bar + MIN_LEAD;

  const master = ctx.createGain();
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
  let unlocked = false;
  let destroyed = false;
  let anchor: number | null = null;
  let bgmVoice: AudioBufferSourceNode | null = null;
  let storyPart: number | null | undefined;
  let overlay: OverlayTrack | null = null;
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

  const load = (onProgress: (loaded: number, total: number) => void = () => undefined): Promise<void> => {
    loading ??= (async () => {
      const pending = keys.filter((key) => !buffers.has(key));
      let loaded = keys.length - pending.length;

      onProgress(loaded, keys.length);

      const results = await Promise.allSettled(
        pending.map(async (key) => {
          const buffer = await fetchAndDecode(ctx, manifest[key].url);

          buffers.set(key, buffer);
          loaded += 1;
          onProgress(loaded, keys.length);
        }),
      );

      failed = pending.filter((_, i) => results[i]?.status === "rejected");

      const rejection = results.find((result) => result.status === "rejected");

      if (rejection !== undefined) {
        throw new AudioLoadError(failed, rejection.reason);
      }
    })().finally(() => {
      loading = null;
    });

    return loading;
  };

  const unlock = () => {
    if (destroyed) {
      return;
    }

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

    if (!unlocked) {
      // Older iOS only unlocks Web Audio once a source has started inside a gesture.
      const silence = ctx.createBufferSource();

      silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silence.connect(ctx.destination);
      silence.onended = () => silence.disconnect();
      silence.start(0);
      unlocked = true;
    }

    notifyStatus();
  };

  const logOverlayStart = (key: OverlayKey, time: number) => {
    overlayLog.push({ key, time, bars: anchor === null ? 0 : barsFromAnchor(time, anchor, bar) });

    if (overlayLog.length > MAX_OVERLAY_LOG) {
      overlayLog.shift();
    }
  };

  /** Schedules one overlay source at `time`, tracked until it ends. */
  const startOverlayVoice = (track: OverlayTrack, time: number) => {
    const source = createSource(track.plan.key, overlayGain);

    if (source === null) {
      return;
    }

    const voice: Voice = { source, key: track.plan.key, start: time, stopAt: track.stopAt };

    source.onended = () => {
      source.disconnect();
      overlayVoices.delete(voice);
      track.voices.delete(voice);

      if (track.plan.mode === "per-bar" && overlay === track) {
        refillPerBar(track);
      }
    };
    source.start(time, sourceParams(manifest[track.plan.key]).offset);

    if (Number.isFinite(track.stopAt)) {
      source.stop(track.stopAt);
    }

    overlayVoices.add(voice);
    track.voices.add(voice);
    logOverlayStart(track.plan.key, time);
  };

  const refillPerBar = (track: OverlayTrack) => {
    if (anchor === null) {
      return;
    }

    const plan = planPerBarStarts({
      nextIndex: track.nextIndex,
      now: ctx.currentTime,
      anchor,
      bar,
      horizon: schedulingHorizon,
      stopAt: track.stopAt,
    });

    track.nextIndex = plan.nextIndex;
    plan.starts.forEach((time) => startOverlayVoice(track, time));
  };

  /** Ends a track at `time`: voices that would start then or later are dropped now, the others stop at `time`. */
  const stopTrack = (track: OverlayTrack, time: number) => {
    track.stopAt = Math.min(track.stopAt, time);

    track.voices.forEach((voice) => {
      if (voice.start >= time) {
        const logged = overlayLog.findIndex((entry) => entry.key === voice.key && entry.time === voice.start);

        if (logged >= 0) {
          overlayLog.splice(logged, 1);
        }

        stopNow(voice.source);
        overlayVoices.delete(voice);
        track.voices.delete(voice);
      } else if (voice.stopAt > time) {
        voice.stopAt = time;
        voice.source.stop(time);
      }
    });
  };

  const applyStoryPart = (part: number | null) => {
    if (anchor === null) {
      return;
    }

    const live = overlay !== null && (overlay.voices.size > 0 || overlay.startAt > ctx.currentTime);

    if (overlay !== null && overlay.part === part && live) {
      return;
    }

    const plan = overlayForPart(part);
    const time = nextBarTime(ctx.currentTime, anchor, bar);

    if (overlay !== null) {
      stopTrack(overlay, time);
    }

    const gain = overlayGain.gain;

    if (plan === null || part === null) {
      overlay = null;
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

    const track: OverlayTrack = {
      part,
      plan,
      startAt: time,
      stopAt: Infinity,
      nextIndex: barIndexAtOrAfter(time, anchor, bar),
      voices: new Set(),
    };

    overlay = track;

    if (plan.mode === "per-bar") {
      refillPerBar(track);
    } else {
      startOverlayVoice(track, time);
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

  const startUi = (key: AudioKey, opts: UiPlayOptions | undefined): AudioBufferSourceNode | null => {
    if (destroyed) {
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

  const playUi = (key: AudioKey, opts?: UiPlayOptions) => {
    if (ctx.state === "running") {
      startUi(key, opts);
    }
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

    const now = ctx.currentTime;
    const gain = master.gain;

    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.setTargetAtTime(value ? 0 : 1, now, MUTE_TIME_CONSTANT);
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

    try {
      await ctx.resume();
    } catch {
      // Not allowed without a gesture: reported as false.
    }

    notifyStatus();

    return ctx.state === "running";
  };

  const tick = () => {
    if (!destroyed && overlay !== null && overlay.plan.mode === "per-bar") {
      refillPerBar(overlay);
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
    ctx.removeEventListener("statechange", notifyStatus);
    ctx.close().catch(() => undefined);
    notifyStatus();
    statusListeners.clear();
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
        overlay: overlay === null
          ? null
          : {
            part: overlay.part,
            key: overlay.plan.key,
            mode: overlay.plan.mode,
            startAt: overlay.startAt,
            stopAt: Number.isFinite(overlay.stopAt) ? overlay.stopAt : null,
          },
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
