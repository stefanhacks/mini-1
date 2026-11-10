# M1 Display skeleton: plan

Milestone M1 from [04-implementation-difficulty.md](04-implementation-difficulty.md), reviewed against the code M0 shipped (`src/core/layout.ts`, `src/core/layers.ts`, `src/main.ts`) and against Pixi 8.20.1.

**Goal:** the playfield renders pixel-sharp at any size, in both orientations, inside the safe area. The control zone gets its real rectangles, and the page stops reacting to browser gestures.

**Not in M1:**
- Gameplay or the input router: M2.
- Audio and the start gate: M3.
- Animations: M4.

## Changes from the earlier plan (02 and 04)

The review found five problems in the M1 design as 02 describes it. 02 has been corrected to match.

1. **The text box can't sit below the square in portrait.**
   - 02 put the square at the top, the text box under it, and the pad in the bottom 35–40%. On a 16:9 phone that doesn't fit. On an iPhone SE (375×667, top inset 20) the space left under the square is 272 px; a 35% zone takes 233 px, which leaves 39 px for a 110 px box.
   - In the original, the text box sits *inside* the square (bottom, y −160). The story text and the gameplay controls never show at the same time: the text box hides during rounds.
   - **Fix:** keep the text box inside the square, as in the original, in both orientations. The control zone owns all the leftover space.
2. **The text box can't use "its own integer scale" in the UI layer.**
   - `text_box.png` is 438 px wide. Its smallest integer scale (1) is already wider than a 375 px phone.
   - **Fix:** the text box *art* goes in the playfield (`top` layer), so it goes through the render texture like all other pixel art.
   - The *text* stays in the UI layer at full DPR, positioned by mapping playfield coordinates to screen coordinates.
3. **The control space was left to chance.**
   - The square took the whole short side, and the controls got whatever was left. In landscape on a near-square screen (4:3 tablets, foldables, desktop windows) the bands are too narrow for the 170–200 px pad; on a square screen they disappear.
   - **Fix:** reserve the control space first (see Layout rule), and let the square take what remains.
4. **"Snap to whole pixels" has to be in device pixels.**
   - M0 floors the offset in CSS px. At DPR 2.625 (Pixel 7) a whole CSS pixel is not a whole device pixel.
   - **Fix:** snap the final sprite's position and size to device pixels.
5. **Pixi's resize plugin misses `visualViewport` changes.**
   - With `resizeTo` set to an element, `ResizePlugin` still listens only to `window` `resize`. It reads `clientWidth`/`clientHeight`, and it already coalesces to one resize per frame (`queueResize`). It never sees iOS URL-bar or keyboard changes that only fire on `visualViewport`.
   - **Fix:** also call `app.queueResize()` from `visualViewport`'s `resize` event.

## Deliverables

### 1. Page shell (`index.html`, `src/style.css`)

- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- **Game container:** a `#game` element with `position: fixed; inset: 0`. The canvas goes inside it, and Pixi's `resizeTo` points at it instead of `window`.
- **Safe-area probe:** a hidden element whose padding is `env(safe-area-inset-top/right/bottom/left)`, read with `getComputedStyle` on every resize.
- **Gesture protection:**
  - on `html` and `body`: `overscroll-behavior: none`, `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent`;
  - `preventDefault` on `contextmenu`;
  - Pixi already sets `touch-action: none` on the canvas.

### 2. Layout rule (`src/core/layout.ts`, pure, unit tested)

Inputs: screen size in CSS px, the safe-area insets, and the device pixel ratio.

- **Orientation:** portrait when the safe width ≤ the safe height.
- **Control space is reserved first:**
  - **Portrait:** a bottom zone of at least `MIN_ZONE_HEIGHT` (proposed: 30% of the safe height, and at least 200 CSS px).
  - **Landscape:** two side bands of at least `MIN_BAND_WIDTH` each (proposed: 200 CSS px, so the 170–200 px pad fits).
- **The square takes what remains:**
  - portrait: side = min(safe width, safe height − zone);
  - landscape: side = min(safe height, safe width − 2 × band).
  - Portrait anchors the square to the top of the safe area. Landscape centres it vertically.
  - The leftover space is then **split back** to the controls: the portrait zone grows to fill everything under the square, and the bands to fill the space beside it.
- **Snapping:** the square's position and side are snapped to whole **device** pixels.
- **`controlZoneRects`** returns the final zone or bands:
  - inset by the safe area;
  - minus a **24 px edge exclusion** on any side that touches the screen edge, against the iOS swipe-back and Android back gestures (03).
- **New export: `playfieldToScreen(point)`**, so the UI layer can position text over the playfield's text box.

### 3. Sharp-bilinear render texture (`src/core/layers.ts`)

- **Off-stage:** `playfield` leaves `app.stage`. The stage holds a sprite showing the render texture, then `ui`.
- **Render texture:**
  - `k = max(1, floor(sideDevicePx / 500))`;
  - created with `RenderTexture.create` at 500·k px and resolution 1;
  - `scaleMode: "linear"` on the render texture's own source, while the art keeps `"nearest"`.
  - It is recreated only when k changes, and the old one is destroyed.
