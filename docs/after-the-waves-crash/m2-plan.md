# M2 Playable loop: plan

Milestone M2 from [04-implementation-difficulty.md](04-implementation-difficulty.md), replanned against what M0 and M1 actually built.

**Goal:** the game can be played from start to finish on a phone with the compass pad, and on desktop with the arrow keys. That means:

- title;
- 4 story parts with the real script;
- 3 rounds of Sequence, Hold and Many challenges, with the quirk fixes;
- the ending;
- tap to play again.

**Not in M2:**
- Audio and the start gate: M3.
- Typewriter, animations, lightning, flash, fades: M4.
- Rain, bubbles, pause overlay: M5.
- The touch-native gestures (Chart, Brace, Haul) and the assists: M6.

The game in M2 is therefore static and silent: scene changes are instant, but every rule, timer and input path is final.

## What M0 and M1 left us, and what it changes

| Built | Consequence for M2 |
|---|---|
| `GameClock`, `StateMachine` with per-state `TimerScope`, frame-bound transitions, error guard on `machine.update` | Every challenge timer runs on the clock (no `setTimeout`, enforced by lint). **Input must also reach the game inside `machine.update`**: DOM events only queue input, and the active state drains the queue in `update`. That keeps input under the error guard, in game time and frozen while paused. Today a request from a DOM event would apply immediately, outside the guard. |
| `computeLayout` → `zones` (1 in portrait, 2 bands in landscape), at least 176 px after the edge margin; `safe`, `square`, `scale` | The pad is sized `min(200, zone.width, zone.height)` (M1 owner decision). In a tall portrait zone it sits toward the bottom (M1 layout review). |
| Render texture: the playfield is off-stage and not hit-tested; `ui` is in CSS px | All touch targets live in `ui`, or are pure rects tested against pointer coordinates. Nothing in the playfield is touchable. |
| Pixi never delivers `pointercancel` (04, correction 1) | **The input router works on DOM pointer events on the canvas**, not Pixi's federated events: `pointerdown/move/up/cancel` and `lostpointercapture`, with `setPointerCapture`. Hit-testing is pure TypeScript against the pad rects. This avoids Pixi's stale "pressed" state after a cancel, and is testable under node. |
| `placeOnArtGrid`: playfield sprites on whole art pixels | Arrows, cursors, broken boat, kraken and backgrounds are placed through it. |
| `text-box.ts`: `placeStoryText`, `storyLinesPerPage`; owner decision: paginate, 16 px minimum, never spill | Showing the real script needs pagination now, not in M4. **Paging moves into M2**, without the typewriter: a page appears at once, and a tap advances. M4 adds the typing. |
| `placeholder.ts` (temporary) | Replaced by the real scene module. The placeholder is deleted. |
| `onLayout` (unsubscribable), `PlayfieldDisplay.destroy`, the scope-per-state rule | Replay is a soft reset that rebuilds scene state, not the page. Everything a state creates must be torn down on exit. |
| e2e on Chromium with device presets; `window.debug` | Full playthrough tests, by keyboard and by synthetic touch, with a fixed seed (see Deliverable 6). |

## Deliverables

### 1. Challenge rules (`src/game/challenges/`, pure, unit tested)

- **Generation:**
  - 3 rounds of 3, 5 and 7 challenges, with sequence lengths 3, 5 and 7.
  - Round 1 has one Hold at a random index; round 2 one Many; round 3 one of each, at distinct indices.
  - Arrows are uniform. A **seedable RNG** (`?seed=` URL parameter, for tests and bug reports) is passed in, never `Math.random` directly.
- **Rules:** each challenge type is a small state machine fed input events (`press(dir)`, `release(dir)`, `cancelAll()`) and time (from the `TimerScope`). It reports progress for the view: pointer index, hold fraction, press count. It reports completion. All of 02's fixes are included:
  - **Sequence:**
    - a wrong input resets to 0, but a wrong input equal to step 0 goes to step 1;
    - 1 s without a correct input resets;
    - a wrong input does **not** restart the timer (owner decision);
    - simultaneous presses count in event order, so the old "mash all arrows" exploit is gone.
  - **Hold:** the correct direction held for 3 s. Release resets, `cancelAll` resets, and other directions are ignored.
  - **Many:** 10 presses of the correct direction within 3 s.
    - The window starts at the first correct press and resets for each challenge.
    - When the window expires, the next one starts at the next counted press (owner decision).
    - Key repeat never counts.
- **Tuning values** (1 s, 3 s, 10/3 s, round sizes) are in one `TUNING` object, so device playtests can change them in one place.

