# After the Waves Crash: implementation difficulty

Estimates for building the port in this repo, based on [02](02-mobile-alternatives.md) and [03](03-new-mechanics.md). They are measured against the actual starting point:
- pixi.js **8.20.1**, TS 6, Vite 8, strict type-checked ESLint;
- a 30-line template `src/main.ts`;
- no test runner, no assets, no `vite.config`, no `public/`.

**Sizes:** S ≤ 1 day, M 2–4, L 4–7, XL > 7. Days are for one mid-level TypeScript developer who knows Pixi. Expect ±30%, mostly from tuning on devices and from animation data that has to be pulled out of the Unity files.

## Corrections to 02 and 03

These were checked against `node_modules/pixi.js` and the Unity project. Items 1, 3 and 9 were confirmed again by the reviewer. 02 and 03 have been updated to match.

1. **`pointercancel` never reaches Pixi display objects.**
   - `EventSystem` only registers DOM `pointerdown`/`pointermove`/`pointerup`/`pointerover`/`pointerleave`, and `EventBoundary` has no mapping for `pointercancel`.
   - The type is declared, so `sprite.on("pointercancel")` compiles but never fires.
   - The DOM listener on `app.canvas` is **mandatory**. Without it, a cancelled touch (iOS edge swipe, a call, the notification pull) leaves Hold/Brace "held" forever.
   - Also release every tracked pointer on `blur` and `visibilitychange`.
2. **Hit-testing and the render texture.** Objects drawn into the offscreen render texture are not in `app.stage`'s hit-test tree. Every touch target (zone, pad, node proxies) must live in the UI layer, in CSS px.
3. **`ticker.maxFPS = 60` can drop a 120 Hz screen to about 40 fps.**
   - `Ticker` truncates the frame delta with `| 0`, so two 8.33 ms frames give 16 ms, which is less than 16.67 ms, and the frame is skipped.
   - Use `maxFPS` ≥ 63, or leave it at 0 and limit the frame rate by hand.
4. **Two texture settings, not one.** Art textures use `scaleMode: "nearest"`. The render texture's own source must be `"linear"` for the final fit, or the shimmering comes back.
5. **Large deltas are already clamped.** `Ticker` caps elapsed time at 100 ms, so no extra clamp is needed.
6. **Chart's notch rule needs a drift reset.** If the minor axis reaches 0.6·notch before a commit, re-zero it. Otherwise a slow diagonal drift blocks every commit until the finger lifts.
7. **The mash exploit is only gone if Chart tracks one active pointer.** Haul allows several fingers, so set the pointer policy per mechanic.
8. **The keyboard fallback must ignore `KeyboardEvent.repeat`.** Otherwise holding a key passes Many; Unity's `GetKeyDown` ignored repeats. It must also release holds on `blur`.
9. **The original typing speed was about one character per frame**, not 100 per second. Each character yields `WaitForSeconds(0.01)` in `TextManager.cs`, so the effective rate was about 60 chars/s at 60 fps. Whispers ran at 0.1 s/char.
   - Use a time accumulator that can reveal several characters per frame.
   - Pre-wrap lines with `CanvasTextMetrics.measureText`, so words don't jump between lines while typing.
10. **There are 24 animation clips**, not 23:
    - 20 with curves;
    - 3 event-only (`Inicio`, `Troca`, `Fim`);
    - 1 unused (`PillarsSwitch`).
    - There are also 14 controllers.
11. **There are no sprite sheets.** All 30 textures are single sprites at PPU 1 with point filtering. 25 have a centred pivot and 5 a top-centre pivot.
12. **The rain particles' speeds and sizes can't be derived from the files**, because the canvas scale is computed at runtime. They will be tuned by eye.
13. **Pixi has no audio loader.** Audio is plain `fetch` + `decodeAudioData`, as 02 says.
    - Fonts can go through `Assets` (`loadWebFont`) or `document.fonts.load`.
    - `navigator.audioSession` is not in TS's `lib.dom`, so it needs a `declare` plus feature detection.
14. **Also handle bfcache restores**: on `pageshow` with `persisted`, do the same as on returning from a hidden tab.

## Gameplay and core

