// Plays the imported Unity clips (src/assets/anims.ts) on display objects, driven by game time. Pure TypeScript: the
// nodes are anything shaped like a Pixi Sprite, so it runs under `node --test`. Written by Claude Code.
//
// Time: the app calls `sync(clock.now)` once per frame, right after the game step (frame-loop.ts). A clip's time is
// (now − start) × speed, so it stands still while the clock is paused or the game logic halted, and follows
// `?timescale`; there is no setTimeout or requestAnimationFrame. A clip started with `play` begins at the clock's
// `now` at that call (the due time, inside a timer callback), or, from an event or end callback, at that event's own
// time, so chained clips don't drift by a frame. Without a clock it begins at the next `sync`.
//
// Values: every channel is absolute, as in Unity.
// - Alpha (m_Color.a, m_fontColor.a) sets `alpha`.
// - Position (m_AnchoredPosition, m_LocalPosition): `origin + (x, −y)` in playfield px (unity-space.ts), then snapped
//   onto whole art pixels like `placeOnArtGrid`. An axis the clip doesn't animate keeps its value (snapped again,
//   which leaves a placed node where it is). A position curve needs the binding's `origin`.
// - Rotation (localEulerAnglesRaw.z): degrees to radians, sign flipped. Not snapped.
// - Scale (m_LocalScale): times `baseScale` (default 1, 1). Not snapped.
// - Height (m_SizeDelta.y): `scale.y = baseScale.y × value / baseHeight`, only when the binding sets `baseHeight`;
//   ignored otherwise. A SpriteRenderer in Simple draw mode ignores its RectTransform's size in Unity, and SeaAnimTrês
//   (the only clip with it) holds it at 0, so it should stay unbound there.
// Scale is applied before position, so the snap uses the drawn size of that frame.
//
// Events fire once each time the clip's time crosses them, in time order, also across loop wraps (an event at 0 fires
// at the start of every cycle). A one-shot clip ends at its length: its last pose is applied, then `onEnd` runs and the
// clip is dropped (its nodes keep that pose). `stop` and `clear` drop clips without `onEnd`.
// Callbacks run inside `sync`: a throw propagates to the caller (the frame loop's game-logic guard), after the clip
// has recorded the event, so it never fires twice.
import type { Point } from "../layout.ts";
import type { Clip, ClipEvent, Curve, Keyframe } from "./clip.ts";
import { evaluateCurve } from "./hermite.ts";
import { placeNodeOnArtGrid, toPixiRotation, toPlayfieldX, toPlayfieldY, type GridNode } from "./unity-space.ts";

/** A display object as the player sees it: a Pixi Sprite, Text or Container fits. */
export interface AnimNode extends GridNode {
  alpha: number;
  rotation: number;
  readonly scale: { x: number; y: number };
}

export interface AnimBinding {
  readonly node: AnimNode;
  /** Playfield px where the clip's position (0, 0) puts the node (unity-space.ts). Needed for position curves. */
  readonly origin?: Point;
  /** Multiplies m_LocalScale and m_SizeDelta.y: a mirrored bolt, a ui text at its layout scale. Default (1, 1). */
  readonly baseScale?: Point;
  /** The height that m_SizeDelta.y is measured against; without it the channel is ignored. */
  readonly baseHeight?: number;
}

/** The animator's own object, plus its children by the clip's curve paths ("QuebradoSprite"). */
export interface AnimTarget extends AnimBinding {
  readonly children?: Readonly<Record<string, AnimBinding>>;
}

export interface ClipHandle {
  /** Drops the clip where it is, without `onEnd`. */
  readonly stop: () => void;
  /** Whether it ended or was stopped. */
  readonly done: boolean;
}

export interface PlayOptions {
  /** Defaults to the clip's own `loop`. */
  readonly loop?: boolean;
  /** Clip seconds per game second, > 0. Default 1; the ending card plays at 0.5. */
  readonly speed?: number;
  readonly onEvent?: (name: string) => void;
  /** After a one-shot clip's last pose. Never for a looping clip. */
  readonly onEnd?: () => void;
}

