# M3 Audio and start gate: plan

Milestone M3 from [04-implementation-difficulty.md](04-implementation-difficulty.md), planned against the code M0–M2 built. **iOS goes first:** it's the biggest unknown, so the first build goes on a phone before the polish.

**Goal:** the game has the original's sound, started by a real start gate, and survives the mobile audio lifecycle:
- unlock on a tap;
- suspend when hidden;
- recover from interruptions;
- a mute that persists.

**Not in M3:**
- Visual lightning, flash and fades: M4. M3 plays the *sounds* at the original's times; M4 adds the visuals on the same timeline events.
- Pause overlay and reduced motion: M5.
- Gesture SFX for Brace/Haul: M6. The UI channel exists, but nothing uses it yet.

## What M0–M2 left us

| Built | Consequence for M3 |
|---|---|
| `AUDIO` manifest: 7 AAC files with a uniform 0.1 s start guard; loops carry `loopStart`/`loopEnd` (BGM01 and overlays 02/03 at 9.6 s, `creakLoop`), one-shots carry `offset`/`duration` | Playback is `start(when, offset)`. Loops set `loop`, `loopStart` and `loopEnd` and never pass a duration (manifest note). Every file shares the same offset, so tracks stay in phase. |
| Gate state: waits for sprites, font and scene, then requests Title | Gate becomes the real start gate: load progress, the flashing-lights warning, then "Tap to begin". That tap unlocks audio. |
| Input router: `advance` on `pointerup` and non-repeat keydown | The unlock runs **synchronously inside the DOM event**, not when the state drains the queue: browsers only allow `AudioContext.resume()` within the user gesture. Touch gestures count on `pointerup`/`touchend`, never `pointerdown` (02). The router gets an "on activation" hook for this one job. Game logic still runs in `update`. |
| `GameClock`, states, timings in `states/timings.ts`, frame stepper with the resume guard | Sound cues are clock events in the states, at the original's times. Music is scheduled on the **AudioContext's own clock**, not the game clock, so bar boundaries are sample-accurate. |
| `visibilitychange` → router `cancelAll` and stepper `resume` | Audio adds `ctx.suspend()` on hidden and `resume()` on visible. If the context isn't `running` afterwards, show a "Tap to continue" prompt. |
| No settings UI yet; every touch target is in `ui` and hit-tested by the router | The mute button is the first non-game touch target. Its tap must neither advance nor press, so the router hit-tests it first. |

## Deliverables

### 1. Audio engine (`src/core/audio/`; Web Audio, no dependency)

- **Context:** create the `AudioContext` early, suspended until unlocked.
  - `unlock()` must be called from inside a user gesture. It resumes the context and plays a 1-sample silent buffer for older iOS.
  - Set `navigator.audioSession.type = "playback"` where it exists (feature-detected, declared in a `.d.ts`), so the iOS silent switch doesn't mute the game. *Unverified.*
- **Loading:** `fetch` + `decodeAudioData` for every `AUDIO` entry, with progress reported to Gate. Decoded buffers are kept for the whole session; replay never reloads them.
- **Buses:** master `GainNode` (mute), then **music**, **world SFX** and **UI SFX** buses.
- **Music:**
  - BGM01 loops for the whole game from the unlock on. In the original it fades in over 1 s at Main start (`SoundManager.WakeUp`).
  - The overlay layer plays one track per story part at gain 0.9 (fade-in like the original):
    - parts 0–2: `overlayPhase02`, `overlayPhase03`, `overlayPhase04`;
    - part 3: `bgm02`, once.
  - **Changes land on BGM01's 9.6 s bar boundaries.** The next boundary is computed from `ctx.currentTime` and BGM01's start time; `start(t)` / `stop(t)` are scheduled there, with no polling.
  - **`overlayPhase04` (7.18 s) restarts on every bar**, per the M2 owner decision ("align it"). A ~2.4 s rest each bar; check by ear.
  - A new game (replay) returns to the overlay of part 0 on the next bar. Nothing is reloaded.
