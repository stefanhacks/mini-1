# Endless mode plan

A loopable mode next to the story: each challenge gets a time limit, the limit tightens and the challenges grow as the run goes on, and the first timeout ends the run with the kraken. Written by Claude Code from the owner's brief. The owner's answers are under **Owner decisions**.

## The brief

- **Loop:** every challenge carries a time limit. If it is finished in time, the timer resets and a new challenge comes. If not, the run ends.
- **Difficulty:** the time limit decreases, and challenge variety and length increase, as the run progresses. Everything goes back to level 0 on the start screen.
- **Story:**
  - The run opens with "... flee ..." in dark grey.
  - A failure fades to black, shows "... eat ..." and replays the ending's kraken animation.
  - Then the game returns to the start screen.
- **Access:**
  - A new corner icon goes at the top right, below the others.
  - The icon is highlighted at the end of the story.
  - The replay prompt reads "Tap to start. Endless mode in the top right."

## What exists today (checked on `main`, fe2367c)

- **Flow:**
  - The states are Gate → Title → Story 0 → Transition → Round 0 → … → Story 3 → Ending → Title (`src/game/states/`).
  - Title resets the scene and starts a new game on every enter (`startNewGame`).
  - Ending runs `Fim` on fixed times (`ENDING_MS`) and takes the replay tap from 22.25 s.
- **Challenges:**
  - `generateRounds` builds the three fixed rounds from `TUNING`.
  - `Round` runs the specs in order.
  - The rules (`SequenceRule`, `HoldRule`, `ManyRule`) keep their timers on the state's `TimerScope`, so they already pause with the clock and die with the state.
  - Nothing has a per-challenge time limit. Sequence's 1 s is a gap between presses, not a deadline.
- **Text:**
  - Story pages and whispers go through the Story state and `STORY_PARTS`.
  - Whispers use `VOICE_GREY` (`#767676`), which replaced the original's `#464646` because that was unreadable on the night sea.
- **Corner stack:**
  - The stack is `CORNER_BUTTONS = ["mute", "pause", "flashes"]`, one 48 px slot each (`input/corner-geometry.ts`).
  - `router-core.ts` enables each button and sends its taps to listeners.
  - `cornerButtonRect` returns null when a slot doesn't fit, as in short landscape. The button then has no hit area.
- **Arrow row:**
  - The row is 50 px apart on a 500 px playfield (`positions.ts`), so it fits at most 9 arrows.
  - The original tops out at 7.
- **Code origin:** most of `src/game` is written by Claude Code, as its headers say. Wave 0 below re-reads the parts this plan extends before building on them.

## Design

### Flow

New state `endless`, with phases `flee` → `play` → `caught`. It is entered from Title's `prompt` phase or the Ending's `replay` phase through the new icon.

