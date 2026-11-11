// The game's scene: every sprite and text built once, shown and hidden per scene state. The states drive it through
// SceneView (states/types.ts); M2 cuts instantly, M4 adds the tweens. Composition only: each part lives in scene/,
// the positions and draw order in scene/positions.ts.
//
// The parts are built in draw order, each appending to its layers: world → fx → story → challenge → title. That gives
// top: text box, arrows, logo; ui: story text, challenge progress, challenge prompt, tap prompt, credits.
import type { Graphics, Sprite, Container, Text } from "pixi.js";
import type { Layers } from "../core/layers.ts";
import type { Layout } from "../core/layout.ts";
import type { SceneView } from "./states/types.ts";
import type { Textures } from "./scene/art-sprite.ts";
import { createChallengeView } from "./scene/challenge-view.ts";
import { createFx } from "./scene/fx.ts";
import { createStoryView } from "./scene/story-view.ts";
import { createTitleCard } from "./scene/title-card.ts";
import { createWorld } from "./scene/world.ts";

export { CHALLENGE_PROMPTS } from "./scene/challenge-model.ts";
export { createContinuePrompt, TAP_TO_CONTINUE, type ContinuePromptScene } from "./scene/continue-prompt.ts";
export { createGateView, GATE_WARNING_TEXT, type GateScene } from "./scene/gate-view.ts";
export { ARROW_ROW, ARROW_SPACING, arrowX, CURSOR_OFFSET } from "./scene/positions.ts";

export interface Scene extends SceneView {
  /** Follows a new layout: the ui texts, the progress art, and story paging. Call it from `onLayout`. */
  readonly relayout: (layout: Layout) => void;
  /** The display objects, labelled, for tests and the debug overlay. */
  readonly parts: {
    readonly textBox: Sprite;
    readonly storyText: Container;
    readonly challengePrompt: Text;
    readonly progress: Graphics;
    readonly tapPrompt: Text;
    readonly credits: Text;
    readonly logo: Sprite;
    readonly arrows: Container;
  };
}

/**
 * Builds the whole scene into the layers, hidden but for the opening frame (see `reset`). Needs the textures and the
 * font loaded.
 */
export const createScene = (layers: Layers, textures: Textures, initial: Layout): Scene => {
  const world = createWorld(layers, textures);
  const fx = createFx(layers, textures);
  const story = createStoryView(layers, textures, initial);
  const challenge = createChallengeView(layers, textures, initial);
  const title = createTitleCard(layers, textures);

  const scene: Scene = {
    reset: () => {
      scene.setTitle(false);
      scene.setPrompt(null);
      scene.setStoryPage(null);
      scene.setChallenge(null);
      scene.setBackdrop("pillars", false);
      scene.setBackdrop("tentacles", false);
      scene.setBoat("whole");
      scene.setKraken(false);
      scene.setBlack(false);
    },
    setTitle: (visible) => title.setTitle(visible),
    setPrompt: (text) => title.setPrompt(text),
    setStoryPage: (page) => story.setPage(page),
    setChallenge: (spec) => challenge.setChallenge(spec),
    setProgress: (progress) => challenge.setProgress(progress),
    setBackdrop: (backdrop, visible) => world.setBackdrop(backdrop, visible),
    setBoat: (state) => world.setBoat(state),
    setKraken: (visible) => world.setKraken(visible),
    setBlack: (visible) => fx.setBlack(visible),
    // Forwarded, never copied: a new object after every relayout.
    get paging() {
      return story.paging;
    },
    relayout: (next) => {
      story.relayout(next);
      challenge.relayout(next);
      title.relayout(next);
    },
    parts: {
      textBox: story.textBox,
      storyText: story.storyText,
      challengePrompt: challenge.prompt,
      progress: challenge.progress,
      tapPrompt: title.tapPrompt,
      credits: title.credits,
      logo: title.logo,
      arrows: challenge.arrows,
    },
  };

  scene.reset();
  scene.relayout(initial);

  return scene;
};
