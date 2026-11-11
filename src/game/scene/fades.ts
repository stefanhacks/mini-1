// Shows and hides scene objects, as cuts or with the original's fade clips, and keeps one clip per object: a new show,
// hide or clip on an object cuts the one it had. The ambient loops (world.ts) and the strikes (lightning.ts) keep
// their own handles. Pure TypeScript: the nodes are anything shaped like a Pixi Container, so it runs under
// `node --test`. Written by Claude Code.
import type { Clip, CurveAttribute, Keyframe } from "../../core/anim/clip.ts";
import type { AnimNode, AnimTarget, ClipHandle, ClipPlayer } from "../../core/anim/player.ts";
import type { Fade } from "../states/types.ts";

/** A scene object as the fades see it. */
export interface FadeNode extends AnimNode {
  visible: boolean;
}

/** A clip to play on a node: at `speed`, on `target` (default: the node itself, for clips with no position). */
export interface Motion {
  readonly clip: Clip;
  readonly speed: number;
  readonly target?: AnimTarget;
}

export interface Fades {
  /**
   * Shows `node`: at once at alpha 1 without `motion`, else visible at once and `motion` plays (it starts the fade at
   * its own first value). `then` runs after the fade, or at once for a cut. Asking again while shown, or fading in,
   * does nothing, except that a cut ends a fade-in at once.
   */
  readonly show: (node: FadeNode, motion?: Motion, then?: () => void) => void;
  /**
   * Hides `node`: at once, or after `motion`; either way it ends invisible at alpha 0. Idempotent too, except that a
   * cut ends a fade-out at once. A fade-out that cuts a fade-in short starts from the alpha the fade-in reached.
   */
  readonly hide: (node: FadeNode, motion?: Motion) => void;
  /** Plays `motion` on `node` (looping if the clip does), cutting the clip it had. Shown or hidden stays as it is. */
  readonly play: (node: FadeNode, motion: Motion) => void;
  /** Stops the clip on `node`, leaving it where it is. */
  readonly stop: (node: FadeNode) => void;
}

/** The fade `clip` at `fade`'s speed, or a cut. */
export const faded = (fade: Fade | undefined, clip: Clip, target?: AnimTarget): Motion | undefined =>
  fade === undefined ? undefined : { clip, speed: fade.speed, target };

const ALPHA_ATTRIBUTES: ReadonlySet<CurveAttribute> = new Set(["m_Color.a", "m_fontColor.a"]);

/** `motion` with its alpha curves scaled by `alpha`, so a fade-out from 1 starts at `alpha` instead. */
const scaleAlpha = ({ clip, speed, target }: Motion, alpha: number): Motion => {
  // A constant tangent's slope is infinite: scaling it would give NaN at alpha 0, and it stays constant anyway.
  const scale = (slope: number) => (Number.isFinite(slope) ? slope * alpha : slope);
  const scaleKey = (key: Keyframe): Keyframe =>
    ({ ...key, value: key.value * alpha, inSlope: scale(key.inSlope), outSlope: scale(key.outSlope) });
  const curves = clip.curves.map((curve) =>
    ALPHA_ATTRIBUTES.has(curve.attribute) ? { ...curve, keys: curve.keys.map(scaleKey) } : curve);

  return { clip: { ...clip, curves }, speed, target };
};

export const createFades = (clips: ClipPlayer): Fades => {
  const playing = new Map<FadeNode, ClipHandle>();
  // What each node was last asked for: shown or hidden. A node never asked for is in neither state.
  const wanted = new Map<FadeNode, boolean>();
  // The nodes whose show fade is running.
  const fadingIn = new Set<FadeNode>();

  const stop = (node: FadeNode) => {
    playing.get(node)?.stop();
    playing.delete(node);
    fadingIn.delete(node);
  };

  const play = (node: FadeNode, { clip, speed, target }: Motion, onEnd?: () => void) => {
    stop(node);

    const handle = clips.play(clip, target ?? { node }, {
      speed,
      onEnd: () => {
        playing.delete(node);
        fadingIn.delete(node);
        onEnd?.();
      },
    });

    playing.set(node, handle);
  };

  const cutOut = (node: FadeNode) => {
    stop(node);
    node.visible = false;
    node.alpha = 0;
  };

  return {
    show: (node, motion, then) => {
      // A cut always wins: it ends a running fade-in, where a second fade-in leaves it be.
      if (wanted.get(node) === true && (motion !== undefined || !fadingIn.has(node))) {
        return;
      }

      wanted.set(node, true);
      stop(node);
      node.visible = true;

      if (motion === undefined) {
        node.alpha = 1;
        then?.();
      } else {
        play(node, motion, then);
        fadingIn.add(node);
      }
    },
    hide: (node, motion) => {
      // A cut always wins here too, over a running fade-out.
      if (wanted.get(node) === false && (motion !== undefined || !playing.has(node))) {
        return;
      }

      const from = fadingIn.has(node) ? Math.min(node.alpha, 1) : 1;

      wanted.set(node, false);

      if (motion === undefined) {
        cutOut(node);
      } else {
        play(node, from < 1 ? scaleAlpha(motion, from) : motion, () => cutOut(node));
      }
    },
    play: (node, motion) => play(node, motion),
    stop,
  };
};
