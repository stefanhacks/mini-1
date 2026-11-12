# M5 Effects and lifecycle: plan

Milestone M5 from [04-implementation-difficulty.md](04-implementation-difficulty.md), planned against the code M0–M4 built. With M5 the port becomes the **shippable faithful port**; M6 then adds the touch-native challenges.

**Goal:** the original's remaining effects (rain, splashes, bubbles) plus the eye sprites, a real pause and resume, reduced motion everywhere it matters, and the lightning flash optionally reaching past the playfield to tint the whole screen.

**Not in M5:**
- Touch-native gestures (Chart, Brace, Haul): M6.
- The device matrix and iOS checks: M7.

## What M4 left us

| Built or found in M4 | Consequence for M5 |
|---|---|
| Clip player on the game clock; `fades.ts`; ambient loops | Particles and eyes run on the same clock, so pause freezes them for free. No `setTimeout`, no Pixi ticker time. |
| Seeded streams: rounds, ambient thunder, lightning | Rain, bubbles and eyes get their own salted streams, so they never shift the rounds' or the strikes' draws, and the snapshot harness stays deterministic. |
| Lightning: bolt + flash `Graphics` on the fx layer, inside the 500 px render texture; reduced-motion peak 0.4 | The flash stops at the playfield square. Tinting the whole screen needs a layer outside the render texture (see Deliverable 3). |
| Reduced motion caps only the flash | The sea, cloud and boat loops, the prompt and arrow pulses, the thrown boat and the new particles need a reduced-motion rule each (Deliverable 4). |
| Audio "Tap to continue" on resume | The pause overlay extends it: one prompt, not two. |
| Pixi's `canvasText._activeTextures` keeps one null key per typed prefix (about 840 per game) | Prune it on Title (Deliverable 6). |
| Rare torn art pixel under heavy load (twice, not reproduced in 129 runs) | Watch it while adding layers. Recheck on devices in M7. |
| `ticker.maxFPS` is not set anywhere | Correction 3 is not triggered today. Keep it that way, or use ≥ 63 if a cap is ever added. |

## Deliverables

### 0. Fixes carried in (done first, on this branch)

- The ending's last phase is renamed from `prompt` to `replay`, so it no longer shares Title's phase name.
- "Tap to play again" waits 5 s longer: at 22.25 s into the ending instead of 17.25 s (owner decision 1).

### 1. Rain, splashes and bubbles (`src/game/scene/particles/`)