export interface ClipPlayer {
  readonly play: (clip: Clip, target: AnimTarget, options?: PlayOptions) => ClipHandle;
  /** Advances every clip to `now` (game ms) and applies their poses. Call once per frame, after the game step. */
  readonly sync: (now: number) => void;
  /** Drops every clip, without `onEnd`. */
  readonly clear: () => void;
  /** How many clips are playing, for `debug.anim`. */
  readonly active: number;
}

interface Channels {
  alpha?: readonly Keyframe[];
  x?: readonly Keyframe[];
  y?: readonly Keyframe[];
  rotation?: readonly Keyframe[];
  scaleX?: readonly Keyframe[];
  scaleY?: readonly Keyframe[];
  height?: readonly Keyframe[];
}

type ChannelName = keyof Channels;

const CHANNELS: Readonly<Record<Curve["attribute"], ChannelName>> = {
  "m_Color.a": "alpha",
  "m_fontColor.a": "alpha",
  "m_AnchoredPosition.x": "x",
  "m_AnchoredPosition.y": "y",
  "m_LocalPosition.x": "x",
  "m_LocalPosition.y": "y",
  "localEulerAnglesRaw.z": "rotation",
  "m_LocalScale.x": "scaleX",
  "m_LocalScale.y": "scaleY",
  "m_SizeDelta.y": "height",
};

interface BoundNode {
  readonly binding: AnimBinding;
  readonly channels: Channels;
}

interface Playback {
  readonly clip: Clip;
  readonly nodes: readonly BoundNode[];
  readonly loop: boolean;
  readonly speed: number;
  readonly options: PlayOptions;
  /** Game ms at the clip's time 0; null until the first `sync` when there is no clock. */
  start: number | null;
  /** Clip seconds already played, not wrapped; −1 before the first `sync`, so events at 0 fire. */
  played: number;
  done: boolean;
}

const UNIT = { x: 1, y: 1 } as const;

const bindingFor = (target: AnimTarget, path: string, clip: Clip) => {
  const binding = path === "" ? target : target.children?.[path];

  if (binding === undefined) {
    throw new Error(`${clip.name}: the target has no child "${path}"`);
  }

  return binding;
};

// Groups the clip's curves by node, checking up front what `apply` would trip on.
const bind = (clip: Clip, target: AnimTarget): BoundNode[] => {
  const nodes = new Map<AnimBinding, Channels>();

  for (const curve of clip.curves) {
    const binding = bindingFor(target, curve.path, clip);
    const channels = nodes.get(binding) ?? {};
    const channel = CHANNELS[curve.attribute];

    if (channels[channel] !== undefined) {
      throw new Error(`${clip.name}: two curves drive "${channel}" on "${curve.path}"`);
    }

    if ((channel === "x" || channel === "y") && binding.origin === undefined) {
      throw new Error(`${clip.name}: "${curve.path}" has position curves but no origin`);
    }

    channels[channel] = curve.keys;
    nodes.set(binding, channels);
  }

  return [...nodes].map(([binding, channels]) => ({ binding, channels }));
};

const valueAt = (keys: readonly Keyframe[] | undefined, time: number) =>
  keys === undefined ? undefined : evaluateCurve(keys, time);

const applyNode = ({ binding, channels }: BoundNode, time: number) => {
  const { node, origin, baseScale = UNIT, baseHeight } = binding;
  const alpha = valueAt(channels.alpha, time);
  const rotation = valueAt(channels.rotation, time);
  const scaleX = valueAt(channels.scaleX, time);
  const scaleY = valueAt(channels.scaleY, time);
  const height = baseHeight === undefined ? undefined : valueAt(channels.height, time);
  const x = valueAt(channels.x, time);
  const y = valueAt(channels.y, time);

  if (alpha !== undefined) {
    node.alpha = alpha;
  }

  if (rotation !== undefined) {
    node.rotation = toPixiRotation(rotation);
  }

  if (scaleX !== undefined) {
    node.scale.x = baseScale.x * scaleX;
  }

  if (scaleY !== undefined) {
    node.scale.y = baseScale.y * scaleY;
  }

  if (height !== undefined && baseHeight !== undefined) {
    node.scale.y = (baseScale.y * height) / baseHeight;
  }

  if ((x !== undefined || y !== undefined) && origin !== undefined) {
    placeNodeOnArtGrid(
      node,
      x === undefined ? node.position.x : toPlayfieldX(origin, x),
      y === undefined ? node.position.y : toPlayfieldY(origin, y),
    );
  }
};