### 2. Input router (`src/game/input/`)

- **Pointer:** DOM listeners on the canvas, with the per-pointerId map from 04.
  - Pointers that went down before the current state began are ignored.
  - Everything is released on `pointercancel`, `lostpointercapture`, `blur` and `visibilitychange`.
  - Coordinates are converted to `#game` CSS px and hit-tested against the pad's button rects (pure).
- **Keyboard:** arrow keys on `window`, `KeyboardEvent.repeat` ignored, everything released on `blur`.
  - Any key or tap also counts as "advance" outside rounds, as in the original.
- **Output:** a queue of `{ kind: "press" | "release" | "advance" | "cancel", dir? }` events. States drain it in `update`. Pure parts (hit-test, queue, pointer map) are unit tested.

### 3. Compass pad view (`src/game/pad.ts`)

- 4 buttons in a cross, each ≥ 48 CSS px, with a hit area larger than the art. The size is `min(200, zone.width, zone.height)`.
- **Portrait:** centred horizontally in the zone, toward its bottom.
- **Landscape:** one full pad in each side band, both active (owner decision 1).
- Shown only during rounds, and dimmed until the round's first challenge appears, because the Transition state comes first. Pressed and released states are drawn with `Graphics` (in the UI layer, CSS px) until there is art for them.
- Repositioned on every layout change.

### 4. Game states and scene (`src/game/states/`, `src/game/scene.ts`)

- **Real states**, replacing the stubs:
  - **Title:** logo, credits, "Tap to begin". The static frame of the original's final title.
  - **Story N:** text box visible, the real script (01) in pages via `storyLinesPerPage`, breaking at sentence ends where possible. A tap advances to the next page, then the next line. Whisper lines are centred.
  - **Transition:** waits 0.5 s on the clock, then starts the round. The thunder at 0.167 s comes in M4.
  - **Round N:** arrows and cursors in the playfield, using the original's spacing (check it in `KeyManager.cs` and `ArrowSpot` in `Main.unity`). The prompt text ("... follow ...", "... hold strong ...", "... be fast ...") goes in `ui`, with the pad and a hold ring/pip meter for feedback. When the round is won, wait 1.25 s, show the pillars (after round 1) or tentacles (after round 2) instantly, then go to the next story part.
  - **Ending:** after story part 3: broken boat and kraken shown, then the empty sea, then the logo and credits. Instant cuts, with the original's waits (0.58 s, 1.5 s, 8 s, 10 s, +3.5 s) kept on the clock so M4 only adds the tweens. Then "Tap to play again".
  - **Replay:** a soft reset to Title. A new seed, scene objects reset, nothing reloaded.
- **Scene module:** builds every sprite once (world, fx, top) and exposes show/hide per scene state. `placeholder.ts` is deleted.
- **Teardown:** states only add objects or listeners through their scope or the scene. A test plays through twice and checks that the timer and listener counts are equal.

### 5. Text paging (`src/game/text-box.ts` / `src/game/story/`, pure)

- Split a line into pages from `storyLinesPerPage(layout)` and measured line wraps, breaking at sentence ends where possible.
- Measuring needs Pixi's `CanvasTextMetrics`, which can't run under node. So the paging function takes a `measure(text) => lines` callback; unit tests use a fixed-width fake, and e2e uses the real one.
- **Page boundaries on resize:** pages already read stay read. The text from the current page's start to the end of the line is paged again, and the current page becomes the first of the new pages, starting at the same word.
  - The current page's text may change on rotation, because keeping it could spill out of the box. A rotation never skips or repeats text.
- **Vertical alignment (verify in wave 2):** the original's `Type()` switches HistoryText to TMP `Left`/`Center`. These are probably the *midline* variants, so the text was likely centred vertically in its 80 px rect, not top-anchored as `text-box.ts` assumes today. Check the TMP enum values before the view relies on it.
- **Whisper colour:** whispers were grey (`#464646`), not white. The original types them in the speaker colour.

### 6. Tests

- **Unit (node):** generation (seeded and distribution), each rule including every quirk fix and owner decision, the input queue and hit-test, the pointer map (cancel/blur/stale pointers), paging, and the state flow with a fake clock and scripted input.
- **e2e (Playwright):**
  - A **full playthrough by keyboard** and **by touch** (Playwright touchscreen / CDP `Input.dispatchTouchEvent` for holds and multi-touch), with `?seed=`, on all three presets. The test reads the current challenge from `window.debug` and answers it.
  - Plus: a wrong input resets; a `pointercancel` during a Hold releases it; the pad appears only in rounds; story pages never spill out of the box at the smallest square; replay twice without leaks.
