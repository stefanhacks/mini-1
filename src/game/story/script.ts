// The story script, word for word from the original: `Prefabs/TextManager.prefab` (talker, sentences, special), with
// the three part 2 sentences `Scenes/Main.unity` overrides on its TextManager instance. Pure TypeScript.
//
// How the original showed a line (TextManager.cs, `Type`): the talker string in <#464646>, then the sentence in white.
// A whisper ("special") keeps its text in the talker string with an empty sentence, so it is typed all in grey,
// centred, ten times slower. Normal lines are left-aligned.

export type Speaker = "First Mate" | "Captain";

export interface StoryLine {
  /** Who speaks. Null for the voice's whispers. */
  readonly speaker: Speaker | null;
  /** The sentence, quote marks included, as the original typed it. */
  readonly text: string;
  /** The voice's "special" line: centred, all in the label grey. */
  readonly whisper: boolean;
}

/**
 * How a piece of a line is styled. `speaker`: the "[Speaker]: " label. `speech`: the sentence after it. `whisper`:
 * a whole whisper line.
 */
export type StoryTone = "speaker" | "speech" | "whisper";

export interface StorySegment {
  readonly tone: StoryTone;
  readonly text: string;
}

/**
 * The original's colours per tone: the label is `<#464646>`, the sentence `<color=white>`. A whisper lives in the
 * talker string, so it is the label grey too.
 */
export const STORY_TONE_COLORS: Readonly<Record<StoryTone, number>> = {
  speaker: 0x464646,
  speech: 0xffffff,
  whisper: 0x464646,
};

const mate = (text: string): StoryLine => ({ speaker: "First Mate", text, whisper: false });
const captain = (text: string): StoryLine => ({ speaker: "Captain", text, whisper: false });
const voice = (text: string): StoryLine => ({ speaker: null, text, whisper: true });

/** The 4 story parts, in order. Part 3 comes before the ending and has no round after it. */
export const STORY_PARTS: readonly (readonly StoryLine[])[] = [
  [
    mate("\"Captain! This wind is too strong! We're gonna lose the sails!\""),
    captain("\"Men! Get a grip on yourselves!\""),
    captain("\"We need to find our way out of this storm or we're dead!\""),
    voice("\"... follow ...\""),
    captain("\"...?\""),
    mate("\"... the he-?! Cap'n, do you hear this voice!?\""),
    captain("\"Shush sailor! Let me think!\""),
    voice("\"... follow ...\""),
  ],
  [
    mate("\"Sir, these headings make no sense!\""),
    captain("\"But they are working!\""),
    captain("\"If we keep this up, we might outrun the storm!\""),
    voice("\"... faster ...\""),
  ],
  [
    mate("\"Look! In the distance!\""),
    mate("\"Oh lord - what IS that thing!?\""),
    captain("\"...!\""),
    mate("\"Sir, please! We need to go!\""),
  ],
  [
    captain("\"How...\""),
    captain("\"The winds've completely stopped. We're adrift!\""),
    mate("\"...!\""),
    captain("\"...!\""),
    mate("\"Sir I... I don't think that voice was speaking with-\""),
    voice("\"... eat ...\""),
  ],
];

/** The label typed before a speaker's sentence, exactly the original's talker string (trailing space included). */
export const speakerLabel = (speaker: Speaker) => `[${speaker}]: `;

/** The length of the line's label in `lineText`, 0 for whispers. */
export const labelLength = (line: StoryLine) => (line.speaker === null ? 0 : speakerLabel(line.speaker).length);

/** The whole line as it is wrapped and paged: the label, then the sentence. */
export const lineText = (line: StoryLine) =>
  (line.speaker === null ? line.text : speakerLabel(line.speaker) + line.text);

/**
 * The styled pieces of `lineText(line).slice(start, end)`: the part inside the label is `speaker`, the rest `speech`
 * (or all `whisper`). Empty pieces are left out, so the texts joined give the slice back.
 */
export const lineSegments = (line: StoryLine, start: number, end: number): StorySegment[] => {
  const text = lineText(line);

  if (line.whisper) {
    return start < end ? [{ tone: "whisper", text: text.slice(start, end) }] : [];
  }

  const split = Math.min(Math.max(labelLength(line), start), end);
  const segments: StorySegment[] = [];

  if (start < split) {
    segments.push({ tone: "speaker", text: text.slice(start, split) });
  }

  if (split < end) {
    segments.push({ tone: "speech", text: text.slice(split, end) });
  }

  return segments;
};

/**
 * Spreads a page's segments over its wrapped lines (`measure(pageText)`), so a view without inline styling can draw
 * each line piece by piece. Wrapping only drops the whitespace at line breaks, so the lines' characters are matched
 * back to the page in order; whitespace a line keeps takes the tone around it.
 */
export const segmentLines = (segments: readonly StorySegment[], lines: readonly string[]): StorySegment[][] => {
  const tones = segments.flatMap(({ tone, text }) => Array.from(text, () => tone));
  const chars = segments.map(({ text }) => text).join("");
  let position = 0;

  return lines.map((line) => {
    const result: StorySegment[] = [];

    while (position < chars.length && /\s/.test(chars[position])) {
      position += 1;
    }

    for (const char of line) {
      const matched = chars[position] === char;
      const tone = tones[Math.min(position, tones.length - 1)] ?? "speech";
      const last = result[result.length - 1];

      if (matched) {
        position += 1;
      }

      if (last?.tone === tone) {
        result[result.length - 1] = { tone, text: last.text + char };
      } else {
        result.push({ tone, text: char });
      }
    }

    return result;
  });
};
