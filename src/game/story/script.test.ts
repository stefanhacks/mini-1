import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedWidthMeasure } from "./fake-measure.ts";
import {
  lineSegments,
  lineStarts,
  lineText,
  segmentLines,
  speakerLabel,
  STORY_PARTS,
  STORY_TONE_COLORS,
} from "./script.ts";

// TextManager.prefab's `special` arrays, hex-encoded bools: one byte per line, `01` for a whisper.
const SPECIAL_HEX = ["0000000100000001", "00000001", "00000000", "000000000001"];

const decodeSpecial = (hex: string) => (hex.match(/../gu) ?? []).map((byte) => byte === "01");

describe("story script", () => {
  it("has the original's 4 parts of 8, 4, 4 and 6 lines", () => {
    assert.deepEqual(STORY_PARTS.map((part) => part.length), [8, 4, 4, 6]);
  });

  it("marks the prefab's special lines as whispers, and only those have no speaker", () => {
    STORY_PARTS.forEach((part, index) => {
      assert.deepEqual(part.map(({ whisper }) => whisper), decodeSpecial(SPECIAL_HEX[index]), `part ${index}`);

      for (const line of part) {
        assert.equal(line.speaker === null, line.whisper, line.text);
      }
    });
  });

  it("keeps the whispers' wording", () => {
    const whispers = STORY_PARTS.map((part) => part.filter(({ whisper }) => whisper).map(({ text }) => text));

    assert.deepEqual(whispers, [
      ["\"... follow ...\"", "\"... follow ...\""],
      ["\"... faster ...\""],
      [],
      ["\"... eat ...\""],
    ]);
  });

  it("uses part 2 as Main.unity overrides it, not the prefab's own order", () => {
    assert.deepEqual(STORY_PARTS[2].map(({ speaker, text }) => [speaker, text]), [
      ["First Mate", "\"Look! In the distance!\""],
      ["First Mate", "\"Oh lord - what IS that thing!?\""],
      ["Captain", "\"...!\""],
      ["First Mate", "\"Sir, please! We need to go!\""],
    ]);
  });

  it("quotes every sentence, with straight quotes and no stray whitespace", () => {
    for (const { text } of STORY_PARTS.flat()) {
      assert.match(text, /^"[^"]+"$/u);
      assert.equal(text, text.trim());
      assert.doesNotMatch(text, /\s{2}|[“”‘’…]/u);
    }
  });
});

describe("line segments", () => {
  const captainLine = STORY_PARTS[0][1];
  const whisperLine = STORY_PARTS[0][3];

  it("prefixes a speaker's line with the original's talker string", () => {
    assert.equal(speakerLabel("First Mate"), "[First Mate]: ");
    assert.equal(lineText(captainLine), "[Captain]: \"Men! Get a grip on yourselves!\"");
    assert.equal(lineText(whisperLine), "\"... follow ...\"");
  });

  it("styles the label grey and the sentence white, and a whisper all grey", () => {
    const text = lineText(captainLine);

    assert.deepEqual(lineSegments(captainLine, 0, text.length), [
      { tone: "speaker", text: "[Captain]: " },
      { tone: "speech", text: "\"Men! Get a grip on yourselves!\"" },
    ]);
    assert.deepEqual(lineSegments(captainLine, 11, 17), [{ tone: "speech", text: "\"Men! " }]);
    assert.deepEqual(lineSegments(captainLine, 1, 8), [{ tone: "speaker", text: "Captain" }]);
    assert.deepEqual(lineSegments(whisperLine, 0, 5), [{ tone: "whisper", text: "\"... " }]);
    assert.equal(STORY_TONE_COLORS.speaker, 0x767676);
    assert.equal(STORY_TONE_COLORS.speech, 0xffffff);
    assert.equal(STORY_TONE_COLORS.whisper, STORY_TONE_COLORS.speaker);
  });

  it("spreads a page's segments over its wrapped lines", () => {
    const text = lineText(captainLine);
    const segments = lineSegments(captainLine, 0, text.length);
    const lines = fixedWidthMeasure(16)(text);
    const spread = segmentLines(segments, lines);

    assert.deepEqual(spread.map((line) => line.map(({ text: piece }) => piece).join("")), lines);
    assert.deepEqual(spread[0], [{ tone: "speaker", text: "[Captain]: " }, { tone: "speech", text: "\"Men!" }]);
    assert.ok(spread.slice(1).every((line) => line.every(({ tone }) => tone === "speech")));
  });

  it("finds where each wrapped line starts in the page text, skipping the spaces dropped at breaks", () => {
    const text = "[Captain]: \"Men! Get a grip\"";
    const lines = fixedWidthMeasure(12)(text);
    const starts = lineStarts(text, lines);

    lines.forEach((line, index) => assert.equal(text.slice(starts[index], starts[index] + line.length), line));
    assert.deepEqual(starts, [0, 11, 23]);
    assert.deepEqual(lineStarts("", [""]), [0]);
  });
});
