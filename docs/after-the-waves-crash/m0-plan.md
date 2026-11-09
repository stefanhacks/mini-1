# M0 Foundations: plan

This is milestone M0 from [04-implementation-difficulty.md](04-implementation-difficulty.md). It lays the groundwork every later milestone builds on: imported assets, a pausable game clock, a state machine that owns its timers, the render layers, and a logic test setup.

**Not in M0:**
- Render-texture scaling, orientation and safe areas: M1.
- Gameplay: M2.
- The audio engine: M3.
- Animations: M4.

After M0 the deployed page still shows only a placeholder scene, but it loads the real assets through the real pipeline.

## Deliverables

### 1. Asset import (`scripts/import-assets.sh`, outputs committed under `src/assets/`)

The script takes the path of a local After-the-Waves-Crash checkout. It reruns cleanly and needs no network.

- **Sprites:** the 28 used PNGs, copied unchanged to `src/assets/sprites/{actors,stage,ui}/`.
  - Dropped: `eye_large`, `eye_small` and `icon`.
  - Pivots are read from each `.meta` file and converted to Pixi anchors (Unity's y-up becomes Pixi's y-down).
- **Audio:** the 7 used OGGs, transcoded with `ffmpeg` to mono AAC `.m4a`.
  - 96 kbps for music (`BGM01`, `BGM02`, the 3 overlays) and 64 kbps for SFX (`thunderclap`, `kraken`).
  - **Every file gets the same 0.1 s guard band at the start.**
    - For loops, the guard is the loop's own tail, plus a head guard at the end, as in 04.
    - For one-shots, the start guard is silence.
    - Because the offset is identical everywhere, the music stays in phase however a decoder trims padding.
  - `noise.ogg` is dropped.
  - OGG masters are **not** copied into this repo, because they live in the source repo.
  - The placeholder SFX from `scripts/make-sfx.sh` stay as they are.
- **Font:** `JosefinSlab-Regular.ttf` copied to `src/assets/fonts/`. It ships as TTF, not woff2, because no subsetting tools are installed.
- **Typed manifest** (`src/assets/manifest.ts`): every asset imported with `?url`, so Vite hashes it.
  - Sprite entries carry their anchor.
  - Audio entries carry `offset`, `duration`, `loop` and, for loops, `loopStart`/`loopEnd`.
- **Netlify:** `[[headers]]` with `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`.

### 2. Game clock (`src/core/clock.ts`, pure TypeScript, no Pixi import)

- `GameClock`, driven by `tick(deltaMS)` from the Pixi ticker.
  - Has `paused` and the game-time `now`.
  - No timer in the game may use `setTimeout`.
- `TimerScope`, created by the clock, with `after(ms, cb)`, `every(ms, cb)`, `cancel(handle)` and `dispose()`.
  - Each `every` fires once for every period that elapses, in order. Delta is already capped at 100 ms by the Ticker.

### 3. State machine (`src/core/state-machine.ts`, pure TypeScript)

- Generic states with `enter`, `update` and `exit`.
- Each active state gets its **own `TimerScope`**, which is disposed when the state exits. That is how replay can't leak timers.
- A transition requested during `update` is applied after the current `update` finishes, so changes never re-enter.
- Stub states that mirror the original flow: `Gate` → `Title` → `Story` → `Transition` → `Round` → `Ending`.

### 4. Layers and bootstrap (`src/core/layers.ts`, `src/main.ts`)

- Stage tree: `playfield` (the future 500×500 render-texture content, with `world` and `fx` sub-layers) and `ui`.
- `controlZoneRect()` stub: the rectangle where the gesture controls will go. M1 fills it in.
- `main.ts`:
  - Loads the manifest (textures with nearest filtering, then the font).
  - Builds the layers and wires `app.ticker` to the game clock.
  - Starts the state machine.
  - Shows a placeholder static scene (sea, boat, sky, vignette, title) to prove the pipeline works.

### 5. Test setup

- `npm test` runs `node --test` on `src/**/*.test.ts`. Node 22 runs TypeScript directly.
- `tsconfig` gets `allowImportingTsExtensions`, and source files import each other with explicit `.ts` extensions. Vite handles that.
- Unit tests cover the clock (ordering, pause, catch-up, cancel, dispose) and the state machine (enter/exit order, deferred transitions, scope disposal).
- **Types for `node:test`** need a decision; see Open questions.

## How the work runs: agent waves

Workers write code; reviewers only read and report, so code and review stay separate. Claude commits, runs `npm run check`, and pushes after each wave.

| Wave | Agents | Work |
|---|---|---|
| 1, build | **Dwarf Artificer: Assets Import**, **Elf Wizard: Core Clock-states** | Deliverables 1, and 2 + 3 (generic part) + 5, in parallel. They touch different files. |
| 1, review | **Orc Inquisitor: Assets Review**, **Gnome Sage: Core Review** | Check correctness against the Unity `.meta` files and the KB, loop guard bands, test coverage, and Stefan's code style. |
| 1, fix | the same builders | Apply the confirmed review findings. |
| 2, build | **Human Bard: Stage Bootstrap** | Deliverable 4. It depends on wave 1's APIs. |
| 2, review | **Lizard Warden: Runtime Review**, **Goblin Scribe: Code Review** | Run the built app in Chromium with Playwright (asset loading, console errors, a screenshot), and review the code. |
| 2, fix | Human Bard | Apply the confirmed findings. |

## Code style

Follow the existing code written by Stefan:
- double quotes, semicolons, 2 spaces, 120 columns;
- `const` arrow functions and UPPER_CASE constants;
- top-level `await` in `main.ts`;
- the repo's strict ESLint rules, with no disables.

## Open questions

1. **Types for `node:test`:** resolved by the owner. `@types/node@22` was added as a dev dependency.
   - The leak of Node globals into browser code is blocked by an ESLint rule.
   - `setTimeout` and `setInterval` are banned in `src` in favour of `TimerScope`.
2. **Page title:** `index.html` still says "Boil". It's left as is in M0, because M1 touches `index.html` anyway.

## Carried forward from the M0 reviews

- **M1:**
  - Render the playfield at 500 px into the render texture and snap it to whole pixels. Without this, nearest sampling at scales below 1 drops pixel rows: the logo's "THE" becomes unreadable on a Pixel 7 in landscape.
  - The render-texture swap is contained in `layers.ts`.
- **M3:**
  - The Gate needs a visible load error and a retry. Today a single failed asset (Pixi's default strategy is `"throw"`) leaves a black screen and one reported error.
- **Security:**
  - Pixi loads textures in a `blob:` web worker, so any future Content Security Policy needs `worker-src blob:`.

## Done when

- `npm run check` and `npm test` pass.
- The Netlify branch preview loads the placeholder scene with no console errors.
- Both review waves have no open findings.
