// Splits a story line into pages that fit the text box. Pure TypeScript: wrapping is measured by an injected
// `measure`, Pixi's CanvasTextMetrics in the app and a fixed-width fake in tests.
//
// Break rules:
// - Pages break only between words, never inside one, except a word that alone needs more than a page's lines.
// - A page takes as many words as measure fits in `linesPerPage` lines. If more text follows and a sentence ends
//   inside the page, the page ends after the last such sentence instead, as long as it keeps at least a third of
//   the greedy page's characters.
// - Every page is checked by measuring its own text, so it never needs more than `linesPerPage` lines.

/** Wraps text at the view's width and returns its lines. */
export type Measure = (text: string) => readonly string[];

/** A page as offsets into the paged text: `text.slice(start, end)`, with no whitespace at either end. */
export interface PageRange {
  readonly start: number;
  readonly end: number;
}

interface Word {
  readonly start: number;
  readonly end: number;
}

// Closing marks after a sentence end, such as the quote in `stopped."`.
const CLOSERS = /["'”’)\]]+$/u;
const SENTENCE_END = /(?:[.!?]|…)$/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// A page cut at a sentence end keeps at least 1 / MIN_FILL of the greedy page's characters (review: a half is worse).
const MIN_FILL = 3;

/**
 * Whether a word ends a sentence: it ends with `.`, `!`, `?` or `…`, before any closing quotes. A word with no
 * letters or digits ends one only with `!` or `?` (a reply like `"...?"`), so a leading ellipsis like `"...` in
 * `"... the he-?!` doesn't. A trailing ellipsis after a word (`I...`, `How...`) counts: the speaker pauses there.
 */
export const isSentenceEnd = (word: string) => {
  const core = word.replace(CLOSERS, "");

  if (!SENTENCE_END.test(core)) {
    return false;
  }

  return LETTER_OR_DIGIT.test(core) || /[!?]/u.test(core);
};

const wordsOf = (text: string, from: number): Word[] => {
  const words: Word[] = [];
  const pattern = /\S+/gu;

  pattern.lastIndex = from;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }

  return words;
};

const fits = (text: string, linesPerPage: number, measure: Measure) => measure(text).length <= linesPerPage;

/**
 * How much of a word too long for a page goes on it: measure's first lines of the word, as many as fit, if they
 * are a prefix of it that measures within the page. If not, the whole word (the only case a page may spill).
 */
const wordChunkEnd = (text: string, word: Word, linesPerPage: number, measure: Measure) => {
  const content = text.slice(word.start, word.end);
  const lines = measure(content);

  for (let count = Math.min(linesPerPage, lines.length - 1); count >= 1; count -= 1) {
    const chunk = lines.slice(0, count).join("");

    if (chunk.length > 0 && content.startsWith(chunk) && fits(chunk, linesPerPage, measure)) {
      return word.start + chunk.length;
    }
  }

  return word.end;
};

/**
 * Pages `text` from offset `from` on (earlier text counts as already read). Returns each page's range in `text`; an
 * empty or blank remainder has no pages.
 */
export const pageRanges = (text: string, linesPerPage: number, measure: Measure, from = 0): PageRange[] => {
  if (!Number.isInteger(linesPerPage) || linesPerPage < 1) {
    throw new RangeError(`linesPerPage must be a whole number ≥ 1, got ${linesPerPage}`);
  }

  const pages: PageRange[] = [];
  let words = wordsOf(text, from);

  while (words.length > 0) {
    const start = words[0].start;
    let count = 0;

    while (count < words.length && fits(text.slice(start, words[count].end), linesPerPage, measure)) {
      count += 1;
    }

    if (count === 0) {
      // The first word alone needs more than a page: put what fits of it on this page, the rest on the next.
      const end = wordChunkEnd(text, words[0], linesPerPage, measure);

      pages.push({ start, end });
      words = end < words[0].end ? [{ start: end, end: words[0].end }, ...words.slice(1)] : words.slice(1);
      continue;
    }

    if (count < words.length) {
      // More text follows: end the page after the last sentence end on it, if the page keeps at least a third of the
      // greedy page's characters. Below that, a short opener like `"Sir I...` would get a near-empty page.
      const full = words[count - 1].end - start;

      for (let last = count; last >= 1; last -= 1) {
        if (words[last - 1].end - start < full / MIN_FILL) {
          break;
        }

        if (isSentenceEnd(text.slice(words[last - 1].start, words[last - 1].end))) {
          count = last;
          break;
        }
      }
    }

    pages.push({ start, end: words[count - 1].end });
    words = words.slice(count);
  }

  return pages;
};

/** Pages `text` into the pages' texts. Joined with single spaces, they give `text` back, whitespace normalized. */
export const paginate = (text: string, linesPerPage: number, measure: Measure): string[] =>
  pageRanges(text, linesPerPage, measure).map(({ start, end }) => text.slice(start, end));
