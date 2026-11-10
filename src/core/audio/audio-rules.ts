// Small pure rules of the audio engine: source parameters, mute persistence, context status, SFX pitch.
// Written by Claude Code.
import type { AudioAsset } from "../../assets/manifest.ts";

/**
 * What `AudioBufferSourceNode` gets for an asset: `start(when, offset)` plus the loop fields. There is deliberately no
 * duration: a duration would stop a loop after one pass, and one-shots play to the end of the buffer (manifest note).
 */
export interface SourceParams {
  readonly offset: number;
  readonly loop: boolean;
  readonly loopStart: number;
  readonly loopEnd: number;
}

export const sourceParams = (asset: AudioAsset): SourceParams =>
  asset.loop
    ? { offset: asset.offset, loop: true, loopStart: asset.loopStart, loopEnd: asset.loopEnd }
    : { offset: asset.offset, loop: false, loopStart: 0, loopEnd: 0 };

export const MUTE_STORAGE_KEY = "mini-one.audio.muted";

/** The stored mute flag. Anything but "1" or "0" (missing, corrupt, from another version) is the default: unmuted. */
export const parseMuted = (raw: string | null): boolean => raw === "1";

export const serializeMuted = (muted: boolean): string => (muted ? "1" : "0");

/**
 * - `locked`: `unlock()` hasn't been called from a user gesture yet;
 * - `running`: the context runs;
 * - `needs-gesture`: suspended, iOS's `interrupted`, or anything unknown: only a tap (`unlock()`) is sure to resume;
 * - `closed`: the context is gone (destroyed); nothing will play again.
 */
export type AudioStatus = "locked" | "running" | "needs-gesture" | "closed";

export const statusFor = (state: string, unlocked: boolean): AudioStatus => {
  if (state === "closed") {
    return "closed";
  }

  if (!unlocked) {
    return "locked";
  }

  return state === "running" ? "running" : "needs-gesture";
};

/** World SFX pitch range (SoundManager.lowPitchRange / highPitchRange). */
export const PITCH_LOW = 0.95;
export const PITCH_HIGH = 1.05;

/** A random `playbackRate` in [low, high], from an RNG returning [0, 1) like Math.random. Out-of-range draws clamp. */
export const randomPitch = (rng: () => number, low = PITCH_LOW, high = PITCH_HIGH): number => {
  const draw = Math.min(1, Math.max(0, rng()));

  return low + draw * (high - low);
};