- **Each frame:** render `playfield`, with a scale-k transform, into the texture via `renderer.render({ container, target })`.
  - It runs from a ticker listener at `UPDATE_PRIORITY.NORMAL`. That is after `machine.update` and before Pixi's own stage render, which runs at `LOW`.
  - It is outside the game-logic error guard.
- **Display:** the sprite is sized to the snapped square in CSS px, so the browser never resamples it a second time.
- **Resolution:** the canvas uses the real DPR, **capped at 3** instead of 2. Low-end Android phones report DPR 3.5–4; 3 bounds the fill cost, and the render texture already bounds the art cost.

### 4. Text box in the playfield

- `text_box.png` is added to `top` at the original's position.
- It's hidden by default. M2/M4 drive it; M1 only shows a test line in the UI layer, positioned with `playfieldToScreen`, to prove the mapping.

### 5. Placeholder update

- The temporary scene stays, now drawn through the render texture.
- The `m0-label` becomes a debug overlay that draws the control zone rectangles. It shows only with `?debug` in the URL, for screenshots and device checks.

### 6. Tests

- **Unit tests (`node --test`):**
  - the layout rule across iPhone SE, iPhone 13/15, Pixel 7, iPad (both orientations), a 1:1 window, desktop 16:9, and DPR 1/2/2.625/3;
  - safe-area insets;
  - snapping to device pixels;
  - the minimum zone and band sizes;
  - the edge exclusion;
  - `playfieldToScreen`.
- **Browser tests:** add **`@playwright/test`** as a dev dependency (owner decision 4.1, deferred to M1).
  - **Version:** pin it to 1.63, the version whose Chromium is pre-installed in the cloud environment. On a local machine it downloads its own browsers.
  - **Tests:** load without errors; layout screenshots per device preset and orientation, with safe areas faked through the probe's CSS variables; the render-texture k per DPR; resize and rotation; no document overflow.
  - **Script:** `npm run e2e`. It's kept out of `npm run check`, because Netlify doesn't need it.

## Risks

- **WebGL context loss after iOS backgrounding.** The render texture is redrawn every frame, so its content comes back. Pixi's own restore path is unverified, so check on a device.
- **Edge exclusion:** 24 px may need tuning per device.
- **Landscape phones:**
  - iPhone 13 landscape, 844×390 with 47 px side insets: the square is 369 px and the bands about 190 px, just under the proposed 200 px minimum. So the square shrinks to about 350 px.
  - That's acceptable, but it's the tightest common case. Check whether 190 px bands are enough, and lower the minimum if so.
- **No real device in CI.** Emulation reports `env(safe-area-inset-*)` as 0. Real insets, URL-bar behaviour and callouts need a phone.

## Done when

- `npm run check`, `npm test` and `npm run e2e` pass.
- The branch preview on a real phone, in both orientations: the square is inside the safe area, the art is pixel-sharp with no dropped rows (the logo's "THE" is readable), there's no page scroll, bounce or callout, and the `?debug` zones sit where expected.

## Owner decisions

All approved:

1. **Minimum control sizes:** portrait zone at least 30% of the safe height and at least 200 CSS px; landscape bands at least 200 CSS px each.
   - These minimums are reserved **before** the 24 px edge exclusion (owner decision after review). On a side with no safe-area inset, the final zone or band is therefore at least 176 px.
   - The compass pad is sized `min(200, zone width, zone height)`, and placed toward the bottom of a tall portrait zone.
   - The API differs slightly from the plan text: `computeLayout(screen)` returns `{ orientation, safe, square, scale, zones, dpr, sideDevicePx }`, and the mapping functions are `playfieldToScreen(layout, point)` and `screenToPlayfield(layout, point)`.
2. **DPR cap:** 3.
   - The render scale k is capped at 6 (a 3000² render texture). The canvas size is floored to whole device pixels, so fractional DPRs like 2.625 aren't resampled a second time.
   - **Story text pagination (owner decision after the M1 review):**
     - Keep the 16 px minimum font size, and never let text spill out of the box.
     - Each page shows `storyLinesPerPage(layout)` lines: as many as fit from the text top to the box bottom (95 art px). That's 2 lines from about a 211 px square, 1 below.
     - Pages break at sentence boundaries where possible, and a tap advances. M4 implements this.
   - **Whole art pixels:** playfield positions must sit on whole art pixels. Half pixels tear rows at odd k; the boat moves from y 309.5 to 310.
3. **`@playwright/test`:** pinned to 1.63.

## How the work runs

Same pattern as M0: builders write, reviewers only read and report, Claude commits after each step.

| Wave | Agents | Work |
|---|---|---|
| 1, build | **Elf Ranger: Layout Rule**, **Dwarf Smith: Page Shell** | Deliverable 2 (pure layout and its tests), in parallel with deliverable 1 plus the `@playwright/test` setup. |
| 1, review | **Orc Oracle: Layout Review**, **Gnome Tinker: Shell Review** | Layout maths across devices; page shell, CSS and e2e setup. |
| 2, build | **Human Artificer: Render Texture** | Deliverables 3–5 and the browser tests. |
| 2, review | **Lizard Warden: Runtime Review**, **Goblin Scribe: Code Review** | Runtime in Chromium across device presets; code against the plan and Pixi 8.20.1. |
