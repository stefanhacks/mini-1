// Reads a story part page by page. Pure state: the view shows `page` and calls `advance` on a tap and `relayout` when
// the layout changes.
//
// Relayout keeps what was read: the pages before the current one stay as they were, and the text from the current
// page's start to the line's end is paged again. The current page is then the first of those, so it starts at the
// same word and a rotation never skips or repeats text, only moves where later pages break.
import { lineSegments, lineText, type StoryLine, type StorySegment } from "./script.ts";
import { pageRanges, type Measure, type PageRange } from "./paging.ts";

export interface StoryPage {
  /** The page's styled pieces, in order. Joined, they give `text`. */
  readonly segments: readonly StorySegment[];
  /** The page's plain text, label included on a line's first page; what `measure` wraps. */
  readonly text: string;
  /** A whisper page: centred, slower when typed (M4). */
  readonly whisper: boolean;
}

export interface StoryCursor {
  /** The current line's index in the part. Equals the part's length once done. */
  readonly lineIndex: number;
  /** The current page's index in the current line. */
  readonly pageIndex: number;
  /** How many pages the current line has, as paged now. */
  readonly pageCount: number;
  /** The page to show, or null once done. */
  readonly page: StoryPage | null;
  /** Whether the current page is its line's last. */
  readonly isLastPage: boolean;
  /** Whether the next `advance` finishes the part. */
  readonly isLastPageOfPart: boolean;
  /** Whether the part has been read to the end. */
  readonly done: boolean;
  /** Next page, else the next line's first page, else done. Does nothing once done. */
  advance(): void;
  /** Pages the rest of the current line again for a new layout, from the current page's start. */
  relayout(linesPerPage: number, measure: Measure): void;
}

/** A cursor at the first page of `part`'s first line. A part with no lines starts done. */
export const createStoryCursor = (
  part: readonly StoryLine[],
  linesPerPage: number,
  measure: Measure,
): StoryCursor => {
  let layout = { linesPerPage, measure };
  let lineIndex = 0;
  let pageIndex = 0;
  let ranges: PageRange[] = [];

  const pageLine = (from: number) => pageRanges(lineText(part[lineIndex]), layout.linesPerPage, layout.measure, from);

  // Skips lines with nothing to show, so every line the cursor stops on has a page.
  const startLine = () => {
    while (lineIndex < part.length) {
      ranges = pageLine(0);
      pageIndex = 0;

      if (ranges.length > 0) {
        return;
      }

      lineIndex += 1;
    }

    ranges = [];
    pageIndex = 0;
  };

  startLine();

  const done = () => lineIndex >= part.length;

  return {
    get lineIndex() {
      return lineIndex;
    },
    get pageIndex() {
      return pageIndex;
    },
    get pageCount() {
      return ranges.length;
    },
    get page() {
      if (done()) {
        return null;
      }

      const line = part[lineIndex];
      const { start, end } = ranges[pageIndex];

      return {
        segments: lineSegments(line, start, end),
        text: lineText(line).slice(start, end),
        whisper: line.whisper,
      };
    },
    get isLastPage() {
      return !done() && pageIndex === ranges.length - 1;
    },
    get isLastPageOfPart() {
      const restBlank = part.slice(lineIndex + 1).every((line) => lineText(line).trim() === "");

      return !done() && pageIndex === ranges.length - 1 && restBlank;
    },
    get done() {
      return done();
    },
    advance: () => {
      if (done()) {
        return;
      }

      if (pageIndex < ranges.length - 1) {
        pageIndex += 1;
        return;
      }

      lineIndex += 1;
      startLine();
    },
    relayout: (nextLinesPerPage, nextMeasure) => {
      layout = { linesPerPage: nextLinesPerPage, measure: nextMeasure };

      if (done()) {
        return;
      }

      ranges = [...ranges.slice(0, pageIndex), ...pageLine(ranges[pageIndex].start)];
    },
  };
};