| Item | Size | Days | Main risks |
|---|---|---|---|
| **Base layer**: game clock on `deltaMS`, layers, control-zone rectangle provider, state skeleton that owns its timers, pure-logic test harness | M | 2–3 | Timer ownership; it is needed so replay doesn't leak timers |
| **Compass pad baseline**: pointer router (per-pointerId map, DOM cancel, stale-pointer ignore), pad view, Sequence/Hold/Many rules with the quirk fixes, arrows/cursors/ring/pips, keyboard fallback | M–L | 5–6 | Stale pressed state after a cancel; iOS callout |
| Shared gesture layer for 03 (zone in 1 or 2 places, edge exclusion, per-mechanic pointer policy, tuning overlay) | M | 2 | Landscape bands may be too narrow |
| **Chart the Course** | L | 4–6 | Tuning *is* the feel; the unease effect has no spec yet |
| **Brace the Helm** | M | 2–3 | Stuck holds; rain slant depends on the rain system |
| **Haul the Line** | M | 2–3 | Return-stroke jitter; fatigue (playtest) |
| All Hands, Latch, Steady haul | S each | 0.5 each | — (specs settled; the node-tap assist was dropped) |
| Helm Wheel (if Chart is rejected) | L | 4–6 + art | Ghost detents; rotation shimmer, which needs pre-rendered frames |
| Follow the Light (if Chart is rejected) | M–L | 3–5 | Design problems (reach, occlusion), not code problems |
| State machine: title → 4 stories → 3 rounds → ending → replay | M | 2–3 | Leaks on replay |
| Challenge generation (3/5/7, Hold and Many placement, seedable RNG) | S | 0.5 | — |
| Typewriter: accumulator, whispers, pre-wrap, tap-to-complete, debounce | M | 2 | Fallback font baked in if fonts aren't awaited |
| Event timeline: thunder, flash and title reveal, Troca, Fim, layer fades, bubbles | L | 4–5 | Exact curves must be transcribed from the Unity `.anim` files |

**Gameplay subtotal:** about **14–17 days with the pad only**, or **27–35 days with the 03 set** on top of it, plus 2–3 tuning passes on devices.

## Platform, presentation and pipeline

| Item | Size | Days | Main risks |
|---|---|---|---|
| **Sprites**: 28 PNGs, 143 KB, single sprites, pivots flipped from Unity's y-up | S | 0.25–0.5 | `eye_*` dropped. No PNG optimiser is installed. |
| **Animations**: 20 curve clips, through a ~100-line Hermite evaluator that uses Unity's `inSlope`/`outSlope` and hand-copied keyframe tables. No tween library. | M | 2–3 | Unity RectTransform units must be converted per parent chain. `SeaAnimTrês` stretches vertically. The boat rotates ±7°, so slight shimmer. |
| **Particles**: rain (kill at the sea line and spawn a splash; no physics), splash, bubbles, on `ParticleContainer`/`Particle` | M | 1.5–2.5 | All look-tuning, with no reference capture. `boundsArea` must be set. |
| **Font**: `JosefinSlab-Regular.ttf` (110 KB, 53 KB gzip, OFL). Drop the 544 KB TMP SDF asset. | S | 0.25–0.5 | A woff2 subset (15–30 KB) needs fonttools, which isn't installed. The TTF is fine for a first version. |
| **Audio transcode**: ffmpeg (installed) to mono AAC `.m4a`, encoding each loop as `[tail guard | loop | head guard]` so loops stay seamless however a decoder trims padding. Commit the outputs and the script. | S | 0.5 | Safari's AAC trimming is unverified; the guard bands cover it |
| **Layout and scaling**: two orientations, safe areas through CSS variables, sharp-bilinear render texture (k=2 → 1000², about 4 MB), UI layer at full DPR, `visualViewport` and resize coalescing | L | 3–4 + device iteration | iOS URL-bar and rotation resize bursts; WebGL context loss after iOS backgrounding (not in the KB yet) |
| **Audio engine**: unlock, overlays scheduled at `start + n·9.6 s` (`OverlayPhase04` restarted on each bar), BGM02 one-shot, world and UI SFX channels, mute + persistence, suspend/resume with re-anchoring, `interrupted` handling, bfcache | M–L | 2.5–4 | All of the iOS behaviour |
| **Lifecycle**: start gate with load progress, pause overlay, soft restart that keeps textures, buffers and the audio context | M | 1.5–2.5 | A stray `setTimeout` breaks pause; leaks on restart |
| **Effects**: lightning (5 sprites, playfield x), flash with the reduced-motion cap, vignette and pulse, parallax, pooled rain, frame-rate cap per correction 3 | M | 1.5–2 | 120 Hz cadence; rain on low-end Android |
| **Page protections and Netlify**: `viewport-fit=cover`, CSS gesture rules, `contextmenu`; `[[headers]]` with immutable cache on `/assets/*`; assets imported with `?url` so Vite hashes them | S | 0.5–1 | iOS callout suppression is never guaranteed. The `.m4a`/`.ttf` content type on Netlify is unverified. |
| **Test infrastructure**: Playwright with Chromium (installed globally) against `vite preview`, plus pure-logic tests | M | 2–3 + ~2 days of device sessions | No WebKit locally. Adding `@playwright/test` would be a new dev dependency, an owner decision. |

