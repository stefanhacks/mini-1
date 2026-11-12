// The game's scene: every sprite and text built once, shown and hidden per scene state. The states drive it through
// SceneView (states/types.ts), as cuts or fades; the parts play the original's clips on the app's clip player (the
// fades through one scene/fades.ts, the ambient loops and the strikes on their own handles). Composition only: each
// part lives in scene/, the positions and draw order in scene/positions.ts.
//
// The parts are built in draw order, each appending to its layers: world → fx → story → challenge → title. The world
// draws the weather's containers (scene/particles) in between its sprites. That gives fx: bolt, black, vignette,
// flash; top: text box, arrows, logo; ui: story text, challenge progress, challenge prompt, tap prompt, credits.
// scene/lightning.ts drives the bolt and the flash, and adds no display object.
import type { Graphics, Sprite, Container, Text } from "pixi.js";
import { createClipPlayer, type ClipPlayer } from "../core/anim/player.ts";
import type { Layers } from "../core/layers.ts";
import type { Layout } from "../core/layout.ts";
import type { SceneView } from "./states/types.ts";
import type { Textures } from "./scene/art-sprite.ts";
import { createChallengeView } from "./scene/challenge-view.ts";
import { createFades } from "./scene/fades.ts";
import { createFx } from "./scene/fx.ts";
import { createLightning, watchReducedMotion } from "./scene/lightning.ts";
import { createWeather, createWeatherEffects, type Weather, type WeatherOptions } from "./scene/particles/weather.ts";
import { createStoryView } from "./scene/story-view.ts";
import { TITLE_UNDERSEA } from "./scene/particles/undersea.ts";
import { createTitleCard } from "./scene/title-card.ts";
import { createWorld } from "./scene/world.ts";

export { createContinuePrompt } from "./scene/continue-prompt.ts";
export { createGateView } from "./scene/gate-view.ts";

export interface Scene extends SceneView {
  /** The app's animation clips, played on the parts; the frame loop syncs it. */
  readonly clips: ClipPlayer;
  /** The rain, splashes, bubbles and eyes; the frame loop syncs it after the clips. */
  readonly weather: Weather;
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
    readonly bolt: Sprite;
    readonly flash: Graphics;
  };
}

/**
 * Builds the whole scene into the layers, hidden but for the opening frame (see `reset`), and starts the ambient
 * loops, last, so a build that throws leaves no clip behind. Needs the textures and the font loaded. `clips` is the
 * app's player, which the frame loop syncs; the default one is never synced (tests). `reducedMotion` is read at each
 * strike: it caps the flash. `weather` takes `?debug&eyes=always`.
 */
export const createScene = (
  layers: Layers,
  textures: Textures,
  initial: Layout,
  clips: ClipPlayer = createClipPlayer(),
  reducedMotion: () => boolean = watchReducedMotion(),
  weatherOptions: WeatherOptions = {},
): Scene => {
  const fades = createFades(clips);
  const weatherParts = createWeatherEffects(textures);
  const world = createWorld(layers, textures, clips, fades, weatherParts.effects);
  const weather = createWeather(weatherParts, world.sprites.boat, weatherOptions);
  const fx = createFx(layers, textures, fades);
  const story = createStoryView(layers, textures, initial);
  const challenge = createChallengeView(layers, textures, initial, clips);
  const title = createTitleCard(layers, textures, fades);
  const lightning = createLightning({
    bolt: fx.bolt,
    flash: fx.flash,
    textures,
    clips,
    revealLogo: () => title.setLogo(true),
    reducedMotion,
  });

  const scene: Scene = {
    clips,
    weather,
    reset: () => {
      lightning.reset();
      scene.setTitle(false);
      scene.setPrompt(null);
      scene.setStoryPage(null);
      scene.setChallenge(null);
      scene.setBackdrop("pillars", false);
      scene.setBackdrop("tentacles", false);
      scene.setBoat("whole");
      scene.setKraken(false);
      scene.setBlack(false);
      scene.setUndersea(TITLE_UNDERSEA);
      world.resetPoses();
    },
    setTitle: (visible, fade) => {
      // Hidden, the logo stays hidden: a reveal still pending (Title left before its flash peaked) is dropped.
      if (!visible) {
        lightning.cancelReveal();
      }

      title.setTitle(visible, fade);
    },
    setCredits: (visible, fade) => title.setCredits(visible, fade),
    strike: (kind, rng) => lightning.strike(kind, rng),
    setPrompt: (text, fade) => title.setPrompt(text, fade),
    setStoryPage: (page, revealed) => story.setPage(page, revealed),
    setChallenge: (spec) => challenge.setChallenge(spec),
    setProgress: (progress) => challenge.setProgress(progress),
    setBackdrop: (backdrop, visible, fade) => world.setBackdrop(backdrop, visible, fade),
    setBoat: (state) => world.setBoat(state),
    setKraken: (visible, fade) => world.setKraken(visible, fade),
    setBlack: (visible, fade) => fx.setBlack(visible, fade),
    startWeather: (seed) => weather.start(seed),
    setUndersea: (undersea) => weather.setUndersea(undersea),
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
      bolt: fx.bolt,
      flash: fx.flash,
    },
  };

  scene.reset();
  scene.relayout(initial);
  world.startAmbient();

  return scene;
};
