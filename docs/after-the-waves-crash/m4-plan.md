# M4 Story and presentation: plan

Milestone M4 from [04-implementation-difficulty.md](04-implementation-difficulty.md), planned after a review of what M0–M3 built.

## Review: where the port stands after M3

| Milestone | PR | Delivered |
|---|---|---|
| Knowledge base | #3 | 01–04, owner decisions |
| M0 Foundations | #4 | Asset import with a typed hashed manifest, game clock, state machine with per-state timers, `node --test` |
| M1 Display | #5 | Safe-area layout with reserved control zones, sharp-bilinear render texture snapped to device pixels, page shell, Playwright |
| M2 Playable loop | #6 | Seeded challenge rules with every quirk fix, DOM input router, dual landscape pads, real script with paging, all states, replay, resume guard |
| M3 Audio and gate | #7 | Web Audio engine (bar-aligned music, bgm02 plays out, world/UI SFX, mute), start gate, mute button, sound cues at the original's times, Tap to continue |

**Health at `9a21f8b`:**
- 551 unit tests;
- 65 browser tests passing, 10 skipped by design, about 4.5 min;
- `npm run check` green.

Every milestone went through build → review → fix rounds with dedicated agents, and every owner decision is recorded in its plan.

**What the review found worth acting on before M4:**

