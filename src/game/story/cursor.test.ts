import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStoryCursor, type StoryCursor } from "./cursor.ts";
import { fixedWidthMeasure } from "./fake-measure.ts";
import { lineText, STORY_PARTS, type StoryLine } from "./script.ts";

const normalize = (text: string) => text.trim().split(/\s+/u).join(" ");

/** Every page's text, per line, from here to the end of the part. */
const readAll = (cursor: StoryCursor) => {
  const lines: string[][] = [];

  while (!cursor.done) {
    const page = cursor.page;

    assert.ok(page);
    (lines[cursor.lineIndex] ??= []).push(page.text);
    cursor.advance();
  }

  return lines;
};

describe("story cursor", () => {
  it("reads every line of every part, page by page, then is done", () => {
    for (const part of STORY_PARTS) {
      const cursor = createStoryCursor(part, 1, fixedWidthMeasure(16));
      const lines = readAll(cursor);

      assert.deepEqual(lines.map((pages) => pages.join(" ")), part.map((line) => normalize(lineText(line))));
      assert.equal(cursor.page, null);
      assert.equal(cursor.lineIndex, part.length);
      assert.ok(!cursor.isLastPage);
      cursor.advance();
      assert.ok(cursor.done);
    }
  });

  it("flags the line's last page and the part's last page", () => {
    const cursor = createStoryCursor(STORY_PARTS[1], 1, fixedWidthMeasure(20));
    const flags: [number, boolean, boolean][] = [];

    while (!cursor.done) {
      flags.push([cursor.lineIndex, cursor.isLastPage, cursor.isLastPageOfPart]);
      cursor.advance();
    }

    const lastPerLine = flags.filter(([, isLast]) => isLast).map(([lineIndex]) => lineIndex);

    assert.deepEqual(lastPerLine, [0, 1, 2, 3]);
    assert.deepEqual(flags.filter(([, , isLastOfPart]) => isLastOfPart).length, 1);
    assert.ok(flags[flags.length - 1][2]);
  });

  it("shows the label on a line's first page only, and whispers as whispers", () => {
    const cursor = createStoryCursor(STORY_PARTS[0], 1, fixedWidthMeasure(20));
    const firstPage = cursor.page;

    assert.deepEqual(firstPage?.segments, [{ tone: "speaker", text: "[First Mate]:" }]);
    cursor.advance();
    assert.ok(cursor.page?.segments.every(({ tone }) => tone === "speech"));

    while (cursor.lineIndex < 3) {
      cursor.advance();
    }

    assert.equal(cursor.page?.whisper, true);
    assert.ok(cursor.page?.segments.every(({ tone }) => tone === "whisper"));
  });

  it("returns the same page object until the page changes", () => {
    const cursor = createStoryCursor(STORY_PARTS[0], 1, fixedWidthMeasure(20));
    const first = cursor.page;

    assert.equal(cursor.page, first);
    cursor.advance();
    assert.notEqual(cursor.page, first);
  });

  it("joins a page's segments into its text", () => {
    const cursor = createStoryCursor(STORY_PARTS[3], 2, fixedWidthMeasure(18));

    while (!cursor.done) {
      assert.equal(cursor.page?.segments.map(({ text }) => text).join(""), cursor.page?.text);
      cursor.advance();
    }
  });

  it("starts done on an empty part, and skips blank lines", () => {
    assert.ok(createStoryCursor([], 2, fixedWidthMeasure(10)).done);

    const blank: StoryLine = { speaker: null, text: " ", whisper: true };
    const cursor = createStoryCursor([blank, { speaker: "Captain", text: "\"Hi.\"", whisper: false }, blank], 1,
      fixedWidthMeasure(40));

    assert.equal(cursor.lineIndex, 1);
    assert.ok(cursor.isLastPageOfPart);
    cursor.advance();
    assert.ok(cursor.done);
  });
});

describe("story cursor relayout", () => {
  const line = STORY_PARTS[0][0];
  const text = normalize(lineText(line));

  // Reads one page, relayouts, then reads the rest of the line; returns the line's pages.
  const readAcross = (before: [number, number], after: [number, number], pagesBefore: number, label: string) => {
    const cursor = createStoryCursor([line], before[0], fixedWidthMeasure(before[1]));
    const pages: string[] = [];

    for (let index = 0; index < pagesBefore; index += 1) {
      pages.push(cursor.page?.text ?? "");
      cursor.advance();
    }

    const pageIndex = cursor.pageIndex;
    const start = cursor.page?.text.split(" ")[0];

    cursor.relayout(after[0], fixedWidthMeasure(after[1]));
    assert.equal(cursor.pageIndex, pageIndex, `${label}: the page index doesn't move`);
    assert.equal(cursor.page?.text.split(" ")[0], start, `${label}: the current page starts at the same word`);

    while (!cursor.done) {
      const page = cursor.page?.text ?? "";

      assert.ok(fixedWidthMeasure(after[1])(page).length <= after[0], `${label}: ${page}`);
      pages.push(page);
      cursor.advance();
    }

    return pages;
  };

  it("never skips or repeats text when more or fewer lines fit", () => {
    type Paging = [lines: number, width: number];
    const CASES: readonly (readonly [name: string, before: Paging, after: Paging, reads: number])[] = [
      ["more lines fit", [1, 14], [3, 30], 3],
      ["fewer lines fit", [3, 30], [1, 14], 2],
    ];

    for (const [name, before, after, reads] of CASES) {
      for (let read = 0; read < reads; read += 1) {
        const label = `${name}: after ${read} pages`;

        assert.equal(readAcross(before, after, read, label).join(" "), text, label);
      }
    }
  });

  it("repages from the current page's start, keeping the pages already read", () => {
    const cursor = createStoryCursor([line], 1, fixedWidthMeasure(24));

    assert.equal(cursor.page?.text, "[First Mate]: \"Captain!");
    cursor.advance();
    assert.equal(cursor.page?.text, "This wind is too strong!");
    cursor.relayout(2, fixedWidthMeasure(24));
    assert.equal(cursor.pageIndex, 1);
    assert.equal(cursor.pageCount, 3);
    assert.equal(cursor.page?.text, "This wind is too strong!");
    cursor.advance();
    assert.equal(cursor.page?.text, "We're gonna lose the sails!\"");
    assert.ok(cursor.isLastPage);
  });

  it("does nothing once done", () => {
    const cursor = createStoryCursor([line], 3, fixedWidthMeasure(40));

    readAll(cursor);
    cursor.relayout(1, fixedWidthMeasure(5));
    assert.ok(cursor.done);
    assert.equal(cursor.page, null);
  });
});