- **Spec:** [m5-particles-spec.md](m5-particles-spec.md) (wave 0, every number cited). Rain 220/s, 1 s life, (−375, +375) px/s, dying at the sea line y ≈ 331 or on the boat, 3-particle splash bursts; bubbles 5 s life rising 30 px/s. Splash spread, the sea line ±4 px and the eye band are tuned by eye.
- **Source of truth:** Main.unity holds 3 `ParticleSystem`s (rain, its splash sub-emitter, the bubbles). A spec agent extracts every used module first: rate, lifetime, start speed and size, shape, gravity, colour over lifetime, sub-emitter trigger, `maxParticles`, simulation space. Only values the YAML gives are taken as is; the canvas-scale-dependent ones are tuned by eye (04, point 12).
- **Rain:** 220/s, pooled on a v8 `ParticleContainer` inside the render texture (so its cost doesn't grow with the screen). A drop dies at the sea line and spawns a splash. No physics.
- **Bubbles:** in the underwater band, 1/s, then 2, 4, 6 after each round, as `GameManager.SetBubbles` intends (owner decision 10: the original most likely never showed the ramp, since the rate is stored in two-curves mode, which those calls don't change). The original's rate 1 at the end is replaced: none once the kraken shows (owner decision 4).
- **Determinism:** salted seeded streams; the particle step runs inside the game-logic guard, on the clock.
- **Budget:** at most +1 ms CPU per frame on the 4× throttled iPhone-13 profile used in the M4 runtime review. Halve the rain rate only if a low-end device needs it (02).

### 2. Eye sprites (the M4 draft design)

- Re-import `eye_large.png` and `eye_small.png` with `scripts/import-assets.sh` and the manifest.
- An eye replaces a bubble burst, never adds to one. It fades in (about 0.5 s), stays 1.5–3 s, may drift a few art pixels, then fades out. It never overlaps another eye.
- **Rarity, from a seeded eye stream:**
  - parts 0–1: at most one per game, 5%, `eye_small` only;
  - part 2 on: about 1 in 6 per bubble slot;
  - `eye_large` from part 3;
  - never on Title, and none (nor bubbles) once the kraken shows (owner decision 4).
- `?debug&eyes=always` forces them for review.
- The numbers are confirmed (owner decision 3).

### 3. Screen-tone flash (owner request: can the page flash with the thunder?)

**Short answer:** flashing the page's CSS as it stands would show nothing. The canvas fills the whole viewport (`#game` is `position: fixed; inset: 0`) and Pixi clears it to opaque black, so the body's background is never visible. The flash already covers the playfield square; what's missing is the **letterbox** around it, which on a phone is more than half the screen (an iPhone 13 in portrait: a 390 px square on an 844 px tall screen).

| Option | How | Cost and risk | Verdict |
|---|---|---|---|
| A. Pixi screen layer | A full-canvas rect on the stage, behind the playfield sprite (outside the render texture), whose alpha follows the same `Flash.anim` value each frame. | One extra quad per frame, nothing when hidden. Same frame as the in-playfield flash, same clock (pauses with it), same reduced-motion cap. Testable with the existing pixel reads. About 0.5 day. | Measured in wave 0: too costly on a CPU renderer. Replaced by the clear colour (below). |
| B. CSS body background | Make the canvas transparent (`backgroundAlpha: 0`) and animate `body` `background-color` from JS. | Changes how the canvas composites on every frame, all game long, for an effect that lasts 0.5 s. A style change per frame during the flash. DOM timing can drift a frame from the canvas. | Possible, not advisable. |
| C. CSS overlay `<div>` | A fixed, `pointer-events: none` div over or under the canvas, with JS-driven `opacity`. | Opacity is compositor-cheap, but above the canvas it would also wash out the UI text and the mute button; under it, it needs B's transparent canvas. | Only if A fails. |
| D. Browser chrome tint | Change `<meta name="theme-color">` with the flash, tinting the address bar where the browser supports it. | Support and update smoothness vary by browser and version, and I haven't verified it. Discrete colour steps, not an alpha curve. | Optional extra, after a spike on real devices. |

- **Colour:** the same white as the flash, with the same curve (owner decision 2).
- **Photosensitivity:** the strike rate stays at most 1 flash/s, under WCAG 2.3.1's 3/s, so a larger area doesn't break the threshold. But a full-screen flash is stronger for sensitive viewers. So the screen layer **follows the reduced-motion cap** and the optional "reduce flashes" setting (Deliverable 4), and the gate's warning stays.
- **Where:** the real playfield flash stays as it is; the screen layer only adds the letterbox. The vignette stays inside the playfield.

**Wave 0 result (Elf Seer: Flash Screen-tone, prototype in scratch):**
- A drawn full-screen layer matched the flash's alpha on every frame and left the square's pixels bit-identical, but its blended draw added about 35% (iPhone, DPR 3) to 45% (desktop) to the frame interval in headless Chromium's CPU renderer. A real GPU is probably far cheaper, but that's unmeasured.
- **Chosen instead (owner decision 8): the renderer's clear colour.** Each frame, after the clips sync and before the stage renders, the clear colour becomes grey `a` (white at the flash's alpha `a` over black). It costs about nothing, needs no new layer, stage child or `Layout` field, and covers the whole canvas, insets included. It can differ from the square's flash by 1 level in 255 at the square's edge, from rounding.
- **Photosensitivity, measured over the whole screen** (WCAG relative luminance): the full flash goes 0.007 → 1.0 at its peak (today 0.46 in portrait, since the letterbox is 54% of the screen in portrait and 63% in landscape); reduced motion goes 0.007 → 0.14, still one WCAG flash (rise above 0.10). The rate stays at most 1 flash per 1.25 s.
- **"Reduce flashes" (owner decision 9):** turns the screen tone off and caps the square's flash at 0.4. OS reduced motion keeps the screen tone, capped like the square.
- A pause mid-flash freezes the tone with the clock; the pause overlay sits above it.

**Built in wave 2 (Elf Lamplighter):**
- `src/game/screen-tone.ts` sets `renderer.background.color` to `[a, a, a]` only when it changes, from the flash's alpha (black while it is hidden). It runs as its own guarded ticker listener after the audio tick and before the playfield's render pass (`frame-loop.ts`), so a halted game keeps its last tone. The render texture's pass passes its own `clearColor` (opaque black, `core/display.ts`), so it never takes the grey.
- The rule is one table, `flashRule(reducedMotion, reduceFlashes)` in `src/game/lightning.ts`: the flash is capped under either; the tone is off only with the toggle. The square's cap is read at each strike (as before); the tone reads the toggle every frame, so turning it on mid-flash blacks the letterbox at once while the square finishes its strike.
- The toggle (`src/game/reduce-flashes.ts`, key `mini-one.flashes.reduced`, `try`/`catch` like mute) is the third corner button (`flashes-button.ts`, a bolt, struck through when on). It shows from the gate on, like mute; a tap only toggles (no audio unlock, no resume, paused or not). No key.
- The ui layer's order is now: debug overlay, pad, mute, pause, **reduce flashes**, Tap to continue, the gate's view, the scene's texts.

### 4. Reduced motion everywhere

One rule per effect, decided once in a table in `src/game/motion.ts` (or the existing lightning module's cap), read live so switching mid-game works, as the flash cap does:

| Effect | Under `prefers-reduced-motion: reduce` (chosen in wave 2, `REDUCED_MOTION` in `src/game/motion.ts`) |
|---|---|
| Lightning flash, screen tone | Peak capped (0.4 today), also by the "reduce flashes" toggle |
| Sea strips, clouds, boat bob | Slower (owner decision 5): their clips at **0.5×** speed, switched from the current pose (no jump) |
| Prompt and arrow pulses | Held at full alpha (1), no scale pulse (scale 1); the pulse restarts from alpha 1 when switched off |
| Thrown boat, kraken rise | Kept (they're story beats) |
| Rain | Rate **0.5×** (110 drops/s), speed **1×**, no slant change |
| Bubbles, eyes | Kept, they're slow |

The scene reads the same query as the flash cap (`watchReducedMotion`) once a frame, before the weather's sync, and applies the matching row when it changes, so switching the OS setting mid-game takes effect without a reload.

- A **"reduce flashes" toggle** below mute (owner decision 7), persisted like mute. It applies the flash cap without the OS setting.

### 5. Pause and resume

- **Pause** on `visibilitychange` (hidden) and `pagehide`; the clock stops, which freezes clips, particles and timers.
- **On return:** a pause overlay with "Tap to continue" (merged with the audio prompt: one tap resumes audio and the game). During a round, the current challenge's progress resets (02).
- **Soft restart:** replay already keeps textures, buffers and the audio context. M5 makes sure the new particle and eye pools and their streams reset too, and leak tests cover them.
- **A pause button just below mute** (owner decision 6), new in this port. It shows the same overlay; a tap on the overlay resumes.

### 6. Housekeeping

- Prune the null keys from Pixi's `canvasText._activeTextures` on Title. It's a private field, so the code guards for its absence and a unit or e2e test pins the Pixi version's behaviour.

### 7. Tests

- **Unit:** particle stepping (spawn rate, lifetime, sea-line kill, splash spawn), the eye rarity schedule per story part, the reduced-motion table, pause and resume on the clock.
- **e2e (inside the M4 budget: the suite stays under 3 min):** desktop, frame-locked like `motion.spec`; rain and bubbles present and pooled (no growth over 3 replays); the screen layer peaks with the flash and stays capped under reduced motion; pause overlay on hidden, resume on tap.
- **Owner on Android:** rain cost on a mid-range phone, the screen tone by eye, pause from the app switcher.

## How the work runs

| Wave | Agents | Work |
|---|---|---|
| 0, spike (read-only and scratch, in parallel) | **Dwarf Surveyor: Particles Unity-spec**, **Elf Seer: Flash Screen-tone** | The particle spec from Main.unity. A scratch prototype of option A, measured on the throttled profile, with screenshots for the owner. |
| — | **Owner** | Looks at the screen-tone prototype's screenshots (option A, white, already chosen). |
| 1, build | **Gnome Tinker: Particles Rain-bubbles**, **Human Keeper: Lifecycle Pause** | Deliverables 1 and 2; Deliverables 5 and 6. Separate files, in parallel. |
| 1, review | **Lizard Warden: Runtime Review**, **Halfling Eye: Visual Fidelity Review** | Cost, leaks, pause and replay; particles against the Unity spec. |
| — | **Owner** | Android check of rain and pause. |
| 2, build | **Elf Lamplighter: Flash Screen-tone**, **Owl Sage: Motion Reduced-motion** | Deliverable 3 (the chosen option); Deliverable 4 and the optional toggle. |
| 2, review | **Goblin Scribe: Code Review**, **Lizard Warden: Runtime Review**, **Gnome Warden: Coverage Review** | Code; photosensitivity measured over the whole screen; test coverage and the 3-minute budget. |

**Estimate:** 4–6 dev-days (04), plus about 0.5–1 day for the screen tone.

## Risks

- **Rain on low-end Android:** bounded by the render texture, but 220/s plus splashes is the heaviest thing on screen. The budget above and the owner's device check catch it.
- **Full-screen flash:** stronger for photosensitive players even under the rate threshold. Capped with reduced motion and the toggle.
- **Private Pixi field:** the text-cache pruning can break on a Pixi upgrade; guarded and tested.

## Owner decisions

1. **"Tap to play again" comes 5 s later than planned in M4** (22.25 s into the ending, `REPLAY_EXTRA_MS`), unusually long, to suggest there's no way back. The ending's last phase is renamed `replay`.

2. **Screen tone: option A** (a Pixi layer behind the playfield, outside the render texture), in **the same colour as the flash** (white), following the same curve and the reduced-motion cap. Wave 0 still prototypes it to measure the cost.
3. **Eyes:** keep the draft numbers, with an alpha fade in and out (no blink). **Never on Title.**
4. **Nothing under the sea once the kraken shows:** from the ending's kraken phase (1.5 s) on, no bubbles and no eyes. This replaces the original's bubble rate 1 at the end, and drops the draft's large eye in the ending's empty sea.
5. **Reduced motion: the sea, clouds and boat move slower** (not stilled).
6. **A pause button just below mute,** in the same corner of the safe area.
7. **A "reduce flashes" toggle in M5, below mute.** Assumed order, top to bottom: mute, pause, reduce flashes. Each is hit-tested before the pads and never inside a control zone.
8. **The screen tone uses the renderer's clear colour,** not a drawn layer (wave 0 measured the layer's cost).
9. **"Reduce flashes" turns the screen tone off** and caps the square's flash at 0.4. OS reduced motion keeps the tone, capped.
10. **Bubbles follow the script's intent:** 1/s, then 2, 4, 6 after each round; none once the kraken shows.

## Owner decisions after the wave-1 reviews

11. **Eyes show between pages, not behind them.** During story pages the opaque text box and the vignette hid them (Halfling Eye measured about 73% of eye centres over 50% vignette black). They may appear only when no text box is up: the pause before part 0's first page, the 1.25 s after each won round, the transitions, and the ending before the kraken. Their area shrinks to the clear middle under the boat (about y 345–405, x 170–330). Still never on Title, none from the kraken on.
12. **Splashes overlap:** the 3 dots land within 1 px, so a splash reads as one speck, as the original's overlapping particles did.
13. **Pause on Title and the ending card:** the title's own prompt and "Tap to play again" hide while paused, the pause box sits clear of the logo, and the pause button shows a play icon while paused.
14. **Weather cost is checked in M7:** about +0.8–0.9 ms average and +1.0–1.6 ms p95 per frame on the throttled CPU renderer. Real devices decide; the rain rate can be halved there if needed.
15. **Pause choices kept as built (wave 1):** returning to the tab doesn't resume audio by itself (one tap resumes both); mute only mutes while paused; Escape or P toggles pause (ordinary keys at the gate); the pause button resumes like any tap while paused. The bubbles fade over 1 s at the kraken rather than cut (looks right; owner may revisit).
16. **Performance is not a focus.** This is a light stack. Reviews stop measuring frame cost and flag performance only when something is clearly wrong (a leak, a visible stutter). Wave 2 has no cost budgets or throttled runs, and M7's device pass is a sanity check, not a measurement pass.
17. **The large eye stays a near-invisible secret.** Eyes fill the between-pages windows (part 0's preamble, the 1.25 s after a won round, the transitions, the ending before the kraken); large ones only from part 3, whose only window is the ending's start, under the lifting black. Kept as is.

Notes from the wave-1 fixes:
- Title's prompt and "Tap to play again" hide whenever "Tap to continue" shows (paused or audio-only), so two prompts never show at once. The pause box sits at y 405, where the hidden prompt was, clear of the logo.
- If the resume tap's audio unlock fails, "Tap to continue" stays up over the running game and its taps don't advance until audio is `running`, as in M3.
18. **Test cuts accepted to get e2e under 3 min:** the full-game test waits for the music bar only in part 0 and at bgm02 (unit tests keep the part → track mapping), and the iPhone touch game plays rounds 0–1 by touch, then jumps to the ending (desktop still plays the whole game).
