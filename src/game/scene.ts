// The game's scene: every sprite and text built once, shown and hidden per scene state. The states drive it through
// SceneView (states/types.ts); M2 cuts instantly, M4 adds the tweens.
//
// Positions come from the original Main.unity (canvas centre origin, y up) converted to playfield px (top-left origin,
// y down): playfield = (250 + x, 250 − y). Draw order follows the original's sortingOrder, back to front:
// - world: tentacles (−30), pillars (−29), back sea (−25), kraken tail (−19), boat (−16), mid sea (−15), clouds
//   (−10), kraken body (−9), front sea (−5), broken boat (−2).
// - fx: the black overlay `TelaPreta` and the vignette (−1).
// - top: the text box (0), cursors (0), arrows (1), the title logo (15).
// - ui (CSS px): story text, the challenge prompt and its progress, the tap prompt and the credits.
import { CanvasTextMetrics, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";
import { SPRITES, type SpriteKey } from "../assets/manifest.ts";
import { placeOnArtGrid, type Layers } from "../core/layers.ts";
import { PLAYFIELD_SIZE, playfieldToScreen, type Layout, type Point } from "../core/layout.ts";
import type { ChallengeKind, ChallengeProgress, ChallengeSpec } from "./challenges/rule.ts";
import type { Direction } from "./direction.ts";
import type { StoryPage } from "./story/cursor.ts";
import { segmentLines, STORY_TONE_COLORS, VOICE_GREY } from "./story/script.ts";
import type { Backdrop, Boat, GateScreen, GateView, Paging, SceneView } from "./states/types.ts";
import { placeStoryText, storyLinesPerPage, TEXT_BOX_CENTER } from "./text-box.ts";

type Textures = Readonly<Record<SpriteKey, Texture>>;

const FONT = "Josefin Slab";
const WHITE = 0xffffff;

/**
 * The arrow row (`UI/ArrowSpot`, canvas y −160). KeyManager spawns arrow i at world x `−⌊n/2⌋·0.2 + i·0.2` (integer
 * division, so an even row would sit half a step right, as in the original). The canvas is Screen Space – Camera on
 * an orthographic camera of size 1, scaled to match a 500-unit reference width: on the square canvas the camera sees
 * 2 world units across 500 canvas units, so 0.2 world units are 50 canvas px. (On a wider window the original's
 * spacing shrank to 50 / aspect; the port keeps the square's.) 7 arrows span x 100–400, 112 to 388 with their 24 px
 * art: they fit the 500 px playfield with room to spare.
 */
export const ARROW_ROW: Point = { x: PLAYFIELD_SIZE / 2, y: PLAYFIELD_SIZE / 2 + 160 };
export const ARROW_SPACING = 50;
/** The cursor under each arrow (KeyManager: local y −35). */
export const CURSOR_OFFSET = 35;

/** The x of arrow `index` in a row of `count`, in playfield px. */
export const arrowX = (index: number, count: number) => ARROW_ROW.x + (index - Math.floor(count / 2)) * ARROW_SPACING;

/** KeyManager.SpawnArrows' ArrowText, quotes included. */
export const CHALLENGE_PROMPTS: Readonly<Record<ChallengeKind, string>> = {
  sequence: "\"... follow ...\"",
  hold: "\"... hold strong ...\"",
  many: "\"... be fast ...\"",
};

const ARROWS: Readonly<Record<Direction, SpriteKey>> = {
  up: "arrowUp",
  down: "arrowDown",
  left: "arrowLeft",
  right: "arrowRight",
};

// The credits line (`UI/Title/CopyRight`).
const CREDITS = "©the Stefan & Nied";

/** Radius of the hold ring and of the circle of press pips around the arrow, in art px. */
const RING_RADIUS = 18;

interface UiTextSpec {
  readonly label: string;
  /** Where the text's anchor goes, in playfield px. The anchor is the text's centre horizontally. */
  readonly at: Point;
  /** The anchor's height on the text: 0 at its top, 1 at its bottom. */
  readonly anchorY: number;
  /** The original's font size, in art px. */
  readonly size: number;
  /** The smallest font size in CSS px, whatever the square's scale. */
  readonly min: number;
  readonly fill: number;
}

// `ArrowText`: 200×50 at canvas (0, −145), Top, 20 px, grey; its text ended just above the arrows. The port anchors it
// at its bottom, just above the hold ring, so a font clamped up to `min` on a small square grows upward, away from the
// arrows, the ring and the pips.
const CHALLENGE_PROMPT: UiTextSpec = {
  label: "challenge-prompt",
  at: { x: 250, y: ARROW_ROW.y - RING_RADIUS - 4 },
  anchorY: 1,
  size: 20,
  min: 16,
  fill: VOICE_GREY,
};
// `PressAnyKey`: 110×20 at canvas (0, −150), Top, 16 px, white. It was right-aligned in its rect; the port's wording
// is shorter, so it is centred.
const TAP_PROMPT: UiTextSpec = {
  label: "tap-prompt",
  at: { x: 250, y: 390 },
  anchorY: 0,
  size: 16,
  min: 16,
  fill: WHITE,
};
// `CopyRight`: 150×20 at canvas (0, −233), Top, 12 px, white.
const CREDITS_TEXT: UiTextSpec = {
  label: "credits",
  at: { x: 250, y: 473 },
  anchorY: 0,
  size: 12,
  min: 12,
  fill: WHITE,
};

const snapTo = (layout: Layout, value: number) => Math.round(value * layout.dpr) / layout.dpr;

/** A ui text for `spec`: centred, in the game's font. */
const createUiText = (parent: Container, spec: UiTextSpec, text: string, visible = true) => {
  const result = new Text({
    text,
    visible,
    anchor: { x: 0.5, y: spec.anchorY },
    style: { fontFamily: FONT, fill: spec.fill, align: "center" },
    roundPixels: true,
    label: spec.label,
  });

  parent.addChild(result);

  return result;
};

/** Sizes and places a ui text for `layout`: the original's size on the square, at least `spec.min` CSS px. */
const placeUiText = (text: Text, spec: UiTextSpec, layout: Layout) => {
  const { x, y } = playfieldToScreen(layout, spec.at);

  text.style.fontSize = Math.max(spec.min, spec.size * layout.scale);
  text.position.set(snapTo(layout, x), snapTo(layout, y));
};

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
  const sprite = (parent: Container, key: SpriteKey, x: number, y: number, label: string = key) => {
    const result = new Sprite({ texture: textures[key], anchor: SPRITES[key].anchor, label });

    placeOnArtGrid(result, x, y);
    parent.addChild(result);

    return result;
  };

  // World. Stage/Background holds the backdrops at canvas (9.6, −29); the kraken is Stage/Monster at (−8, −9).
  // The sea and clouds keep the placeholder's static positions (M4 animates them).
  const tentacles = sprite(layers.world, "backgroundTentacles", 255.6, 279, "tentacles");
  const pillars = sprite(layers.world, "backgroundPillars", 256.6, 279, "pillars");

  sprite(layers.world, "seaB", 250, 389);

  const krakenTail = sprite(layers.world, "monsterB", 362, 254, "kraken-tail");
  // On whole art pixels, the original's 309.5 is 310 (see layers.ts).
  const boat = sprite(layers.world, "boat", 250, 310);

  sprite(layers.world, "seaM", 250, 399);
  sprite(layers.world, "clouds", 250, 73);
  const krakenBody = sprite(layers.world, "monsterA", 216, 239, "kraken-body");
  sprite(layers.world, "seaF", 250, 409);

  // Barco Quebrado: its sprite sits 35 below the object, at canvas (0, −44).
  const brokenBoat = sprite(layers.world, "boatFlipped", 250, 294, "broken-boat");

  // Fx: TelaPreta is the flash sprite at 1.05, tinted black. A plain rect over the whole square does the same.
  const black = new Graphics({ label: "black" }).rect(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE).fill(0x000000);

  layers.fx.addChild(black);

  // Main.unity scales the vignette to 1.05, so its dark rim sits just outside the square. Off the art grid (see
  // layers.ts), so it is placed directly.
  const vignette = new Sprite({ texture: textures.vignette, anchor: SPRITES.vignette.anchor, label: "vignette" });

  vignette.scale.set(1.05);
  vignette.position.set(PLAYFIELD_SIZE / 2, PLAYFIELD_SIZE / 2);
  layers.fx.addChild(vignette);

  // Top.
  const textBox = sprite(layers.top, "textBox", TEXT_BOX_CENTER.x, TEXT_BOX_CENTER.y);
  // Built hidden, as `setChallenge(null)` leaves them: the first Title must look like every replay's.
  const arrows = new Container({ label: "arrows", visible: false });
  const arrowSprites: Sprite[] = [];
  const cursorSprites: Sprite[] = [];

  layers.top.addChild(arrows);

  // `UI/Title/Logo`: canvas (0, 35).
  const logo = sprite(layers.top, "title", 250, 215, "title");

  // Ui.
  const storyText = new Container({ label: "story-text" });
  const storyPieces: Text[] = [];
  const progress = new Graphics({ label: "challenge-progress" });
  const uiText = (spec: UiTextSpec, text: string, visible = true) => createUiText(layers.ui, spec, text, visible);

  layers.ui.addChild(storyText, progress);

  const challengePrompt = uiText(CHALLENGE_PROMPT, "", false);
  const tapPrompt = uiText(TAP_PROMPT, "");
  const credits = uiText(CREDITS_TEXT, CREDITS);

  // Everything the ui depends on in the current layout.
  let layout = initial;
  // Wraps story text: the same font, size and width as the pieces drawn.
  const wrapStyle = new TextStyle({ fontFamily: FONT, wordWrap: true });
  const measure = (text: string) => CanvasTextMetrics.measureText(text, wrapStyle).lines;
  let paging: Paging = { linesPerPage: 1, measure };

  let page: StoryPage | null = null;
  let challenge: ChallengeSpec | null = null;
  let shownProgress: ChallengeProgress | null = null;
  let progressKey = "";

  const snap = (value: number) => snapTo(layout, value);

  const drawStory = () => {
    for (const piece of storyPieces) {
      piece.visible = false;
    }

    textBox.visible = page !== null;
    storyText.visible = page !== null;

    if (page === null) {
      return;
    }

    const placement = placeStoryText(layout);
    const { whisper } = page;
    const lines = segmentLines(page.segments, measure(page.text));
    const top = placement.anchor.y - (lines.length * placement.lineHeight) / 2;
    const left = placement.anchor.x - placement.wrapWidth / 2;
    let used = 0;

    lines.forEach((segments, row) => {
      const texts = segments.map((segment, index) => {
        const content = index === segments.length - 1 ? segment.text.trimEnd() : segment.text;
        let text = storyPieces[used];

        if (text === undefined) {
          text = new Text({ text: "", style: { fontFamily: FONT }, roundPixels: true, label: "story-piece" });
          storyPieces.push(text);
          storyText.addChild(text);
        }

        used += 1;
        text.style.fontSize = placement.fontSize;
        text.style.lineHeight = placement.lineHeight;
        text.style.fill = STORY_TONE_COLORS[segment.tone];
        text.text = content;
        text.visible = true;

        return { text, width: CanvasTextMetrics.measureText(content, text.style).width };
      });
      const width = texts.reduce((sum, { width: pieceWidth }) => sum + pieceWidth, 0);
      // Normal lines are left-aligned in the text rect, whispers centred (TextManager.cs: TMP Left and Center).
      let x = whisper ? placement.anchor.x - width / 2 : left;

      for (const { text, width: pieceWidth } of texts) {
        text.position.set(snap(x), snap(top + row * placement.lineHeight));
        x += pieceWidth;
      }
    });
  };

  const drawProgress = () => {
    progress.clear();

    const current = shownProgress;

    if (challenge === null || current === null) {
      return;
    }

    for (let i = 0; i < cursorSprites.length; i++) {
      const pointer = current.kind === "sequence" ? current.pointer : 0;
      // KeyManager.UpdateArrows: done cursorP, current cursorS, pending cursorE.
      const key: SpriteKey = i < pointer ? "cursorPast" : i === pointer ? "cursorSelected" : "cursorEmpty";

      cursorSprites[i].texture = textures[key];
    }

    if (current.kind === "sequence") {
      return;
    }

    const centre = playfieldToScreen(layout, ARROW_ROW);
    const radius = RING_RADIUS * layout.scale;
    const width = Math.max(2, 2 * layout.scale);

    if (current.kind === "hold") {
      progress.circle(centre.x, centre.y, radius).stroke({ width, color: WHITE, alpha: 0.25 });

      if (current.fraction > 0) {
        const start = -Math.PI / 2;
        const end = start + current.fraction * Math.PI * 2;

        progress
          .moveTo(centre.x + radius * Math.cos(start), centre.y + radius * Math.sin(start))
          .arc(centre.x, centre.y, radius, start, end)
          .stroke({ width, color: WHITE });
      }

      return;
    }

    // Many: one pip per press needed, clockwise from the top, filled as they are counted.
    const pip = Math.max(2, 2.5 * layout.scale);

    for (let i = 0; i < current.target; i++) {
      const angle = -Math.PI / 2 + (i / current.target) * Math.PI * 2;
      const x = centre.x + radius * Math.cos(angle);
      const y = centre.y + radius * Math.sin(angle);

      if (i < current.count) {
        progress.circle(x, y, pip).fill(WHITE);
      } else {
        progress.circle(x, y, pip).fill({ color: WHITE, alpha: 0.25 });
      }
    }
  };

  const keyOf = (value: ChallengeProgress | null) => {
    if (value === null) {
      return "";
    }

    switch (value.kind) {
    case "sequence":
      return `s${value.pointer}`;
    case "hold":
      return `h${value.fraction.toFixed(3)}`;
    case "many":
      return `m${value.count}`;
    }
  };

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
    setTitle: (visible) => {
      logo.visible = visible;
      credits.visible = visible;
    },
    setPrompt: (text) => {
      tapPrompt.visible = text !== null;
      tapPrompt.text = text ?? "";
    },
    setStoryPage: (next) => {
      page = next;
      drawStory();
    },
    setChallenge: (spec) => {
      if (spec === challenge) {
        return;
      }

      challenge = spec;
      shownProgress = null;
      progressKey = "";
      progress.clear();
      arrows.visible = spec !== null;
      challengePrompt.visible = spec !== null;
      challengePrompt.text = spec === null ? "" : CHALLENGE_PROMPTS[spec.kind];

      const directions = spec === null ? [] : spec.kind === "sequence" ? spec.directions : [spec.direction];

      while (arrowSprites.length < directions.length) {
        const cursor = new Sprite({ texture: textures.cursorEmpty, anchor: 0.5, label: "cursor" });

        cursorSprites.push(arrows.addChild(cursor));
        arrowSprites.push(arrows.addChild(new Sprite({ texture: textures.arrowUp, anchor: 0.5, label: "arrow" })));
      }

      arrowSprites.forEach((arrow, index) => {
        const dir = directions[index];
        const cursor = cursorSprites[index];

        arrow.visible = dir !== undefined;
        cursor.visible = dir !== undefined;

        if (dir !== undefined) {
          const x = arrowX(index, directions.length);

          arrow.texture = textures[ARROWS[dir]];
          placeOnArtGrid(arrow, x, ARROW_ROW.y);
          placeOnArtGrid(cursor, x, ARROW_ROW.y + CURSOR_OFFSET);
        }
      });

      // Cursors and arrows were added in pairs; draw every cursor first, as their sortingOrder (0 under 1).
      for (const cursor of cursorSprites) {
        arrows.setChildIndex(cursor, 0);
      }
    },
    setProgress: (next) => {
      const key = keyOf(next);

      if (key === progressKey) {
        return;
      }

      progressKey = key;
      shownProgress = next;
      drawProgress();
    },
    setBackdrop: (backdrop: Backdrop, visible) => {
      (backdrop === "pillars" ? pillars : tentacles).visible = visible;
    },
    setBoat: (state: Boat) => {
      boat.visible = state === "whole";
      brokenBoat.visible = state === "broken";
    },
    setKraken: (visible) => {
      krakenTail.visible = visible;
      krakenBody.visible = visible;
    },
    setBlack: (visible) => {
      black.visible = visible;
    },
    get paging() {
      return paging;
    },
    relayout: (next) => {
      const placement = placeStoryText(next);

      layout = next;
      wrapStyle.fontSize = placement.fontSize;
      wrapStyle.wordWrapWidth = placement.wrapWidth;
      paging = { linesPerPage: storyLinesPerPage(next), measure };
      placeUiText(challengePrompt, CHALLENGE_PROMPT, next);
      placeUiText(tapPrompt, TAP_PROMPT, next);
      placeUiText(credits, CREDITS_TEXT, next);
      // A shown page was paged for the old layout and could spill out of the box at the new one. It stays hidden until
      // the story state pages it again and shows it (`setStoryPage`, on its next update): a frame without text, never
      // a frame of spilled text.
      storyText.visible = false;
      drawProgress();
    },
    parts: { textBox, storyText, challengePrompt, progress, tapPrompt, credits, logo, arrows },
  };

  scene.reset();
  scene.relayout(initial);

  return scene;
};

