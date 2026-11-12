// A challenge's arrows and cursors (top layer), its hold ring or press pips and its prompt (ui layer). The arrow and
// cursor sprites are a pool of pairs, each arrow with its pulse overlay: hidden and reused, never destroyed.
// Written by Claude Code.
import { Container, Graphics, Sprite, type Text } from "pixi.js";
import { CLIPS } from "../../assets/anims.ts";
import type { ClipHandle, ClipPlayer } from "../../core/anim/player.ts";
import { placeOnArtGrid, type Layers } from "../../core/layers.ts";
import type { Layout } from "../../core/layout.ts";
import type { ChallengeProgress, ChallengeSpec } from "../challenges/rule.ts";
import type { Direction } from "../direction.ts";
import type { Textures } from "./art-sprite.ts";
import { ARROW_SPRITES, CHALLENGE_PROMPTS, cursorKey, directionsOf, progressKey } from "./challenge-model.ts";
import { drawProgressArt } from "./progress-art.ts";
import { ARROW_ROW, arrowX, CHALLENGE_PROMPT, CURSOR_OFFSET } from "./positions.ts";
import { createUiText, placeUiText } from "./ui-text.ts";

export interface ChallengeView {
  readonly arrows: Container;
  readonly progress: Graphics;
  readonly prompt: Text;
  /** The arrows, cursors and prompt of a challenge, or none. Same spec object again: nothing is rebuilt. */
  readonly setChallenge: (spec: ChallengeSpec | null) => void;
  /** The cursors and the ring or pips. Deduplicated by `progressKey`, so it is cheap every frame. */
  readonly setProgress: (progress: ChallengeProgress | null) => void;
  /** Follows a new layout: the prompt and the progress art. */
  readonly relayout: (layout: Layout) => void;
  /** Reduced motion (game/motion.ts): an arrow's pulse held at full alpha and scale 1 instead, now and from then on. */
  readonly setPulseHeld: (held: boolean) => void;
}

/**
 * The pulse of a Hold or a Many arrow. Each arrow prefab (Assets/Prefabs/arrow_*.prefab) carries two children, "hold"
 * and "many", drawing the arrow's own sprite over it, their animators disabled; KeyManager enables the "hold" one
 * (`ArrowHold`: fading in from 1.5× down to the arrow) on a Hold arrow and the "many" one (`ArrowMany`: growing to
 * 1.35× as it fades out) on a Many arrow. A disabled child draws an exact copy of the opaque arrow on top of it, which
 * changes nothing (the art's alpha is 0 or 1), so the port keeps one overlay per arrow, shown only while it pulses.
 */
const PULSES = { hold: CLIPS.arrowHold, many: CLIPS.arrowMany } as const;

