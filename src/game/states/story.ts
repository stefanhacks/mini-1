import type { TimerScope } from "../../core/clock.ts";
import type { StateMachine } from "../../core/state-machine.ts";
import { createStoryCursor, type StoryCursor, type StoryPage } from "../story/cursor.ts";
import { STORY_PARTS } from "../story/script.ts";
import { createTypewriter, type Typewriter } from "../story/typewriter.ts";
import { drainAdvanced, hidePad } from "./common.ts";
import { createCuePlayer } from "./cues.ts";
import type { GameSession } from "./session.ts";
import {
  FADE,
  STORY_DEBOUNCE_MS,
  STORY_PREAMBLE_CUES,
  STORY_PREAMBLE_MS,
  TYPE_MS_PER_CHAR,
  WHISPER_MS_PER_CHAR,
} from "./timings.ts";
import type { GameDeps, GameState, GameStateId, Paging, SceneView } from "./types.ts";

/** The last story part: the ending follows it instead of a round. */
export const LAST_PART = STORY_PARTS.length - 1;

/**
 * Story part `session.part`: the text box with the script, a page at a time, each page typed.
 *
 * - Each part asks for its music overlay as it begins (the engine starts it on the next bar), as the original's
 *   `PlayOverlay` at the start of `Historia`.
 * - Part 0 opens with the original's 2.5 s preamble, the text box hidden, and its strike at 1.25 s.
 * - The last part is read over the black overlay, which fades in (`TelaPreta` FadeIn, 1 s) as it starts, as the
 *   original's does when it starts typing it.
 * - Each page is typed on game time (story/typewriter.ts): about a character a frame, whispers 100 ms a character.
 * - An advance while typing completes the page (M2 owner decision 5). Once complete, an advance shows the next page,
 *   then the next line, but only STORY_DEBOUNCE_MS after the page was complete. Each new page begins an input epoch,
 *   so a tap already down when it appeared doesn't count either.
 * - After the last page: Transition, or the Ending after the last part.
 * - On a layout change the cursor pages the rest of the line again (story/cursor.ts), and the page is redrawn with the
 *   characters already shown: the page starts at the same character, so typing carries on where it was.
 */
export const createStory = (deps: GameDeps, session: GameSession): GameState => {
  const { audio, clock, input, pad, scene } = deps;
  // When the shown page was complete (game time), or null while it types.
  let completedAt: number | null = null;
  let paging: Paging | null = null;

  const typeSpeed = (page: StoryPage) => (page.whisper ? WHISPER_MS_PER_CHAR : TYPE_MS_PER_CHAR);

  /** Starts the debounce the first time the typewriter is seen done. */
  const noteIfComplete = (typewriter: Typewriter) => {
    if (completedAt === null && typewriter.done) {
      completedAt = clock.now;
    }
  };

  const showPage = () => {
    const page = session.cursor?.page ?? null;
    const typewriter = page === null ? null : createTypewriter(page.text.length, typeSpeed(page));

    session.typewriter = typewriter;
    completedAt = null;
    scene().setStoryPage(page, typewriter?.revealed);

    if (typewriter !== null) {
      noteIfComplete(typewriter);
    }

    input.beginEpoch();
  };

  const startText = () => {
    const view = scene();

    paging = view.paging;
    session.cursor = createStoryCursor(STORY_PARTS[session.part] ?? [], paging.linesPerPage, paging.measure);
    session.phase = "page";

    if (session.part === LAST_PART) {
      view.setBlack(true, FADE);
    }

    showPage();
  };

  /** Part 0's preamble: the text box waits STORY_PREAMBLE_MS, with its strike. */
  const startPreamble = (scope: TimerScope) => {
    session.phase = "preamble";
    createCuePlayer(deps, session, "story").schedule(scope, STORY_PREAMBLE_CUES);
    scope.after(STORY_PREAMBLE_MS, startText);
  };

  /**
   * A new paging object means the layout changed: the rest of the line is paged again and the page redrawn, with what
   * was shown still shown (cut to the new page if it is shorter, which completes it).
   */
  const repageIfLayoutChanged = (view: SceneView, cursor: StoryCursor, typewriter: Typewriter) => {
    if (view.paging !== paging) {
      paging = view.paging;
      cursor.relayout(paging.linesPerPage, paging.measure);
      typewriter.resize(cursor.page?.text.length ?? 0);
      noteIfComplete(typewriter);
      view.setStoryPage(cursor.page, typewriter.revealed);
    }
  };

  /** Types on, or completes the page on a tap. Says whether the page is still typing (the tap was used). */
  const type = (view: SceneView, cursor: StoryCursor, typewriter: Typewriter, deltaMS: number, advanced: boolean) => {
    if (typewriter.done) {
      return false;
    }

    if (advanced) {
      typewriter.complete();
    } else {
      typewriter.update(deltaMS);
    }

    noteIfComplete(typewriter);
    view.setStoryPage(cursor.page, typewriter.revealed);

    return true;
  };

  /** After the last page: Transition, or the Ending after the last part. */
  const finishPart = (view: SceneView, machine: StateMachine<GameStateId>) => {
    view.setStoryPage(null);
    machine.request(session.part === LAST_PART ? "ending" : "transition");
  };

  return {
    enter: (scope) => {
      input.beginEpoch();
      hidePad(pad);
      session.cursor = null;
      session.typewriter = null;
      audio.setStoryPart(session.part);

      if (session.part === 0) {
        startPreamble(scope);
      } else {
        startText();
      }
    },
    update: (deltaMS, machine) => {
      const advanced = drainAdvanced(input);
      const { cursor, typewriter } = session;

      if (cursor === null || typewriter === null) {
        return;
      }

      const view = scene();

      repageIfLayoutChanged(view, cursor, typewriter);

      if (type(view, cursor, typewriter, deltaMS, advanced)) {
        return;
      }

      if (!advanced || completedAt === null || clock.now - completedAt < STORY_DEBOUNCE_MS) {
        return;
      }

      cursor.advance();

      if (cursor.done) {
        finishPart(view, machine);
      } else {
        showPage();
      }
    },
    exit: () => {
      scene().setStoryPage(null);
      session.cursor = null;
      session.typewriter = null;
    },
  };
};