- **World SFX:** one voice, so a new sound cuts the previous one, as the original's single `efxSource`. Pitch 0.95–1.05 via `playbackRate`.
- **UI SFX:** its own bus, many voices allowed (M2 owner decision 3). Unused until M6.
- **Mute:** a master gain ramp to 0 or 1, persisted in `localStorage` (try/catch).
- **Lifecycle:**
  - hidden → `suspend()`; visible → `resume()`;
  - `pageshow` with `persisted` → the same as visible;
  - any state other than `running` after a resume attempt (including iOS's non-standard `interrupted`) → report "needs gesture".
  - Suspending needs no re-anchoring: `ctx.currentTime` freezes while suspended, so bar boundaries stay correct.
- **Pure parts, unit tested:** next-boundary maths, loop/offset parameters from the manifest, the overlay choice per part, the mute persistence parser, the state → "needs gesture" mapping.

### 2. Start gate (`src/game/states/gate.ts` + scene)

- **Load progress:** sprites, font and audio decode, shown as a simple bar or percentage (static, no animation).
- **Flashing-lights warning:** the original's text, "This game contains flashing lights." Kept as the original did.
- **"Tap to begin":** appears once everything has loaded. The tap unlocks audio (deliverable 1), then Gate requests Title.
  - The tap also counts as the gesture for the 1 s BGM01 fade-in.
- **Load failure:** a message and a "Tap to retry" that re-runs the failed loads. This is the M0 review's carry-over: a single failed asset showed a black screen.
- **Keyboard:** any key works as the tap, as everywhere.

### 3. Sound cues in the states (original times, on the game clock)

| When | Sound |
|---|---|
| Title: 2.0 s, 3.25 s, 5.25 s (title flash; the logo appears 0.25 s later, at the flash peak), then ambient strikes: the first 5–7 s after the intro ends at 7.25 s, then every 7–10 s, in whole seconds (`GameManager.cs`: `Random.Range(3,6)`, then `Random.Range(0,4)`, interval 10) | `thunderclap` (world) |
| Story part 0 preamble: 1.25 s | `thunderclap` |
| Each story part starts | overlay change for that part (bar-aligned) |
| Transition: 0.167 s | `thunderclap` |
| Ending: 1.5 s | `kraken` |

- The cue times live in `states/timings.ts` next to the existing ones, so M4 hangs its visuals on the same events.

### 4. Mute button (`ui`)

- A small icon button in a corner of the safe area (see Owner questions). Drawn with `Graphics`.
- Hit-tested by the router before the pads and before `advance`, and never inside a control zone (layout check).
- Its state persists across sessions.

### 5. "Tap to continue" (audio recovery)

- When the context can't resume without a gesture (iOS after a call or Siri, or a stricter autoplay policy after a hidden tab), show a minimal prompt over the game.
- The next tap resumes audio, then hides the prompt.
- The full pause overlay is M5; this is only the audio part.

### 6. Tests

- **Unit (node):** the pure audio maths and the state flow:
  - Gate: progress → warning → tap → Title; a failure → retry;
  - cue timings with a fake audio sink, with the clock and paused/replay behaviour.
- **e2e (Chromium):**
  - **Autoplay:** run with `--autoplay-policy=user-gesture-required`, so the unlock path is real.
  - **Gate:** shows progress and the warning; a tap gives a `running` context.
  - **Music:** BGM01 is scheduled; part changes are bar-aligned (read through `window.debug`: the scheduled start times are multiples of 9.6 s from the anchor).
  - **Mute:** persists across a reload, and its tap doesn't advance the story.
  - **Hidden tab:** suspends and resumes; a forced `suspended` state after a resume shows "Tap to continue".
  - **Replay:** no growth in decoded buffers or nodes.
- **Device (owner, iOS first):**
  - unlock on the first tap;
  - the silent switch;
  - a phone call or Siri mid-game;
  - hidden tab and return;
  - loop seams (BGM01, overlays) and the `overlayPhase04` rest by ear;
  - AAC start offset on Safari.

## How the work runs

| Wave | Agents | Work |
|---|---|---|
| 1, build | **Dwarf Bard: Audio Engine**, **Elf Herald: Start Gate** | Deliverable 1, and deliverables 2 + 4 (the mute button view and the router's activation and mute hit-test). The engine exposes a small interface the gate codes against. |
| 1, review | **Orc Listener: Audio Review**, **Gnome Warden: Gate Review** | Scheduling maths and seams (rendering offline with `OfflineAudioContext` where possible); the gesture and lifecycle paths; gate flow and failure handling. |
| 2, build | **Human Conductor: Sound Cues** | Deliverables 3 and 5, the e2e tests, the wiring in `main.ts`. |
| 2, review | **Lizard Warden: Runtime Review**, **Goblin Scribe: Code Review** | Runtime in Chromium with the gesture-required policy, replays and lifecycle; code against the plan. |
| — | **Owner** | First iOS device check right after wave 1, before wave 2's polish. |

**Estimate:** 3–4 dev-days for the build (04), plus device iteration on iOS.

## Risks

- **iOS:** AAC padding trim, the silent switch, `interrupted` recovery and the gesture rules can only be confirmed on a phone. The guard bands make the loop math independent of padding trim.
- **Bar alignment vs game timing:** music changes wait up to 9.6 s for the next bar, as in the original, so a part's music can start a few seconds after its text. That's faithful, but noticeable on fast tapping.
- **Mute button vs game input:** a tap near the corner must never also advance or press. The router's ordering and an e2e test cover it.

## Owner decisions

1. **Mute button:** top-right corner of the safe area.
2. **Loading:** decode all audio (about 0.8 MB) before "Tap to begin".
3. **Flashing-lights warning:** kept on the start gate, shown while loading and with "Tap to begin". There's no forced wait.
4. **Pad grey:** the pad's outlines and arrows change from #464646 to #767676, matching the text.

## Notes from wave 1

- **Autoplay tests:** headless Chromium ignores `--autoplay-policy=user-gesture-required`; the context starts `running`. So e2e can't reach "locked" or "needs-gesture" through the policy. It forces them instead, by stubbing `AudioContext.prototype.resume` and `state` in `addInitScript`.
- **Gate:** it calls `startMusic()` right after `unlock()`, in the same gesture handler, once `load` has succeeded. Before BGM01 is decoded, `startMusic()` does nothing.
- **"Tap to continue":** after `suspend()` the engine reports `needs-gesture` even while the tab is hidden. Show the prompt only when `resume()` returns false on becoming visible. Don't block on `resume()`: on some iOS versions it may never settle outside a gesture.

## Owner decisions after the wave-1 reviews

5. **bgm02 is never cut:** on replay, the next part's overlay starts on the first bar at or after bgm02's natural end, as the original let a non-looping clip finish.
6. **"Tap to begin" on both the gate and Title,** for now. In M4, Title only shows and accepts its prompt after its intro (about 7.25 s, as the original), so the two prompts never feel doubled.
7. **Music bus at 0.8** (about −2 dB): BGM01 plus an overlay reached 1.2× full scale and clipped. The original summed the same levels.
8. **Title ignores taps for its first 0.5 s**, so a double tap on the gate can't skip it. A stopgap that M4 replaces by gating Title's prompt behind its 7.25 s intro.

