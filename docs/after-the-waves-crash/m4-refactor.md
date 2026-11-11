# M4 wave 0: readability refactor proposal

This consolidates the two read-only reviews, **Centaur Sage: Scene Readability** and **Kobold Monk: Main Readability**, into the brief for wave 0b. **No behaviour changes.** The same unit counts and e2e counts must pass (551 unit; 65 e2e passed, 10 skipped), and a before/after snapshot must be identical (see Safety net).

## Findings in short

- **`src/game/scene.ts` (641 lines):**
  - `createScene` is one 320-line closure that owns five concerns across four layers.
  - `drawStory` (49 lines), `drawProgress` (56) and `setChallenge` (43) each mix pooling, styling, layout maths and z-order.
  - Magic playfield numbers are scattered through it, and seven exported constants are never used outside the file.
  - **No unit test covers the scene**, and the e2e screenshots are saved but never compared.
- **`src/main.ts` (458 lines):**
  - A long module top level, with 9 mutable `let`s.
  - Three nearly identical error guards.
  - A 43-line `window.debug` literal that the guards write into before it exists.
  - Forward references through the TDZ (temporal dead zone: `continueAudio` reads `machine` and `lifecycle` before they're declared), guarded only by a comment.
  - **Ordering contracts kept only by listener insertion order and comments:** `ui` z-order; router `visibilitychange` before main's; `onActivate` gate before lifecycle; ticker logic → audio → render.
- **States:**
  - `title`, `ending`, `round` and `story` each have a 30–35 line `enter` or `update` that does three jobs.
  - The same small patterns repeat: drain-for-advance, hiding the pad, and `deps.scene()` called twice.
- **Duplication:**
  - three copies of device-pixel snapping;
  - colours and `UI_FONT` defined in two places;
  - two ring buffers (cue log, overlay log);
  - listener add/remove lists written twice.

## Target structure

### Scene: `src/game/scene/`

| File | Holds |
|---|---|
| `positions.ts` (pure) | Every playfield position from Main.unity as one ordered table (`WORLD_SPRITES`: array order = draw order, with the sortingOrder noted per row), the arrow row and spacing, the ring radius, all UI text specs. The converted numbers are kept verbatim. |
| `ui-text.ts` | `UI_FONT`, colours, `createUiText`, `placeUiText`. |
| `art-sprite.ts` | `addArtSprite(parent, textures, key, at, label)`. |
| `world.ts` | Sea, sky, boat, backdrops, kraken; `setBackdrop`, `setBoat`, `setKraken`, plus `sprites` exposed for M4's clips. |
| `fx.ts` | The black overlay and the vignette; `setBlack`. M4 adds the flash and the bolts here. |
| `story-view.ts` | The text box and the story text: `setPage`, `relayout`, `paging` (a getter). Hooks for M4's typewriter. |
| `challenge-view.ts` + `progress-art.ts` + `challenge-model.ts` (pure) | Arrows and cursors, the hold ring and the press pips, the prompt; `progressKey`, `cursorKey`, `directionsOf` are unit-testable. |
| `title-card.ts` | The logo, tap prompt and credits; M4's intro, fades and card. |
| `gate-view.ts`, `continue-prompt.ts` | Moved as they are, plus small tidy-ups. |
| `scene.ts` | Composition only (about 40 lines). The `SceneView`, `GateView`, `Scene` shape and the `parts` keys are unchanged. |

- **Function splits:**
  - `drawStory` → `hidePieces`, `acquirePiece`, `stylePiece`, `layoutRow`, `drawPage`;
  - `drawProgress` → `updateCursors`, `drawProgressArt`, `pointOnRing`, with named constants;
  - `setChallenge` → `directionsOf`, `ensureArrowPairs`, `showArrowPair`, `hideArrowPair`, `resetProgress`;
  - the gate bar → `barRect`, `clamp01`, `sameScreen`;
  - the mute icon → `drawSpeaker`, `drawWaves`, `drawSlash`.
- **One `snapToDevicePixels`,** in `core/layout.ts`.

### Main: `src/app/`

| File | Holds |
|---|---|
| `stage.ts` | Pixi init, canvas, layers, display, debug overlay (first in `ui`). |
| `layout-bus.ts` (pure) | The current layout, `onLayout`, and `follow` (subscribe and call now). |
| `resize.ts` | Layout computation, the renderer `"resize"` handler, the resize queue and its 4 triggers. |
| `halting-guard.ts` (pure) | One guard for render, audio tick and game logic, and an error sink that keeps today's overwrite/first semantics. |
| `frame-loop.ts` | The three ticker listeners added in one place, in order. |
| `launch-options.ts` (pure) | `?seed`, `?timescale` (only with `?debug`), the seeder. Unit tested. |
| `input-wiring.ts` | Router and pad view. |
| `audio-wiring.ts` | Engine, mute button, Tap to continue, lifecycle. `wireGestures` registers `onMute`, then `onActivate(gate)`, then `onActivate(continue)`, **after** the machine exists, which removes the forward references. |
| `page-lifecycle.ts` | `visibilitychange` / `pageshow`. Documented precondition: the router's own listener is added first. |
| `cue-log.ts` (pure) | The cue ring buffer, `CUE_LOG_SIZE`. |
| `game-loader.ts` | Loaders, `LOAD_WEIGHTS`, building the scene with rollback (`removeChildrenAddedSince`). |
| `debug-wiring.ts` | `createDebugApi(...)`. `scene` and `error` become getters, so nothing writes into `window.debug` before it exists. `DebugApi` keeps the same shape. |

- **`main.ts` becomes a short bootstrap** (about 60–70 lines) that reads like a table of contents, in today's order.
- **States:**
  - new helpers in `states/common.ts`: `drainAdvanced`, `hidePad`, and `startNewGame` in `session.ts`;
  - `enter`/`update` bodies split into named steps (`scheduleAmbient`, `enterPhaseAt`, `clearToSea`, `winRound`, `applyEvent`, `repageIfLayoutChanged`, `GATE_PROMPTS`);
  - `beginEpoch()` stays an explicit first line of every `enter` (M2 rule);
  - one deps style: destructure at the factory top.
- **Audio engine (flagged only, as it was reviewed twice):** split `applyStoryPart` (66 lines) into named steps, and pull `createBuses`, `loadPending` and `debugSnapshot` out. No scheduler file split.

## Rules for the builders (wave 0b)

1. **No behaviour change:**
   - Keep every label, the `parts` keys, the `SceneView`/`GateView`/`DebugApi` shapes, and the RNG draw order.
   - Keep child order in every layer: world → fx → story → challenge → title, and in `ui`: overlay, pad, mute, continue, gate, then the scene's texts.
   - No `addChildAt`/`zIndex`, and no new wrapper containers between a layer and its children.
2. **Keep the ordering contracts:**
   - Ticker listeners: game logic → audio tick → render, then Pixi's own render at LOW.
   - `visibilitychange`: the router's before main's.
   - `onActivate`: gate before lifecycle.
   - The resize handler applies the layout, then renders the playfield.
   - Any change in the order listeners or children are added must be called out in the report.
3. **Methods stay called through their objects, never destructured.** e2e overrides `debug.audio.resume`, `debug.display.render` and so on.
4. **Story paging identity:** a new paging object on every relayout, forwarded through a getter, never copied. `wrapStyle` is updated in the same call. The M2 spill fix is kept: relayout hides the story text and doesn't redraw.
5. **Pools stay pools:** story pieces and arrow/cursor pairs are hidden and reused, never destroyed. `setChallenge` with the same spec object stays a no-op. `setProgress` keeps its dedupe key.
6. **Scene rollback:** modules add only to the four layers, synchronously, by appending.
7. **Style:** `CLAUDE.md` (const arrow functions, arrow-function properties, UPPER_CASE constants). Keep the "why" comments that cite the original or a review; cut narration. New files carry the "Written by Claude Code" header.

## Safety net, before and after (proposed)

- **Snapshot harness** (scratch, not committed):
  - with a fixed `?seed`/`?timescale`, drive to Title, a story page and a whisper page, each challenge kind mid-progress, the ending card, the gate, and Tap to continue;
  - dump the display tree (labels, visibility, positions, scale, alpha, textures, order) plus the UI texts;
  - hash the render texture's pixels.
  - Before and after must be identical.
- **New tests for the contracts no test guards today.** Added *before* the refactor, so they protect it:
  - an ESLint rule that `clock.tick` is only called from `state-machine.ts` (and tests);
  - e2e: a game-logic throw halts once, suspends audio and keeps rendering;
  - e2e: a render throw and an audio-tick throw are each contained;
  - e2e: the hidden-tab resume guard through the real page wiring (a near-complete Hold doesn't complete);
  - e2e: the `ui` child order at Title;
  - unit tests for `readLaunchOptions`, the seeder, the cue log and the scene rollback.

## Waves

| Step | Agents | Work |
|---|---|---|
| 0b-1 | **Gnome Warden: Safety Net** | The guard tests above and the snapshot harness, on the current code (green before any refactor). |
| 0b-2 | **Dwarf Mason: Scene Split**, **Elf Tidier: Main Split** | The scene refactor and the main/states refactor, in parallel (separate files; `main.ts` imports from the scene's new paths). |
| 0c | **Goblin Scribe: Code Review** | Behaviour-neutral (snapshot identical, counts identical), reads well, rules followed. |

## Owner decisions

1. **The safety net goes first,** before any refactor. The snapshots and the new tests also serve as a before/after record for later comparison.
2. **First error wins for `debug.error`, everywhere.** Today the game-logic guard overwrites an earlier render or audio error, contradicting the `DebugApi` doc. The safety-net step makes all three guards keep the first error (debug readout only) and tests it, so the refactor starts from the corrected behaviour.

