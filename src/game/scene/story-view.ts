// The story's text box (top layer) and its text (ui layer). The text is pooled pieces, one per coloured run of a line,
// in one container: shown pieces are restyled and reused, the rest hidden, never destroyed. A page is laid out whole,
// then only its first `revealed` characters show (the typewriter, as TMP's visible character count), so wrapping and
// centring never move while it types. Written by Claude Code.
import { CanvasTextMetrics, Container, Text, TextStyle, type Sprite } from "pixi.js";
import type { Layers } from "../../core/layers.ts";
import { snapToDevicePixels, type Layout } from "../../core/layout.ts";
import type { StoryPage } from "../story/cursor.ts";
import { lineStarts, segmentLines, STORY_TONE_COLORS, type StoryTone } from "../story/script.ts";
import type { Paging } from "../states/types.ts";
import { placeStoryText, storyLinesPerPage, TEXT_BOX_CENTER, type TextPlacement } from "../text-box.ts";
import { addArtSprite, type Textures } from "./art-sprite.ts";
import { UI_FONT } from "./palette.ts";

export interface StoryView {
  readonly textBox: Sprite;
  /** A direct child of the ui layer, holding only story pieces. */
  readonly storyText: Container;
  /**
   * Shows `page` in the box with its first `revealed` characters (all by default), or hides the box and the text. The
   * same page object again, with no relayout since, only changes how much shows.
   */
  readonly setPage: (page: StoryPage | null, revealed?: number) => void;
  /** Follows a new layout: rewraps, makes a new `paging`, and hides the text until the page is set again. */
  readonly relayout: (layout: Layout) => void;
  /** How story text wraps now: a new object after every relayout. */
  readonly paging: Paging;
}

/** A piece drawn on a row, with its measured width. */
interface RowPiece {
  readonly text: Text;
  readonly width: number;
}

/** A piece of the drawn page: its full content, and where that starts in the page's text. */
interface DrawnPiece {
  readonly text: Text;
  readonly content: string;
  readonly start: number;
}

export const createStoryView = (layers: Layers, textures: Textures, initial: Layout): StoryView => {
  const textBox = addArtSprite(layers.top, textures, "textBox", TEXT_BOX_CENTER);
  const storyText = new Container({ label: "story-text" });
  const pieces: Text[] = [];

  layers.ui.addChild(storyText);

  let layout = initial;
  // Wraps story text: the same font, size and width as the pieces drawn.
  const wrapStyle = new TextStyle({ fontFamily: UI_FONT, wordWrap: true });
  const measure = (text: string) => CanvasTextMetrics.measureText(text, wrapStyle).lines;
  let paging: Paging = { linesPerPage: 1, measure };
  let page: StoryPage | null = null;
  // The drawn page's pieces, and whether they were laid out at the current layout (a relayout clears it).
  let drawn: DrawnPiece[] = [];
  let laidOut = false;

  const snap = (value: number) => snapToDevicePixels(value, layout.dpr);

  const hidePieces = () => {
    for (const piece of pieces) {
      piece.visible = false;
    }
  };

  /** The pool's piece `index`, appended to the story text the first time it is needed. */
  const acquirePiece = (index: number) => {
    let piece = pieces[index];

    if (piece === undefined) {
      piece = new Text({ text: "", style: { fontFamily: UI_FONT }, roundPixels: true, label: "story-piece" });
      pieces.push(piece);
      storyText.addChild(piece);
    }

    return piece;
  };

  const stylePiece = (piece: Text, placement: TextPlacement, tone: StoryTone, content: string) => {
    piece.style.fontSize = placement.fontSize;
    piece.style.lineHeight = placement.lineHeight;
    piece.style.fill = STORY_TONE_COLORS[tone];
    piece.text = content;
    piece.visible = true;
  };

  /** Lays a row's pieces out side by side from `x`, snapped to device pixels. */
  const layoutRow = (row: readonly RowPiece[], x: number, y: number) => {
    let left = x;

    for (const { text, width } of row) {
      text.position.set(snap(left), snap(y));
      left += width;
    }
  };

  const drawPage = (shown: StoryPage) => {
    const placement = placeStoryText(layout);
    const wrapped = measure(shown.text);
    const lines = segmentLines(shown.segments, wrapped);
    const starts = lineStarts(shown.text, wrapped);
    const top = placement.anchor.y - (lines.length * placement.lineHeight) / 2;
    const left = placement.anchor.x - placement.wrapWidth / 2;
    let used = 0;

    drawn = [];
    lines.forEach((segments, row) => {
      let start = starts[row];
      const rowPieces = segments.map((segment, index): RowPiece => {
        const content = index === segments.length - 1 ? segment.text.trimEnd() : segment.text;
        const text = acquirePiece(used);

        used += 1;
        stylePiece(text, placement, segment.tone, content);
        drawn.push({ text, content, start });
        start += segment.text.length;

        return { text, width: CanvasTextMetrics.measureText(content, text.style).width };
      });
      const width = rowPieces.reduce((sum, { width: pieceWidth }) => sum + pieceWidth, 0);

      // Normal lines are left-aligned in the text rect, whispers centred (TextManager.cs: TMP Left and Center).
      layoutRow(rowPieces, shown.whisper ? placement.anchor.x - width / 2 : left, top + row * placement.lineHeight);
    });
  };

  /** Shows the first `revealed` characters of the drawn page: each piece cut to its share, empty ones hidden. */
  const reveal = (revealed: number) => {
    for (const { text, content, start } of drawn) {
      const count = Math.min(Math.max(revealed - start, 0), content.length);
      const shown = count === content.length ? content : content.slice(0, count);

      if (text.text !== shown) {
        text.text = shown;
      }

      text.visible = count > 0;
    }
  };

  const draw = (revealed: number) => {
    hidePieces();
    drawn = [];
    textBox.visible = page !== null;
    storyText.visible = page !== null;

    if (page !== null) {
      drawPage(page);
      reveal(revealed);
    }

    laidOut = true;
  };

  return {
    textBox,
    storyText,
    setPage: (next, revealed = Infinity) => {
      if (next !== null && next === page && laidOut) {
        reveal(revealed);
        return;
      }

      page = next;
      draw(revealed);
    },
    relayout: (next) => {
      const placement = placeStoryText(next);

      layout = next;
      wrapStyle.fontSize = placement.fontSize;
      wrapStyle.wordWrapWidth = placement.wrapWidth;
      paging = { linesPerPage: storyLinesPerPage(next), measure };
      // A shown page was paged for the old layout and could spill out of the box at the new one. It stays hidden until
      // the story state pages it again and shows it (`setStoryPage`, on its next update): a frame without text, never
      // a frame of spilled text.
      storyText.visible = false;
      laidOut = false;
    },
    get paging() {
      return paging;
    },
  };
};