/** The events crossed in (from, to], clip seconds unwrapped, as [unwrapped time, event] in order. */
const crossedEvents = (playback: Playback, from: number, to: number) => {
  const { clip, loop } = playback;
  const crossed: [number, ClipEvent][] = [];

  if (!loop || clip.length <= 0) {
    for (const event of clip.events) {
      if (event.time > from && event.time <= Math.min(to, clip.length)) {
        crossed.push([event.time, event]);
      }
    }

    return crossed;
  }

  for (let cycle = Math.max(0, Math.floor(from / clip.length)); cycle <= Math.floor(to / clip.length); cycle++) {
    for (const event of clip.events) {
      const time = cycle * clip.length + event.time;

      if (time > from && time <= to) {
        crossed.push([time, event]);
      }
    }
  }

  return crossed;
};

/**
 * One player for the app. With `clock`, a clip starts at the clock's time when `play` is called; without it, at the
 * next `sync`.
 */
export const createClipPlayer = (clock?: { readonly now: number }): ClipPlayer => {
  let playing: Playback[] = [];
  // While an event or end callback runs: the game ms it happened at, where clips it starts begin.
  let callbackTime: number | null = null;

  const runCallback = (time: number, callback: () => void) => {
    const outer = callbackTime;

    callbackTime = time;

    try {
      callback();
    } finally {
      callbackTime = outer;
    }
  };

  const toGameMs = (playback: Playback, clipSeconds: number) =>
    (playback.start ?? 0) + (clipSeconds * 1000) / playback.speed;

  const advance = (playback: Playback, now: number) => {
    playback.start ??= now;

    const { clip, loop, options } = playback;
    const elapsed = Math.max(playback.played, ((now - playback.start) / 1000) * playback.speed);

    for (const [time, event] of crossedEvents(playback, playback.played, elapsed)) {
      playback.played = time;

      if (options.onEvent !== undefined) {
        const { onEvent } = options;

        runCallback(toGameMs(playback, time), () => onEvent(event.functionName));
      }

      if (playback.done) {
        return;
      }
    }

    playback.played = elapsed;

    const ended = !loop && elapsed >= clip.length;
    const time = ended ? clip.length : loop && clip.length > 0 ? elapsed % clip.length : elapsed;

    for (const node of playback.nodes) {
      applyNode(node, time);
    }

    if (ended) {
      playback.done = true;

      if (options.onEnd !== undefined) {
        runCallback(toGameMs(playback, clip.length), options.onEnd);
      }
    }
  };

  return {
    play: (clip, target, options = {}) => {
      const speed = options.speed ?? 1;

      if (!(speed > 0) || !Number.isFinite(speed)) {
        throw new RangeError(`play() needs a finite speed > 0, got ${speed}`);
      }

      const playback: Playback = {
        clip,
        nodes: bind(clip, target),
        loop: options.loop ?? clip.loop,
        speed,
        options,
        start: callbackTime ?? clock?.now ?? null,
        played: -1,
        done: false,
      };

      playing.push(playback);

      return {
        stop: () => {
          playback.done = true;
        },
        get done() {
          return playback.done;
        },
      };
    },
    sync: (now) => {
      try {
        // By index: clips started by a callback join this same pass, from their own start time.
        for (let index = 0; index < playing.length; index++) {
          if (!playing[index].done) {
            advance(playing[index], now);
          }
        }
      } finally {
        playing = playing.filter((playback) => !playback.done);
      }
    },
    clear: () => {
      for (const playback of playing) {
        playback.done = true;
      }

      playing = [];
    },
    get active() {
      return playing.filter((playback) => !playback.done).length;
    },
  };
};