**Platform subtotal:** about **17–26 days**. About 30% of that is tuning and device iteration that can't be compressed.

## Total

| Scope | Estimate |
|---|---|
| Faithful port with the compass pad (02) | **about 31–43 dev-days** |
| With the touch-native set (03) on top | **about 44–61 dev-days** |

The 03 set builds on the pad: the pad remains the fallback and the desktop control. So the cheapest path is to ship the pad version first, then add Brace, Haul and Chart on top.

## Web build weight

| Part | Over the wire |
|---|---|
| Pixi + game JS | about 120–140 KB gzip (current Pixi critical path measured at about 102 KB) |
| PNGs | about 143 KB |
| Font | 53 KB (TTF, gzip), or 15–30 KB as a woff2 subset |
| Audio (7 files, mono AAC) | 554 KB at 64 kbps, or 832 KB at 96 kbps |
| **Total** | **about 0.85–1.2 MB**. Audio is 65–70% of it. `BGM02` and the late overlays can stream in after the start gate. |

## Suggested milestones

Gameplay and platform tracks interleave. Each milestone ends with a Netlify branch preview opened on real phones.

1. **M0, foundations (3–4 days):**
   - Asset import: PNGs, the AAC transcode script with guard bands, the font, cache headers.
   - Game clock, layers, a state skeleton that owns its timers, a test harness.
2. **M1, display skeleton (3–4 days):** render texture scaling, both orientations, safe areas, UI layer, page protections.
   - **First device check:** safe areas, URL bar, callouts.
3. **M2, playable loop with the pad (6–7 days):** challenge generation, pointer router with the DOM cancel, the three rules, keyboard fallback, placeholder text.
4. **M3, audio and start gate (3–4 days).** iOS goes first, because it's the biggest unknown.
5. **M4, story and presentation (6–8 days):** typewriter, transitions, Hermite animations, event timelines, thunder and flash, ending, replay.
6. **M5, effects and lifecycle (4–6 days):** rain, splash, bubbles, reduced motion, pause and resume, soft restart.
   - **Shippable faithful port.**
7. **M6, touch-native set (10–14 days):** gesture layer, then Brace, then Haul (these prove the gesture layer), then Chart, then the assists.
8. **M7, tuning, performance and device matrix (3–5 days):**
   - Devices: a recent iPhone and a small iPhone, a mid-range Android, a 120 Hz Android, plus desktop Safari and Firefox.

## What needs real devices

| Can be automated (Playwright Chromium, unit tests) | Needs real devices |
|---|---|
| Challenge generation and rule state machines (including the quirk fixes) | iOS audio: unlock, silent switch, `interrupted`, AAC loop trimming |
| Gesture recognisers fed synthetic `{id, x, y, t}` streams | Notch size, Brace threshold, knot distance, timeouts, tap and haul rates, fatigue |
| Multi-pointer logic and `pointercancel` injection | Real `pointercancel` sources, long-press callout, double-tap zoom |
| Layout screenshots in both orientations (safe areas faked with CSS variables) | Real safe areas, URL-bar behaviour, landscape band width, thumb reach and occlusion |
| Reduced motion, visibility/freeze, decode lengths, timeline ordering, replay leaving no timers | 120 Hz cadence, 3× sharpness, rain on low-end Android, WebGL context loss |

## Owner questions

All resolved:

1. **Test tooling:** two stages.
   - Pure-logic tests on `node --test` from M0, with no dependency. This needs `allowImportingTsExtensions` in tsconfig.
   - `@playwright/test` is added as a dev dependency at M1, when there is a layout to screenshot. Until then, any browser check uses plain Node scripts with the global Playwright.
2. **Node-tap assist:** dropped. The compass pad is Chart's accessibility fallback: tap the arrows in order.
3. **Hold assists:** merged into one Latch, triggered from the compass pad or the keyboard (see 03).
4. **Steady haul:** the window doubles, to 6 s.
5. **Many window expiry:** the next window starts at the next counted movement.
6. **Sequence timeout after a wrong input:** kept as in the original. A wrong input doesn't restart the timer.
7. **Overlay drift:** aligned. `OverlayPhase04` restarts on every 9.6 s bar (see 02).