// The start gate (m3-plan, deliverable 2). The original's Load scene showed only "This game contains \nflashing
// lights." centred on the canvas; the port keeps that text and line break, adds a load bar under it and the tap prompt
// where Title shows its own, so the begin tap lands on the same spot.
const GATE_WARNING: UiTextSpec = {
  label: "gate-warning",
  at: { x: 250, y: 230 },
  anchorY: 0.5,
  size: 20,
  min: 16,
  fill: WHITE,
};
const GATE_PROMPT: UiTextSpec = { ...TAP_PROMPT, label: "gate-prompt" };

export const GATE_WARNING_TEXT = "This game contains\nflashing lights.";

/** The load bar, in playfield px: centred under the warning. */
const GATE_BAR = { x: 170, y: 290, width: 160, height: 4 } as const;

export interface GateScene extends GateView {
  /** Follows a new layout. Call it from `onLayout`. */
  readonly relayout: (layout: Layout) => void;
  readonly parts: { readonly warning: Text; readonly bar: Graphics; readonly prompt: Text };
}

/**
 * Builds the gate's view into the ui layer, hidden. Needs nothing loaded: the bar is Graphics, and the texts are only
 * shown once the font is in (Gate decides, see GateLoader.fontReady), except the failure line.
 */
export const createGateView = (layers: Layers, initial: Layout): GateScene => {
  const warning = createUiText(layers.ui, GATE_WARNING, GATE_WARNING_TEXT, false);
  const prompt = createUiText(layers.ui, GATE_PROMPT, "", false);
  const bar = new Graphics({ label: "gate-bar", visible: false });
  let layout = initial;
  let shown: GateScreen | null = null;

  layers.ui.addChild(bar);

  const drawBar = () => {
    bar.clear();
    bar.visible = shown?.progress !== null && shown?.progress !== undefined;

    if (shown === null || shown.progress === null) {
      return;
    }

    const snap = (value: number) => snapTo(layout, value);
    const topLeft = playfieldToScreen(layout, GATE_BAR);
    const x = snap(topLeft.x);
    const y = snap(topLeft.y);
    const width = snap(GATE_BAR.width * layout.scale);
    // At least 2 CSS px, so it reads on a small square.
    const height = Math.max(2, snap(GATE_BAR.height * layout.scale));
    const fill = snap(width * Math.min(Math.max(shown.progress, 0), 1));

    bar.rect(x, y, width, height).fill({ color: VOICE_GREY, alpha: 0.5 });

    if (fill > 0) {
      bar.rect(x, y, fill, height).fill(WHITE);
    }
  };

  const gate: GateScene = {
    show: (screen) => {
      if (
        screen !== null && shown !== null && screen.progress === shown.progress && screen.warning === shown.warning
        && screen.prompt === shown.prompt
      ) {
        return;
      }

      shown = screen;
      warning.visible = screen?.warning ?? false;
      prompt.visible = screen?.prompt !== null && screen?.prompt !== undefined;
      prompt.text = screen?.prompt ?? "";
      drawBar();
    },
    relayout: (next) => {
      layout = next;
      placeUiText(warning, GATE_WARNING, next);
      placeUiText(prompt, GATE_PROMPT, next);
      drawBar();
    },
    parts: { warning, bar, prompt },
  };

  gate.relayout(initial);

  return gate;
};
