// Shows and hides scene objects, as cuts or with the original's fade clips, and keeps one clip per object: a new show,
// hide or clip on an object cuts the one it had. The ambient loops (world.ts) and the strikes (lightning.ts) keep
// their own handles. Pure TypeScript: the nodes are anything shaped like a Pixi Container, so it runs under
// `node --test`. Written by Claude Code.
import type { Clip } from "../../core/anim/clip.ts";
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
   * does nothing.
   */
  readonly show: (node: FadeNode, motion?: Motion, then?: () => void) => void;
  /** Hides `node`: at once, or after `motion`; either way it ends invisible at alpha 0. Idempotent too. */
  readonly hide: (node: FadeNode, motion?: Motion) => void;
  /** Plays `motion` on `node` (looping if the clip does), cutting the clip it had. Shown or hidden stays as it is. */
  readonly play: (node: FadeNode, motion: Motion) => void;
  /** Stops the clip on `node`, leaving it where it is. */
  readonly stop: (node: FadeNode) => void;
}

/** The fade `clip` at `fade`'s speed, or a cut. */
export const faded = (fade: Fade | undefined, clip: Clip, target?: AnimTarget): Motion | undefined =>
  fade === undefined ? undefined : { clip, speed: fade.speed, target };

export const createFades = (clips: ClipPlayer): Fades => {
  const playing = new Map<FadeNode, ClipHandle>();
  // What each node was last asked for: shown or hidden. A node never asked for is in neither state.
  const wanted = new Map<FadeNode, boolean>();

  const stop = (node: FadeNode) => {
    playing.get(node)?.stop();
    playing.delete(node);
  };

  const play = (node: FadeNode, { clip, speed, target }: Motion, onEnd?: () => void) => {
    stop(node);

    const handle = clips.play(clip, target ?? { node }, {
      speed,
      onEnd: () => {
        playing.delete(node);
        onEnd?.();
      },
    });

    playing.set(node, handle);
  };

  return {
    show: (node, motion, then) => {
      if (wanted.get(node) === true) {
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
      }
    },
    hide: (node, motion) => {
      if (wanted.get(node) === false) {
        return;
      }

      wanted.set(node, false);
      stop(node);

      const cut = () => {
        node.visible = false;
        node.alpha = 0;
      };

      if (motion === undefined) {
        cut();
      } else {
        play(node, motion, cut);
      }
    },
    play: (node, motion) => play(node, motion),
    stop,
  };
};
