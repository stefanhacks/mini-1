import { createStoryCursor } from "../story/cursor.ts";
import { STORY_PARTS } from "../story/script.ts";
import { createCuePlayer } from "./cues.ts";
import type { GameSession } from "./session.ts";
import { STORY_DEBOUNCE_MS, STORY_PREAMBLE_CUES, STORY_PREAMBLE_MS } from "./timings.ts";
import type { GameDeps, GameState, Paging } from "./types.ts";

/** The last story part: the ending follows it instead of a round. */
export const LAST_PART = STORY_PARTS.length - 1;

/**
 * Story part `session.part`: the text box with the script, a page at a time (owner decision 3: no typewriter in M2).
 *
 * - Each part asks for its music overlay as it begins (the engine starts it on the next bar), as the original's
 *   `PlayOverlay` at the start of `Historia`.
 * - Part 0 opens with the original's 2.5 s preamble, the text box hidden, and its strike at 1.25 s.
 * - The last part is read over the black overlay, as the original fades `TelaPreta` in when it starts typing it.
 * - An advance shows the next page, then the next line, but only STORY_DEBOUNCE_MS after the page appeared. Each new
 *   page begins an input epoch, so a tap already down when it appeared doesn't count either.
 * - After the last page: Transition, or the Ending after the last part.
 * - On a layout change the cursor pages the rest of the line again (story/cursor.ts), and the page is redrawn.
 */
export const createStory = (deps: GameDeps, session: GameSession): GameState => {
  const { clock, input } = deps;
  let shownAt = 0;
  let paging: Paging | null = null;

  const showPage = () => {
    deps.scene().setStoryPage(session.cursor?.page ?? null);
    shownAt = clock.now;
    input.beginEpoch();
  };

  const startText = () => {
    const scene = deps.scene();

    paging = scene.paging;
    session.cursor = createStoryCursor(STORY_PARTS[session.part] ?? [], paging.linesPerPage, paging.measure);
    session.phase = "page";

    if (session.part === LAST_PART) {
      scene.setBlack(true);
    }

    showPage();
  };

  return {
    enter: (scope) => {
      input.beginEpoch();
      deps.pad.setVisible(false);
      deps.pad.setHint(null);
      session.cursor = null;
      deps.audio.setStoryPart(session.part);

      if (session.part === 0) {
        session.phase = "preamble";
        createCuePlayer(deps, "story").schedule(scope, STORY_PREAMBLE_CUES);
        scope.after(STORY_PREAMBLE_MS, startText);
      } else {
        startText();
      }
    },
    update: (_deltaMS, machine) => {
      const events = input.drain();
      const cursor = session.cursor;

      if (cursor === null) {
        return;
      }

      const scene = deps.scene();

      if (scene.paging !== paging) {
        paging = scene.paging;
        cursor.relayout(paging.linesPerPage, paging.measure);
        scene.setStoryPage(cursor.page);
      }

      const advanced = events.some((event) => event.kind === "advance");

      if (!advanced || clock.now - shownAt < STORY_DEBOUNCE_MS) {
        return;
      }

      cursor.advance();

      if (!cursor.done) {
        showPage();
        return;
      }

      scene.setStoryPage(null);
      machine.request(session.part === LAST_PART ? "ending" : "transition");
    },
    exit: () => {
      deps.scene().setStoryPage(null);
      session.cursor = null;
    },
  };
};
