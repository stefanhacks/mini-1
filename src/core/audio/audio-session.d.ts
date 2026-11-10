// The Audio Session API (`navigator.audioSession`, Safari 16.4+), which TypeScript's lib.dom doesn't declare yet.
// Optional on purpose: feature-detect before use. If lib.dom adds it, delete this file. Written by Claude Code.

type AudioSessionType = "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";

type AudioSessionState = "inactive" | "active" | "interrupted";

interface AudioSession extends EventTarget {
  type: AudioSessionType;
  readonly state: AudioSessionState;
}

interface Navigator {
  readonly audioSession?: AudioSession;
}
