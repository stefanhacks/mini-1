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

- **Source of truth:** Main.unity holds 3 `ParticleSystem`s (rain, its splash sub-emitter, the bubbles). A spec agent extracts every used module first: rate, lifetime, start speed and size, shape, gravity, colour over lifetime, sub-emitter trigger, `maxParticles`, simulation space. Only values the YAML gives are taken as is; the canvas-scale-dependent ones are tuned by eye (04, point 12).
- **Rain:** 220/s, pooled on a v8 `ParticleContainer` inside the render texture (so its cost doesn't grow with the screen). A drop dies at the sea line and spawns a splash. No physics.
- **Bubbles:** in the underwater band, at the original's intensity 2, 4, 6 after each round, and 1 at the end (`GameManager.SetBubbles`).
- **Determinism:** salted seeded streams; the particle step runs inside the game-logic guard, on the clock.
- **Budget:** at most +1 ms CPU per frame on the 4× throttled iPhone-13 profile used in the M4 runtime review. Halve the rain rate only if a low-end device needs it (02).

### 2. Eye sprites (the M4 draft design)

- Re-import `eye_large.png` and `eye_small.png` with `scripts/import-assets.sh` and the manifest.
- An eye replaces a bubble burst, never adds to one. It fades in (about 0.5 s), stays 1.5–3 s, may drift a few art pixels, then fades out. It never overlaps another eye.
- **Rarity, from a seeded eye stream:**
  - parts 0–1: at most one per game, 5%, `eye_small` only;
  - part 2 on: about 1 in 6 per bubble slot;
  - `eye_large` from part 3, and in the ending's empty sea before the card.
- `?debug&eyes=always` forces them for review.
- The numbers are drafts for the owner to confirm (questions below).

### 3. Screen-tone flash (owner request: can the page flash with the thunder?)

**Short answer:** flashing the page's CSS as it stands would show nothing. The canvas fills the whole viewport (`#game` is `position: fixed; inset: 0`) and Pixi clears it to opaque black, so the body's background is never visible. The flash already covers the playfield square; what's missing is the **letterbox** around it, which on a phone is more than half the screen (an iPhone 13 in portrait: a 390 px square on an 844 px tall screen).

| Option | How | Cost and risk | Verdict |
|---|---|---|---|
| **A. Pixi screen layer** | A full-canvas rect on the stage, behind the playfield sprite (outside the render texture), whose alpha follows the same `Flash.anim` value each frame. | One extra quad per frame, nothing when hidden. Same frame as the in-playfield flash, same clock (pauses with it), same reduced-motion cap. Testable with the existing pixel reads. About 0.5 day. | **Recommended.** |
| B. CSS body background | Make the canvas transparent (`backgroundAlpha: 0`) and animate `body` `background-color` from JS. | Changes how the canvas composites on every frame, all game long, for an effect that lasts 0.5 s. A style change per frame during the flash. DOM timing can drift a frame from the canvas. | Possible, not advisable. |
| C. CSS overlay `<div>` | A fixed, `pointer-events: none` div over or under the canvas, with JS-driven `opacity`. | Opacity is compositor-cheap, but above the canvas it would also wash out the UI text and the mute button; under it, it needs B's transparent canvas. | Only if A fails. |
| D. Browser chrome tint | Change `<meta name="theme-color">` with the flash, tinting the address bar where the browser supports it. | Support and update smoothness vary by browser and version, and I haven't verified it. Discrete colour steps, not an alpha curve. | Optional extra, after a spike on real devices. |

- **Tone, not only white:** with A, the screen layer can take its own colour and peak (for example a cold blue-white, or a lower peak than the playfield flash) so the letterbox "tints" rather than whites out. This is an owner choice after seeing it (question below).
- **Photosensitivity:** the strike rate stays at most 1 flash/s, under WCAG 2.3.1's 3/s, so a larger area doesn't break the threshold. But a full-screen flash is stronger for sensitive viewers. So the screen layer **follows the reduced-motion cap** and the optional "reduce flashes" setting (Deliverable 4), and the gate's warning stays.
- **Where:** the real playfield flash stays as it is; the screen layer only adds the letterbox. The vignette stays inside the playfield.

### 4. Reduced motion everywhere

One rule per effect, decided once in a table in `src/game/motion.ts` (or the existing lightning module's cap), read live so switching mid-game works, as the flash cap does:

| Effect | Under `prefers-reduced-motion: reduce` (proposal) |
|---|---|
| Lightning flash, screen tone | Peak capped (0.4 today) |
| Sea strips, clouds, boat bob | Slower amplitude or stilled? (question) |
| Prompt and arrow pulses | Held at full alpha, no scale pulse |
| Thrown boat, kraken rise | Kept (they're story beats), or cut to the end pose |
| Rain | Lower rate, no slant change |
| Bubbles, eyes | Kept, they're slow |

- Optional **"reduce flashes" toggle** next to mute (02), persisted like mute. It applies the flash cap without the OS setting.

### 5. Pause and resume

- **Pause** on `visibilitychange` (hidden) and `pagehide`; the clock stops, which freezes clips, particles and timers.
- **On return:** a pause overlay with "Tap to continue" (merged with the audio prompt: one tap resumes audio and the game). During a round, the current challenge's progress resets (02).
- **Soft restart:** replay already keeps textures, buffers and the audio context. M5 makes sure the new particle and eye pools and their streams reset too, and leak tests cover them.
- An in-game pause button is not in the original; whether to add one is an owner question.

### 6. Housekeeping

- Prune the null keys from Pixi's `canvasText._activeTextures` on Title. It's a private field, so the code guards for its absence and a unit or e2e test pins the Pixi version's behaviour.

### 7. Tests

- **Unit:** particle stepping (spawn rate, lifetime, sea-line kill, splash spawn), the eye rarity schedule per story part, the reduced-motion table, pause and resume on the clock.
- **e2e (inside the M4 budget: the suite stays under 3 min):** desktop, frame-locked like `motion.spec`; rain and bubbles present and pooled (no growth over 3 replays); the screen layer peaks with the flash and stays capped under reduced motion; pause overlay on hidden, resume on tap.
- **Owner on Android:** rain cost on a mid-range phone, the screen tone by eye, pause from the app switcher.

## How the work runs

| Wave | Agents | Work |
|---|---|---|
| 0, spike (read-only and scratch, in parallel) | **Dwarf Surveyor: Particles Unity-spec**, **Elf Seer: Flash Screen-tone** | The particle spec from Main.unity. A scratch prototype of options A, B and C (and D's support where it can be checked), measured on the throttled profile, with screenshots for the owner. |
| — | **Owner** | Picks the screen-tone option and colour, confirms the eye numbers and the reduced-motion table. |
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

## Owner questions

1. **Screen tone:** go with option A (Pixi layer) after the spike, and should it be white like the playfield flash, or a tint (colour and peak picked from the spike's screenshots)?
2. **Eyes:** keep the draft numbers (5% once in parts 0–1, 1 in 6 later, large from part 3)? Do they blink (alpha only, no art), and can they appear on Title after a replay?
3. **Reduced motion:** for the sea, clouds and boat, slow them down or still them?
4. **Pause button:** add an in-game pause button next to mute, or pause only when the page is hidden?
5. **"Reduce flashes" toggle:** add it next to mute in M5?