1. **Start:**
   - The game resets like Title does: `startNewGame`, `scene.reset`, `startWeather`.
   - It also resets the endless level, so the state can be entered from both screens.
   - From Title, the logo and prompt fade out first (Title's `leaving` phase), and then the `endless` state starts instead of Story 0.
2. **`flee`:**
   - The text box shows the whisper `"... flee ..."`, typed at whisper speed through the existing typewriter and story view.
   - A tap continues, with the same debounce as the story.
   - This needs a short `ENDLESS_LINES` script next to `STORY_PARTS`, not a 5th story part, so the story's `LAST_PART` logic stays untouched.
3. **`play`:**
   - The pad is shown, the timer starts, and one challenge at a time is generated for the current level.
   - A completed challenge raises the level by 1 and brings the next one with a fresh timer.
   - Between challenges there is a short beat (about 300 ms, tunable) with the pad dimmed, so the next arrows don't appear under a finger that is still moving.
4. **`caught`** (the timer ran out):
   - Input is dropped, and the challenge and the pad hide.
   - Black fades in, then the whisper `"... eat ..."` is typed over it.
   - After a short hold, the Ending runs in an **endless variant**: the same `Fim` timeline (broken boat, throw, kraken and roar, fade to black, empty sea).
   - Once the sea is back (`ENDING_MS.seaLift`), the variant goes to Title, which resets everything.
   - The variant skips the card and the 22 s replay wait (owner decision 5).

`GameSession` gains `mode: "story" | "endless"` and `level`. Ending reads `mode` to choose its tail. Title sets `mode = "story"` and `level = 0` on every enter, which gives "resetting the difficulty levels".

### Time limit

- **Mechanism:**
  - A `TimedChallenge` wrapper in `challenges/` gets one deadline timer on the state's scope per challenge.
  - It calls `onTimeout` and exposes `remainingMs`/`limitMs` for the view.
  - The rules stay unchanged.
- **Pause:**
  - The deadline is on the game clock, so a pause freezes it.
  - On resume, `resetChallenge` resets the challenge's progress. In endless mode the deadline restarts with it, which is fair after a forced reset.
- **View:**
  - A thin bar under the arrow row drains from full to empty, drawn with `Graphics` in the ui layer like the hold ring.
  - It is drawn in `VOICE_GREY` and turns white in the last 25%.
  - Under "reduce flashes" and reduced motion, it drains without pulsing.

### Difficulty curve

Every challenge kind is timed (owner decision 1). `ENDLESS_TUNING` goes in `challenges/tuning.ts`, a pure function of `level` (challenges cleared). All the numbers are starting values for playtests:

| Knob | Level 0 | Growth | Cap |
|---|---|---|---|
| Sequence length | 3 arrows | +1 every 3 levels | 9 (the row's width) |
| Directions in play ("variety") | 2 | +1 at levels 3 and 6 | 4 |
| Hold / Many share | 0% | +10% every 3 levels, from level 3 | 40% |
| Sequence limit | 1 000 ms + 900 ms × length | ×0.94 per level on the per-arrow part | 350 ms per arrow |
| Hold / Many limit | the rule's own time (3 s) + 2 000 ms slack | slack ×0.94 per level | 600 ms slack |

- **Generation:**
  - A `generateEndless(rng, level)` builds one spec at a time from the session's seed, so `?seed=` replays a run.
  - It shares `randomDirection` and the spec shapes with `generateRounds`.
- **Unchanged rules:** Sequence's 1 s gap between presses still applies inside the time limit.
- **Story hooks** (owner decision 6):
  - The music overlay and the bubbles step up through parts 1–3 at levels 5, 10 and 15.
  - The pillars and then the tentacles fade in at the same levels.
  - This reuses `setStoryPart`, `setUndersea` and `setBackdrop` as they are.

### The icon

- **Placement:**
  - It is a 4th slot in `CORNER_BUTTONS`, `"endless"`, under "reduce flashes".
  - The art is an infinity loop on the 24-unit icon grid in `ICON_COLOR`, drawn in a new `endless-button.ts` alongside `flashes-button.ts`.
- **When it works:**
  - It is shown from the first visit to Title, with no unlock (owner decision 4).
  - It is enabled only on Title's `prompt` phase and the Ending's `replay` phase, and hidden everywhere else.
  - It is a new listener in `router-core.ts`, enabled the same way pause is.
  - Key fallback: **E**, for desktop and for layouts where the 4th slot doesn't fit (see Risks).
- **Highlight at the end of the story:**
  - In the Ending's `replay` phase, the icon pulses with the prompt's `TMPIdle` clip.
  - It is held at full alpha under reduced motion.
- **Prompt:** only the Ending's replay prompt changes; Title keeps "Tap to begin" (owner decision 8). `TAP_TO_PLAY_AGAIN` becomes `"Tap to start. Endless mode in the top right."`.
  - This needs a check that the prompt fits on one line at the smallest portrait width.
  - If it doesn't, it wraps to two lines, with the existing `ui-text` wrapping. *(uncertain: ui-text's wrap not checked yet)*

### Debug and tests

- **Debug:** `window.debug` session snapshot gains `mode`, `level`, `limitMs` and `remainingMs`.
- **Unit tests:**
  - The curve and the generator: determinism by seed, caps, and the mix of challenge kinds.
  - `TimedChallenge`: deadline exclusive for input, as the rules' boundaries are; pause; reset.
  - States: flee → play → caught → ending variant → title. Entry from both screens. Level reset on Title.
- **e2e:**
  - `endless.spec.ts`: open from Title through the icon, clear 2 challenges through `?seed=`, then let the timer run out and assert the "eat" page, the kraken cue and the return to Title.
  - Plus the icon's hit rect in both orientations.

## Waves

| Wave | Content | Size |
|---|---|---|
| 0 | Re-read `round.ts`, `rule.ts`, `ending.ts`, `router-core.ts` and `corner-geometry.ts` before changing them (machine-written) | S |
| 1 | Pure core: `ENDLESS_TUNING`, `generateEndless`, `TimedChallenge`, session fields, unit tests | M |
| 2 | States: `endless` (flee / play / caught), the Ending's endless variant, Title and Ending entry, state tests | M |
| 3 | UI: corner slot, icon and highlight, router hook and E key, timer bar, new replay prompt | M |
| 4 | Debug snapshot, e2e, docs (README table, this plan's decisions) | S |

Each wave ends with `npm run check` and a push. The PR preview is checked on a phone after wave 3.

## Risks

- **4th corner slot:**
  - In landscape the stack shifts left of the right band and grows 48 px taller, which may not fit on short phones.
  - When it doesn't fit, the icon has no hit area. The E key covers desktop only, so a touch-only short landscape screen would lose the mode. A side-by-side fallback may be needed. *(uncertain, needs a device check)*
- **Fairness at high levels:**
  - With 9 arrows at 350 ms per arrow plus 1 s, the limit is 4.15 s.
  - Sequence's 1 s gap rule still resets on a slip, so a late slip can't be recovered.
  - This is meant to end runs, but the floor needs a playtest.
- **The Ending is shared:**
  - The variant must not change the story ending's times (the `lifecycle` and `playthrough` e2e tests pin them).
  - The variant only cuts its tail.
- **Prompt length:** the new prompt is about 2.5× longer than "Tap to play again", so it may need wrapping (see The icon).

## Owner decisions

1. **Every challenge is timed:** Sequence, Hold and Many.
2. **Variety:** more directions in play (2 → 4) and more Hold/Many mixed in, as the curve says.
3. **"... flee ..." uses the current whisper grey** (`VOICE_GREY`, `#767676`).
4. **The icon shows from the start**, with no unlock and nothing stored.
5. **The endless failure goes straight to Title** at the empty sea (about 10.25 s), with no card or replay wait.
6. **The story hooks step up with the level:** the music overlay, the bubbles and the backdrops at levels 5, 10 and 15.
7. **Score: later.** Not in this PR.
8. **Only the Ending's replay prompt changes.** Title keeps "Tap to begin".
