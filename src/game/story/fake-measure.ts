// A fixed-width stand-in for Pixi's text wrapping, for tests: greedy word wrap at `width` characters, collapsing the
// spaces at breaks. A word longer than a line is cut into `width`-character pieces (like Pixi's `breakWords`), or
// with `breakWords` false kept whole on its own overflowing line.
import type { Measure } from "./paging.ts";

export const fixedWidthMeasure = (width: number, breakWords = true): Measure => (text) => {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/u).filter((part) => part.length > 0)) {
    const candidate = current === "" ? word : `${current} ${word}`;

    if (candidate.length <= width) {
      current = candidate;
      continue;
    }

    if (current !== "") {
      lines.push(current);
    }

    let rest = word;

    while (breakWords && rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }

    current = rest;
  }

  if (current !== "" || lines.length === 0) {
    lines.push(current);
  }

  return lines;
};
