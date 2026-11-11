// A challenge's arrows and cursors (top layer), its hold ring or press pips and its prompt (ui layer). The arrow and
// cursor sprites are a pool of pairs: hidden and reused, never destroyed. Written by Claude Code.
import { Container, Graphics, Sprite, type Text } from "pixi.js";
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
}

export const createChallengeView = (layers: Layers, textures: Textures, initial: Layout): ChallengeView => {
  // Built hidden, as `setChallenge(null)` leaves them: the first Title must look like every replay's.
  const arrows = new Container({ label: "arrows", visible: false });
  const arrowSprites: Sprite[] = [];
  const cursorSprites: Sprite[] = [];

  layers.top.addChild(arrows);

  const progress = new Graphics({ label: "challenge-progress" });

  layers.ui.addChild(progress);

  const prompt = createUiText(layers.ui, CHALLENGE_PROMPT, "", false);

  let layout = initial;
  let challenge: ChallengeSpec | null = null;
  let shownProgress: ChallengeProgress | null = null;
  let shownKey = "";

  /** Grows the pool to `count` pairs, each cursor appended before its arrow. */
  const ensureArrowPairs = (count: number) => {
    while (arrowSprites.length < count) {
      const cursor = new Sprite({ texture: textures.cursorEmpty, anchor: 0.5, label: "cursor" });

      cursorSprites.push(arrows.addChild(cursor));
      arrowSprites.push(arrows.addChild(new Sprite({ texture: textures.arrowUp, anchor: 0.5, label: "arrow" })));
    }
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

  // Every cursor in the pool is set, shown or not, as the scene always did.
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
  };
};