- **Speed:** the full playthrough must not depend on wall time: the waits are about 25 s of game time. Add a `?timescale=` debug parameter read only when `?debug` is set; it multiplies `deltaMS` in the ticker. That's the only test hook.

## How the work runs

The same pattern as M0 and M1: builders write, reviewers only read and report, Claude commits after each step and runs `npm test`, `npm run check` and `npm run e2e` before each push.

| Wave | Agents | Work |
|---|---|---|
| 1, build | **Dwarf Engineer: Challenge Rules**, **Elf Scout: Input Router**, **Gnome Scribe: Story Paging** | Deliverables 1, 2 (pure parts and DOM wiring) and 5. Pure, so they run in parallel on separate folders. |
| 1, review | **Orc Judge: Rules Review**, **Goblin Tracker: Input Review** | Rules against 01/02 and the owner decisions, by brute-force event scripts. Input on cancel, blur, multi-touch and repeat. Paging is reviewed together with the input review. |
| 2, build | **Human Captain: States Scene**, **Halfling Tinker: Pad View** | Deliverables 3, 4 and the playthrough e2e. The pad first, then the states use it. |
| 2, review | **Lizard Warden: Runtime Review**, **Goblin Scribe: Code Review**, **Troll Sentinel: Dual-pad Review** | Playthroughs on the device presets, leaks across replays, layout of the pad and the arrows, code against the plan; the dual landscape pads' edge cases (owner decision 1). |

**Estimate:** about 8–10 dev-days. 04 said 6–7; paging, replay and the real scene moved into M2, but none of them depend on M3/M4.

## Risks

- **Input in game time:** a press is timestamped with the frame that drains it, so up to 1 frame late. That's harmless for 1 s and 3 s windows, but it's why Many counts presses and doesn't measure intervals.
- **iOS long-press:** Hold on the pad is the first real test of M1's callout protection. It needs a device check.
- **Landscape pad:** the band is about 176–227 px wide, so the pad's 48 px minimum per button is close to the limit on small phones (playtest).
- **Arrow row width:** 7 arrows of 24 art px at the original spacing must fit 500 art px. Check against the source before building.

## Owner decisions

1. **Landscape pad:** a full pad in **each** side band, both active. Either thumb works, and left-handed players need no setting.
   - The owner expects edge cases here ("a can of worms"), so wave 2 adds a dedicated reviewer: **Troll Sentinel: Dual-pad Review**. It checks:
     - two thumbs on two pads at once: Hold on one pad, a press on the other; the same direction on both; a release on one pad while the other still holds;
     - Sequence order when both pads are pressed in the same frame, and the Many count across pads;
     - a pointer that slides from one band to the other, and `pointercancel` on one pad only;
     - the visual feedback, so both pads show the same state;
     - narrow bands on small landscape phones;
     - the keyboard used at the same time.
   - Rule for the builders: both pads feed **one** logical direction state per direction. A direction is "held" while any pointer holds it on either pad. A press counts once per new pointer going down.
2. **Replay:** in M2, a soft "Tap to play again".
3. **Story text:** the real script, paged, without the typewriter.
4. **Pad visibility:** only during rounds.
5. **Tap while typing (M4):** a tap finishes the current line. The next tap advances.
6. **Sequence step-0 forgiveness (decided after the wave-1 review):** a wrong press equal to step 0 counts as a correct step 0 and **restarts** the 1 s timer. Truly wrong presses still reset to 0 without restarting it.

## Rules for wave 2 (from the wave-1 reviews)

- **Drain the queue in every state, on every update**, and discard what doesn't apply:
  - Rounds ignore `advance`; the other states ignore `press` and `release`.
  - Filter with an explicit `switch` in the round state, because `challenges/` must not import `input/`.
- **`beginEpoch()` on every state enter and at every phase change inside a state**, such as each Ending wait. Otherwise early taps would trigger "Tap to play again".
- **Rule context:** build it from the state's own clock and scope, with `now = () => clock.now`.
- **Resume after a pause or a hidden tab:** handle a queued `cancel` before the first resumed tick can complete a Hold.
  - Full pause is M5. M2 only makes sure a hidden tab's `cancel` is applied first.
- **Story text** is centred vertically on the text box (TMP midline alignment, as the original), and whispers are grey.
- **Device check:** on iOS, a tap advances Story. WebKit's `lostpointercapture` order wasn't testable here.

