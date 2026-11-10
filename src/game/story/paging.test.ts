import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedWidthMeasure } from "./fake-measure.ts";
import { isSentenceEnd, pageRanges, paginate } from "./paging.ts";
import { lineText, STORY_PARTS } from "./script.ts";

const normalize = (text: string) => text.trim().split(/\s+/u).join(" ");

const ALL_LINES = STORY_PARTS.flat().map(lineText);

describe("isSentenceEnd", () => {
  it("ends at . ! ? and … before closing quotes", () => {
    const words = ["sails!\"", "Men!", "stopped.", "this?", "thing!?\"", "voice!?\"", "he-?!", "How...\"", "I..."];

    for (const word of words) {
      assert.ok(isSentenceEnd(word), word);
    }
  });

  it("doesn't end at a leading ellipsis, a label, a comma or a dash", () => {
    for (const word of ["\"...", "[Captain]:", "Cap'n,", "-", "with-\"", "Sir,"]) {
      assert.ok(!isSentenceEnd(word), word);
    }
  });

  it("ends at a reply made only of marks when it asks or exclaims", () => {
    assert.ok(isSentenceEnd("\"...?\""));
    assert.ok(isSentenceEnd("\"...!\""));
    assert.ok(!isSentenceEnd("...\""));
  });
});

describe("paginate", () => {
  it("keeps a line that fits on one page", () => {
    assert.deepEqual(paginate("[Captain]: \"...?\"", 1, fixedWidthMeasure(40)), ["[Captain]: \"...?\""]);
    assert.deepEqual(paginate("", 2, fixedWidthMeasure(10)), []);
    assert.deepEqual(paginate("   ", 2, fixedWidthMeasure(10)), []);
  });

  it("rejects a page of no lines", () => {
    assert.throws(() => paginate("text", 0, fixedWidthMeasure(10)), RangeError);
    assert.throws(() => paginate("text", 1.5, fixedWidthMeasure(10)), RangeError);
  });

  it("never loses, repeats or splits text, and every page re-measures within the page", () => {
    for (const width of [8, 12, 16, 20, 25, 32, 40, 60]) {
      const measure = fixedWidthMeasure(width);

      for (let linesPerPage = 1; linesPerPage <= 3; linesPerPage += 1) {
        for (const text of ALL_LINES) {
          const pages = paginate(text, linesPerPage, measure);
          const context = `width ${width}, ${linesPerPage} lines: ${text}`;
          // At width 8, `"Captain!` and the like are wider than a line, so 1-line pages cut them where measure does.
          const cutsWords = text.split(" ").some((word) => measure(word).length > linesPerPage);

          assert.equal(pages.join("").replace(/\s/gu, ""), text.replace(/\s/gu, ""), context);

          for (const page of pages) {
            assert.equal(page, page.trim(), context);
            assert.ok(measure(page).length <= linesPerPage, `${context} → ${page}`);
          }

          if (cutsWords) {
            continue;
          }

          assert.equal(pages.join(" "), normalize(text), context);

          // Never mid-word: every page boundary falls on whitespace in the original.
          for (const { start, end } of pageRanges(text, linesPerPage, measure)) {
            assert.ok(start === 0 || /\s/u.test(text[start - 1]), context);
            assert.ok(end === text.length || /\s/u.test(text[end]), context);
          }
        }
      }
    }
  });

  it("fills pages greedily when no sentence ends inside them", () => {
    const text = "one two three four five six seven";

    assert.deepEqual(paginate(text, 1, fixedWidthMeasure(9)), ["one two", "three", "four five", "six seven"]);
    assert.deepEqual(paginate(text, 2, fixedWidthMeasure(9)), ["one two three", "four five six seven"]);
  });

  it("prefers to break after the last sentence end on a page", () => {
    const measure = fixedWidthMeasure(20);
    const mate = "[First Mate]: \"Captain! This wind is too strong! We're gonna lose the sails!\"";

    // Greedy would end page 1 at "wind" (2 × 20 chars).
    assert.deepEqual(paginate(mate, 2, measure), [
      "[First Mate]: \"Captain!",
      "This wind is too strong!",
      "We're gonna lose the sails!\"",
    ]);
    assert.deepEqual(paginate("[Captain]: \"Men! Get a grip on yourselves!\"", 1, fixedWidthMeasure(24)), [
      "[Captain]: \"Men!",
      "Get a grip on",
      "yourselves!\"",
    ]);
  });

  it("doesn't break after a leading ellipsis, but does after ?! and a trailing one", () => {
    const he = "[First Mate]: \"... the he-?! Cap'n, do you hear this voice!?\"";

    assert.deepEqual(paginate(he, 1, fixedWidthMeasure(32)), [
      "[First Mate]: \"... the he-?!",
      "Cap'n, do you hear this voice!?\"",
    ]);
    assert.deepEqual(paginate("[First Mate]: \"Sir I... I don't think that voice", 2, fixedWidthMeasure(22)), [
      "[First Mate]: \"Sir I...",
      "I don't think that voice",
    ]);
    assert.deepEqual(paginate("\"... follow ...\"", 1, fixedWidthMeasure(11)), ["\"... follow", "...\""]);
  });

  it("wraps a word longer than a line as measure does, and splits it only when it can't fit a page", () => {
    const measure = fixedWidthMeasure(5);

    // 12 characters: 3 lines of the fake. On 3-line pages it fits whole, sharing its last line with "cd".
    assert.deepEqual(paginate("ab abcdefghijkl cd", 3, measure), ["ab", "abcdefghijkl cd"]);
    // On 1-line pages it can't, so it is cut where measure wraps it.
    assert.deepEqual(paginate("ab abcdefghijkl cd", 1, measure), ["ab", "abcde", "fghij", "kl cd"]);

    for (let linesPerPage = 1; linesPerPage <= 3; linesPerPage += 1) {
      const pages = paginate("ab abcdefghijkl cd", linesPerPage, measure);

      assert.equal(pages.join("").replace(/\s/gu, ""), "ababcdefghijklcd");
      assert.ok(pages.every((page) => measure(page).length <= linesPerPage));
    }
  });

  it("keeps a word wider than a line whole when measure does", () => {
    // Like Pixi without breakWords: a long word gets its own overflowing line, which counts as 1 line.
    const measure = fixedWidthMeasure(5, false);

    assert.deepEqual(paginate("a verylongword b", 1, measure), ["a", "verylongword", "b"]);
    assert.deepEqual(paginate("a verylongword b", 3, measure), ["a verylongword b"]);
  });

  it("pages from an offset, leaving earlier text as read", () => {
    const text = "one two. three four five";
    const ranges = pageRanges(text, 1, fixedWidthMeasure(10), 9);

    assert.deepEqual(ranges.map(({ start, end }) => text.slice(start, end)), ["three four", "five"]);
  });
});