1. **Two files are getting large.** `scene.ts` is 641 lines and `main.ts` 445, and M4 adds most of its code to exactly these two (tweens, typewriter, lightning, ending choreography). A no-behaviour-change split first (Deliverable 0) keeps M4's diffs reviewable.
2. **The e2e suite grows with every milestone** (4.5 min now). M4 adds animation and timing checks. Keep new specs desktop-only unless they test something device-specific, and tag the long playthroughs, so a quick run (`npm run e2e:quick`) skips them.
3. **Unverified on a device:** all of the iOS audio items in m3-plan's Risks, and M1/M2's callout, safe-area and touch-order checks. The owner has no iPhone available. They're carried to M7's device matrix as an open risk, and nothing in M4 depends on them.
4. **Housekeeping:** `cl-rename-to-mini-1` (PR #1) is still on the remote. Only the owner deletes remote branches.
5. **Stopgaps that M4 removes:**
   - `TITLE_DEBOUNCE_MS` (M3 owner decision 8);
   - the instant cuts noted throughout `timings.ts`, `scene.ts` and the states ("M4 adds the tweens").

## Goal

The game looks and moves like the original:
- the story is typed;
- lightning strikes with its bolt and flash, and the logo is revealed at the flash peak;
- the sea, clouds and boat move;
- every fade from the original is back: title, backdrops, the black overlay, the kraken, the ending card;
- the ending plays its full timeline.

M4 removes the M2/M3 stopgaps listed above.

**Not in M4** (M5): rain, splash, bubbles particles, the pause overlay, soft-restart polish.

## Deliverables

### 0. Prep: split the scene and main (no behaviour change)

- **Scene:** split `scene.ts` into modules per concern: world (sea, sky, boat, backdrops, kraken), story text, challenge view, title and card, overlays (black, Tap to continue), gate view. Keep the `SceneView` interface unchanged.
- **Main:** move the cue log, the audio tick guard and the lifecycle wiring out of `main.ts` into small modules.
- **Check:** all tests unchanged and green.

### 1. Animation runtime (`src/core/anim/`, pure, unit tested)

- **Hermite evaluator:** it uses Unity's `inSlope`/`outSlope` and tangent modes (clamped auto 136, linear 34, constant 5/65), as 04 measured. About 100 lines, no tween library.
- **Clip data, generated, not hand-copied:** `scripts/import-anims.mjs` reads the 20 curve clips from the Unity checkout (YAML) and writes `src/assets/anims.ts`. Same pattern as `import-assets.sh`: rerun to regenerate, outputs committed.
  - Per clip: length, loop flag, curves per property (position x/y, rotation z, scale, alpha), and events.
  - `PillarsSwitch` stays unused. `ChangeText` is dropped (it had no visible effect, 01).
- **Playback:** a small player driven **by the game clock** (it pauses with it, never `setTimeout`):
  - `play(clip, target, { loop })` and `stop`;
  - the values are applied to display objects.
  - **Position channels snap to whole art pixels** before applying (M1 rule). Alpha and scale don't snap.
- **RectTransform conversion:** Unity's anchored positions become playfield pixels per parent chain, checked against the values M2 already placed (sea 389/399/409, boat 310, clouds 73…).

### 2. Typewriter (`src/game/story/` + story view)

- **Speeds:**
  - normal lines type at about one character per frame (the original's 0.01 s per character was capped at one per frame: 04, correction 9), via a time accumulator;
  - whispers type at 0.1 s per character.
- **Taps** (owner decision, M2 #5):
  - a tap while typing **completes the page**;
  - the next tap advances;
  - the 200 ms debounce runs from when the page is complete.
- **Pages:**
  - typing runs per page, on top of M2's paging;
  - the speaker label is typed in grey, then the speech in white, as the original;
  - a relayout mid-typing keeps the characters already shown.
- **Not ported:** the original's per-line `ChangeText` fade had no visible effect (01, quirk 9).

### 3. Lightning and flash (on M3's cue events)

- **Lightning bolt** (`raio`), on each `lightning` and `title-reveal` cue:
  - one of the **5** bolt sprites (fixes quirk 8: the original's reveal never used the 5th);
  - random mirror, random x in **playfield units** (fixes the original's screen-pixel placement), anchored top-centre;
  - the 0.67 s `Raio.anim` flicker.
  - The draws come from a **lightning RNG seeded from the game seed**, separate from the rounds and the ambient timer.
- **Full-screen white flash:** `Flash.anim`, 0.5 s, peaking at 0.25 s.
- **Logo reveal:** on `title-reveal`, the logo appears at the flash peak (`TITLE_REVEAL_FLASH_MS`).
- **Photosensitivity:** the flashing-lights warning is already on the gate. When `prefers-reduced-motion: reduce` matches, the flash peaks at about 0.4 instead of 1 (02). The strike rate is already under 3 flashes/s.

### 4. Scene motion and fades

- **Ambient loops:**
  - the three sea strips (`SeaAnim`, `SeaAnimDois`, `SeaAnimTrês`: slide and bob, and the back strip's vertical stretch);
  - the clouds (`Clouds.anim`, 10 s scroll);
  - the boat (`Barco.anim`, 2.6 s bob and ±7° tilt; slight rotation shimmer is accepted, 04).
- **Title:**
  - the intro timeline as the original: lightning at 2.0 and 3.25 s; reveal and logo at 5.25 and 5.5 s; then at 7.25 s the credits and the prompt fade in, and the prompt pulses (`TMPIdle`);
  - **Title accepts the tap only from 7.25 s**, which replaces `TITLE_DEBOUNCE_MS`;
  - the tap fades the title, credits and prompt out over 1 s (`Inicio.anim`) before Story 0 (see Owner questions).
- **Rounds:**
  - Hold and Many arrows pulse (`ArrowHold`, `ArrowMany`);
  - the backdrop fades in over the 1.25 s after a won round (`FadeIn`, as the original starts it at the win).
- **Story part 3:** the black overlay fades in as it starts (original `TelaPreta`).
- **Ending (`Fim`):**
  - 0.58 s: the broken boat is thrown up (`BarcoQuebradoJogadoCima`);
  - 1.5 s: the kraken body and tail fade in (`FadeKrakenA` and `FadeKrakenB`) with the roar;
  - 8 s: fade to black;
  - 10 s: cleared, and the black fades out to the empty sea;
  - +3.5 s: the logo and credits fade in at half speed (2 s).
- **Text:** the text box's subtle `TMPScaler` pulse (1 → 1.005), if it doesn't blur the UI text at full DPR; check by eye.

### 5. Tests

- **Unit:**
  - the Hermite evaluator against sampled values from the Unity curves (tangent modes, loops, constant steps);
  - the clip importer output, checked against the 24 clips (a snapshot);
  - the typewriter (speeds, tap completes, relayout, whispers);
  - lightning draws, seeded;
  - title gating at 7.25 s.
- **e2e, desktop only unless device-specific:**
  - a deterministic `?seed&timescale` playthrough that samples key frames (logo visible after the flash peak, prompt only from 7.25 s, typing completes on tap, backdrop alpha rising over the wait, ending phases) with screenshots;
  - `prefers-reduced-motion` caps the flash (`page.emulateMedia`);
  - pixel snapping holds while the boat bobs.
- **Suite time:** add `e2e:quick` (skips the long playthroughs).

## How the work runs

| Wave | Agents | Work |
|---|---|---|
| 0, build | **Dwarf Mason: Scene Split** | Deliverable 0 only. Behaviour unchanged, all tests green. |
| 0, review | **Goblin Scribe: Code Review** | The split is behaviour-neutral and reads well. |
| 1, build | **Elf Animator: Clip Runtime**, **Gnome Scribe: Typewriter**, **Orc Stormcaller: Lightning** | Deliverables 1, 2 and 3, in parallel on separate modules. |
| 1, review | **Troll Archivist: Clip Fidelity Review**, **Lizard Warden: Runtime Review** | The clips against the Unity YAML (sampled curves, events, RectTransform conversion); typing, lightning and reduced motion at runtime. |
| 2, build | **Human Choreographer: Scene Motion** | Deliverable 4 and the e2e. |
| 2, review | **Lizard Warden: Runtime Review**, **Goblin Scribe: Code Review**, **Halfling Eye: Visual Fidelity Review** | Runtime and timing; code; frame-by-frame comparison of timelines and screenshots against 01 and the original's clip data. |

**Estimate:** 6–8 dev-days (04), plus about 1 day for the split.

## Risks

- **Fidelity vs cost:** 20 curve clips with Unity tangents. Generating the data from the YAML (instead of copying by hand) is what makes this reviewable.
- **Pixel shimmer:** rotating pixel art (the boat's ±7°) shimmers slightly inside the nearest-sampled render texture. Accepted in 04; check by eye.
- **Timing on slow frames:** animations run on the game clock with the 100 ms cap, so a hitch slows them rather than skipping, as for the rules.
- **Photosensitivity:** the flash stays under 3/s, the gate warns, and reduced motion caps it. A flash toggle would be an M5 settings item.

## Owner decisions

1. **Title exit:** after the tap, the title, credits and prompt fade out over 1 s (`Inicio.anim`) before Story 0 starts.
2. **Reduced-motion flash cap in M4:** the flash peaks at about 0.4 when `prefers-reduced-motion: reduce` matches.
3. **Eye sprites: designed in M4, built with the bubbles in M5.**
   - The owner recalls the original notes: the eyes are **rare occurrences**, either seen only in later stages, or extremely uncommon earlier on.
   - The draft design is below; the numbers are tunable and get confirmed in M5.
4. **Readability first:** before any M4 feature work, `scene.ts` and `main.ts` (and whatever else the reviewers flag) are reviewed for readability. The aim is shorter functions broken into smaller named ones, and cleaner code overall, then the split. No behaviour change. More agents are assigned to this step (see the revised wave 0).

## Eye sprites: draft design (built in M5)

- **Assets:** `eye_large.png` (64×32) and `eye_small.png` (12×12) from `Graphics/SpritesFinal/Actors/`. M5 re-imports them with `scripts/import-assets.sh` and the manifest (centred anchors, as the other actors).
- **Where:** in the underwater band below the sea strips, where the bubbles rise (the original's `UnderSea`, around playfield y 455–490), behind the front sea strip. Never over the text box or the challenge row.
- **What:** an eye fades in (about 0.5 s), stays open for 1.5–3 s, maybe drifts a few art pixels, then fades out. It never overlaps another eye. It's an alternative to a bubble burst, not an addition: a slot that would emit bubbles occasionally shows an eye instead.
- **Rarity:** by story progress, drawn from a seeded **eye RNG**, separate from the rounds, ambient thunder and lightning streams.
  - Story parts 0–1 (before the first backdrop): *extremely uncommon*. Proposed: at most one eye per game, at a 5% chance; `eye_small` only.
  - Story part 2 and later (after the pillars): *rare*. Proposed: about 1 chance in 6 per bubble slot; `eye_large` allowed from part 3, and in the ending's empty sea before the card.
  - Never during a challenge: it would compete with the arrows for attention.
- **Debug:** `?debug&eyes=always` forces them, so they can be reviewed without waiting.
- **To confirm in M5:** the chances, durations, whether eyes blink (no art for it; alpha only), and whether they ever come back on Title after a replay.

## Revised wave 0: readability first

| Step | Agents | Work |
|---|---|---|
| 0a, review | **Centaur Sage: Scene Readability**, **Kobold Monk: Main Readability** | Read-only. Each reads its files and the states, flags long functions, mixed concerns, duplication, unclear names, machine-written-looking code and dead code, and proposes a concrete target structure (modules, function boundaries, names) that keeps `SceneView` and the other interfaces stable. |
| 0b, build | **Dwarf Mason: Scene Split**, **Elf Tidier: Main Split** | Apply the agreed proposals in parallel (scene modules; main wiring modules). No behaviour change. Unit and e2e results unchanged. |
| 0c, review | **Goblin Scribe: Code Review** | The refactor is behaviour-neutral (same tests, same e2e counts, a spot-check of screenshots), reads well, and follows `CLAUDE.md` style. |

Then waves 1–2 as planned.

## Owner request: trim the tests (after wave 2)

Once wave 2 lands and before M4 is merged, a dedicated step trims the test suite. It mainly targets the **browser (e2e) suite**, which grew to about 5.7 min across desktop, iphone-13 and pixel-7.

- **Goal:** e2e well under about 3 min, by:
  - merging overlapping specs;
  - running device-independent checks on one project only;
  - keeping only device-specific checks (touch, safe areas, the touchend unlock) on the phone projects;
  - replacing fixed real-time waits with timescale or frame-stepping where the timing isn't the point.
- **Unit tests:** also prune clearly redundant ones (duplicates, tautologies, implementation details). They are cheap, so they're secondary.
- **Safety:** a reviewer checks that every contract listed in `m4-refactor.md` (Safety net) and the guards specs keeps at least one test. The trim reports before/after counts and times.
- Agents: **Halfling Pruner: Test Trim** (build), **Gnome Warden: Coverage Review** (review).