export const createChallengeView = (
  layers: Layers,
  textures: Textures,
  initial: Layout,
  clips: ClipPlayer,
): ChallengeView => {
  // Built hidden, as `setChallenge(null)` leaves them: the first Title must look like every replay's.
  const arrows = new Container({ label: "arrows", visible: false });
  const arrowSprites: Sprite[] = [];
  const cursorSprites: Sprite[] = [];
  const pulseSprites: Sprite[] = [];
  let pulse: ClipHandle | null = null;
  let pulseKind: keyof typeof PULSES | null = null;
  let pulseHeld = false;

  layers.top.addChild(arrows);

  const progress = new Graphics({ label: "challenge-progress" });

  layers.ui.addChild(progress);

  const prompt = createUiText(layers.ui, CHALLENGE_PROMPT, "", false);

  let layout = initial;
  let challenge: ChallengeSpec | null = null;
  let shownProgress: ChallengeProgress | null = null;
  let shownKey = "";

  /** Grows the pool to `count` pairs, each cursor appended before its arrow, and the arrow's pulse after it. */
  const ensureArrowPairs = (count: number) => {
    while (arrowSprites.length < count) {
      const cursor = new Sprite({ texture: textures.cursorEmpty, anchor: 0.5, label: "cursor" });

      cursorSprites.push(arrows.addChild(cursor));
      arrowSprites.push(arrows.addChild(new Sprite({ texture: textures.arrowUp, anchor: 0.5, label: "arrow" })));
      pulseSprites.push(arrows.addChild(new Sprite({
        texture: textures.arrowUp,
        anchor: 0.5,
        label: "arrow-pulse",
        visible: false,
      })));
    }
  };

  /** Stops the pulse, if any: its overlay hidden, back at scale 1. */
  const stopPulse = () => {
    pulse?.stop();
    pulse = null;
    pulseKind = null;

    for (const sprite of pulseSprites) {
      sprite.visible = false;
      sprite.scale.set(1);
    }
  };

  /** Plays the pulse on arrow 0's overlay, from its start, or holds it there at alpha 1 and scale 1. */
  const playPulse = () => {
    const [sprite] = pulseSprites;

    pulse?.stop();
    pulse = null;

    if (pulseKind === null) {
      return;
    }

    if (pulseHeld) {
      sprite.alpha = 1;
      sprite.scale.set(1);
    } else {
      pulse = clips.play(PULSES[pulseKind], { node: sprite });
    }
  };

  /** Pulses arrow 0, the only one of a Hold or a Many, over the arrow and on its texture and place. */
  const startPulse = (kind: keyof typeof PULSES) => {
    const [arrow] = arrowSprites;
    const [sprite] = pulseSprites;

    sprite.texture = arrow.texture;
    sprite.position.copyFrom(arrow.position);
    sprite.visible = true;
    pulseKind = kind;
    playPulse();
  };

  /** Shows pair `index` as arrow `dir` in a row of `count`, the cursor under it. */
  const showArrowPair = (index: number, dir: Direction, count: number) => {
    const arrow = arrowSprites[index];
    const cursor = cursorSprites[index];
    const x = arrowX(index, count);

    arrow.visible = true;
    cursor.visible = true;
    arrow.texture = textures[ARROW_SPRITES[dir]];
    placeOnArtGrid(arrow, x, ARROW_ROW.y);
    placeOnArtGrid(cursor, x, ARROW_ROW.y + CURSOR_OFFSET);
  };

  // A hidden pair keeps its last texture and place; a later challenge sets them again before showing it.
  const hideArrowPair = (index: number) => {
    arrowSprites[index].visible = false;
    cursorSprites[index].visible = false;
  };

  const resetProgress = () => {
    shownProgress = null;
    shownKey = "";
    progress.clear();
  };

  // Every cursor in the pool is set, shown or not: a pair shown by a later challenge keeps this texture until its
  // first setProgress.
  const updateCursors = (current: ChallengeProgress) => {
    for (let i = 0; i < cursorSprites.length; i++) {
      cursorSprites[i].texture = textures[cursorKey(i, current)];
    }
  };

  const drawProgress = () => {
    progress.clear();

    const current = shownProgress;

    if (challenge === null || current === null) {
      return;
    }

    updateCursors(current);

    if (current.kind !== "sequence") {
      drawProgressArt(progress, layout, current);
    }
  };

  return {
    arrows,
    progress,
    prompt,
    setChallenge: (spec) => {
      if (spec === challenge) {
        return;
      }

      challenge = spec;
      resetProgress();
      stopPulse();
      arrows.visible = spec !== null;
      prompt.visible = spec !== null;
      prompt.text = spec === null ? "" : CHALLENGE_PROMPTS[spec.kind];

      const directions = directionsOf(spec);

      ensureArrowPairs(directions.length);

      for (let index = 0; index < arrowSprites.length; index++) {
        const dir = directions[index];

        if (dir === undefined) {
          hideArrowPair(index);
        } else {
          showArrowPair(index, dir, directions.length);
        }
      }

      // Cursors and arrows were added in pairs; draw every cursor first, as their sortingOrder (0 under 1).
      for (const cursor of cursorSprites) {
        arrows.setChildIndex(cursor, 0);
      }

      if (spec !== null && spec.kind !== "sequence") {
        startPulse(spec.kind);
      }
    },
    setProgress: (next) => {
      const key = progressKey(next);

      if (key === shownKey) {
        return;
      }

      shownKey = key;
      shownProgress = next;
      drawProgress();
    },
    relayout: (next) => {
      layout = next;
      placeUiText(prompt, CHALLENGE_PROMPT, next);
      drawProgress();
    },
    setPulseHeld: (held) => {
      pulseHeld = held;
      playPulse();
    },
  };
};
