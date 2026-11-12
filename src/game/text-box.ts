// Where the story text box sits, and where its text goes. Pure TypeScript with no Pixi import, so it runs under
// `node --test`. From the original Main.unity: UI/TextBox (the art) and HistoryText (the text rect) both sit at
// y −160 on the 500×500 canvas (centre origin, y up), which is playfield (250, 410) (top-left origin, y down).
import {
  PLAYFIELD_SIZE,
  rectToScreen,
  snapToDevicePixels,
  type Layout,
  type Point,
  type Rect,
} from "../core/layout.ts";

/** The text box's centre in playfield px. `text_box.png` is centre-anchored in the manifest. */
export const TEXT_BOX_CENTER: Point = { x: PLAYFIELD_SIZE / 2, y: PLAYFIELD_SIZE / 2 + 160 };

/** `text_box.png`'s size in art px. */
export const TEXT_BOX_SIZE = { width: 438, height: 110 } as const;

/** The text box art's rect in playfield px. */
export const TEXT_BOX_RECT: Rect = {
  x: TEXT_BOX_CENTER.x - TEXT_BOX_SIZE.width / 2,
  y: TEXT_BOX_CENTER.y - TEXT_BOX_SIZE.height / 2,
  width: TEXT_BOX_SIZE.width,
  height: TEXT_BOX_SIZE.height,
};

/**
 * HistoryText's 390×80 rect in playfield px. Its prefab alignment is Top, but TextManager.cs sets TMP's `Left` or
 * `Center` before every line, which are the midline variants (513, 514): the original centred each block of lines
 * vertically on the rect's centre, playfield y 410, which is also the box art's centre.
 */
export const TEXT_AREA: Rect = {
  x: TEXT_BOX_CENTER.x - 390 / 2,
  y: TEXT_BOX_CENTER.y - 80 / 2,
  width: 390,
  height: 80,
};

/**
 * The height a page of story text may fill, in art px: 95, from the text rect's top to the box art's bottom (owner
 * decision). Centred on y 410, such a block spans y 362.5 to 457.5, inside the box art (355 to 465). Text never spills
 * out of the box; what doesn't fit goes on the next page.
 */
export const TEXT_PAGE_HEIGHT = TEXT_BOX_RECT.y + TEXT_BOX_RECT.height - TEXT_AREA.y;

/** HistoryText's font size, in art px. */
export const TEXT_FONT_SIZE = 20;

/** Story text never goes under this many CSS px (02-mobile-alternatives, Text), whatever the square's scale. */
export const MIN_TEXT_FONT_SIZE = 16;

/**
 * Line height as a multiple of the font size. Explicit, so a block of n lines is n line heights tall. 1.25
 * approximates HistoryText's TMP line height (the font's own, about 1.15 em for Josefin Slab) plus its 10-unit
 * lineSpacing (0.1 em).
 */
export const TEXT_LINE_HEIGHT = 1.25;

// Absorbs float noise in the lines-per-page division, such as 2.9999999999999996.
const LINES_EPSILON = 1e-9;

export interface TextPlacement {
  /**
   * The centre of the text block in screen CSS px, snapped to whole device pixels: anchor the text at (0.5, 0.5).
   * Whatever its line count, the block is centred on the text rect's centre, as in the original.
   */
  readonly anchor: Point;
  /** The width lines wrap at, in CSS px: the text rect's width on screen. */
  readonly wrapWidth: number;
  /** The font size in CSS px: the original size scaled with the square, but never under MIN_TEXT_FONT_SIZE. */
  readonly fontSize: number;
  /** The line height in CSS px. */
  readonly lineHeight: number;
}

/**
 * Places story text over the text box: centred in the original's text rect, both ways, mapped to the screen. How many
 * of its wrapped lines fit at once is `storyLinesPerPage`.
 */
export const placeStoryText = (layout: Layout): TextPlacement => {
  const area = rectToScreen(layout, TEXT_AREA);
  const snap = (value: number) => snapToDevicePixels(value, layout.dpr);
  const fontSize = Math.max(MIN_TEXT_FONT_SIZE, TEXT_FONT_SIZE * layout.scale);

  return {
    anchor: { x: snap(area.x + area.width / 2), y: snap(area.y + area.height / 2) },
    wrapWidth: area.width,
    fontSize,
    lineHeight: fontSize * TEXT_LINE_HEIGHT,
  };
};

/**
 * How many wrapped lines of story text fit in the box at once: TEXT_PAGE_HEIGHT on screen over the line height. At
 * least 1, so a page always shows something, even on a square too small to hold it.
 */
export const storyLinesPerPage = (layout: Layout) => {
  const { lineHeight } = placeStoryText(layout);

  return Math.max(1, Math.floor((TEXT_PAGE_HEIGHT * layout.scale) / lineHeight + LINES_EPSILON));
};
