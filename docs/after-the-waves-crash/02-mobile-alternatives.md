# After the Waves Crash: mobile web alternatives

How to bring the original game (see [01-original-game.md](01-original-game.md)) to **mobile browsers, touch first**, built with TypeScript and Pixi.js v8 in this repo. Desktop keyboard play stays as a free fallback.

The rest of this file is a recommendation per topic, with the reason. Lines marked *(uncertain)* must be checked on real devices.

## Review notes

These notes come from the reviewer, not the agents.

- **Tap while dialogue is typing.**
  - The Touch-alternatives agent suggested keeping the original "no skip" rule, as an option.
  - The Platform agent recommended "tap completes the line, next tap advances".
  - **Decision: tap completes the line.** This is the touch convention, and the original rule only matters for the 0.1 s/char whispers. It changes the original behaviour, so the owner should confirm it.
- **Audio format.** Keep the OGG masters in the source tree and ship AAC (`.m4a`) for playback. Whether iOS Safari decodes Ogg Vorbis through Web Audio across the versions in use is uncertain, and AAC is supported everywhere.
- **No new dependency is required** by any recommendation below. `@pixi/sound` was considered and rejected in favour of plain Web Audio.

## What carries over with cosmetic changes only

| Original | Mobile |
|---|---|
| "Press any key" on the title and in dialogue | Tap anywhere. The original already accepted mouse clicks through `anyKeyDown`. |
| Story, typewriter, story order, ending | Unchanged, apart from text size and the tap-to-complete rule. |
| Rules and tuning of the 3 challenge types (1 s, 3 s, 10 presses / 3 s, rounds of 3/5/7) | Unchanged. Only the input device changes. Playtest the 1 s Sequence timeout on touch. |
| No fail state | Kept. |

## Gameplay input

### One shared control: the compass pad

Use one on-screen cross of 4 buttons (↑ ↓ ← →) for all three challenge types. It keeps the fantasy intact: "the voice gives a heading, you press that heading".

- **Size:** each button at least 48–56 CSS px, with a `hitArea` larger than its art. The whole cross is about 170–200 px wide, so either thumb can reach it.
- **Placement:** bottom of the screen in portrait, side bands in landscape (see Layout). Keep it inside the safe-area insets and away from the screen edges, because the iOS edge swipe-back cannot be blocked.
- **Input model:** react to each `pointerdown` event (Pixi v8, `eventMode = 'static'`) instead of polling every frame as Unity did. This removes the "mash all arrows" exploit with no extra code, and updates the cursor visuals in the same event.
- **Pad state:** the pad becomes interactive only when `GamePlay` starts. Any pointer that went down before the current state began is ignored, so the tap that closes the dialogue can't count as the first Sequence input.

| Challenge | Mobile rule | Alternatives considered and rejected |
|---|---|---|
| **Sequence** ("... follow ...") | Tap the shown directions in order. A wrong tap resets; so does 1 s without a tap. As in the original, a wrong tap does not restart the 1 s timer (decided by the owner). | Swipes anywhere: diagonals are ambiguous, and they clash with back gestures. Screen-quadrant taps: too easy to trigger by accident. |
| **Hold** ("... hold strong ...") | Press and hold the matching pad button for 3 s, while a radial ring fills. The pointer is tracked by `pointerId`; sliding off the button is tolerated. Progress ends only on `pointerup`, `pointerupoutside` or `pointercancel`. | Hold anywhere: loses the heading. Swipe-and-hold: gesture conflicts and complex to recognise. |
| **Many** ("... be fast ...") | Tap the matching button 10× within 3 s, with a pip meter. | Tap anywhere: loses the heading. Swipe "rowing" or shaking: tiring, and shaking needs an iOS motion permission. |

`pointercancel`: Pixi 8.20.1 does **not** forward it to display objects (see 04, correction 1). A DOM listener on `app.canvas` is **mandatory**. Also release every tracked pointer on `blur` and `visibilitychange`. The keyboard fallback ignores `KeyboardEvent.repeat`.

**Accessibility mode:** Hold becomes tap-to-start / tap-to-stop. This is merged with 03's Latch into one assist (decided by the owner).

**Haptics:** `navigator.vibrate` works on Android Chrome but not on iOS Safari. Treat it as a progressive enhancement only.

### Quirks: fix or keep

| Original quirk | Decision |
|---|---|
| Mashing all arrows advances a Sequence | **Fix.** It disappears with event-driven input. |
| A wrong key that equals step 0 resets to 0 | **Fix:** it advances to step 1. Mis-taps are more common on touch. |
| The Many window starts at spawn and its timer leaks between challenges | **Fix:** the window starts at the first correct tap and resets for each challenge. |
| Cursor visuals lag input by one frame | **Fix**, for free. |
| A wrong press resets the Sequence to 0 | **Keep.** It is the game's only tension. |

### Progression taps

- **Where the tap counts:** anywhere, except the mute button.
- **When it counts:** advance on `pointerup`.
- **Wording:** "Tap to begin" and "Tap to continue".
- **Original rules kept:** input is ignored until the title prompt has appeared.
- **New debounce:** taps are ignored for about 200 ms after a line appears, so a double tap can't skip a line unread.

## Layout and scaling

- **Orientation:** support **both** orientations with one rule. iPhone Safari can't lock orientation, so a "rotate your phone" screen would only add friction.
  - **Control space is reserved first:** a bottom zone in portrait, two side bands in landscape. The 500×500 playfield takes the rest of the safe area, with all leftover space going back to the controls. (Revised in [m1-plan.md](m1-plan.md).)
  - **Text box:** it stays **inside the square**, at the bottom as in the original, in both orientations. Story text and controls are never on screen at the same time. Under-square placement didn't fit 16:9 phones.
  - Its art goes through the render texture. Its text is drawn in the UI layer over it.
- **Background:** fill everything outside the square with black. The original art already fades to black at every edge (vignette, sea bottom, cloud top), so there are no visible seams. Do not extend the art.
- **Scaling: "sharp-bilinear".**
  1. Render the stage, whose art textures use `scaleMode: "nearest"`, at scale k into a 500·k `RenderTexture`. k is the largest integer that fits the device pixels.
  2. Draw that texture once, scaled to fit. The render texture's own source must use `"linear"` filtering.
  - Touch targets can't live inside the render texture, because it is not hit-tested. All touch targets go in the UI layer.
  - This avoids both shimmering pixels and wasted screen space. Pure integer scaling uses only about 67% of a 375 px phone.
  - Snap the displayed square's position and size to whole **device** pixels, not CSS pixels: at DPR 2.625 a whole CSS pixel isn't a whole device pixel.
- **Device pixel ratio:** use the real DPR for the output canvas, capped at 3 (low-end Android reports 3.5–4). The template caps it at 2, which looks soft on DPR-3 iPhones. The render texture already bounds the art cost.
- **Safe areas:** add `viewport-fit=cover` to the viewport meta. Read the `env(safe-area-inset-*)` values through CSS variables on a hidden element.
- **Resize and orientation changes:** point Pixi's `resizeTo` at a `position: fixed; inset: 0` container.
  - As built in M1: the game sizes the renderer itself (not Pixi's `resizeTo`).
    - It resizes on window `resize`, `visualViewport` `resize`, a `ResizeObserver` and DPR changes, coalesced to one resize per frame.
    - The size is floored to whole device pixels.
- **Page gesture protection:**
  - `touch-action: none` on the canvas.
  - `overscroll-behavior: none` on `html` and `body`.
  - `user-select: none` and `-webkit-touch-callout: none`.
  - `preventDefault` on `contextmenu`.
  - These matter most for Hold: without them, a long press opens the iOS callout or the Android context menu.

## Text

- **Render text outside the pixel render texture:** draw it in a UI layer with Pixi `Text` at full DPR, using the Josefin Slab TTF.
- **Sizes:** story text at least 16–17 CSS px, credits at least 12 CSS px. The original sizes would come out at 8–14 px on a 360 px phone.
- **Font loading:** wait for `document.fonts.load` before creating text, so the fallback font doesn't get baked in.
- **Typing speeds:**
  - Normal lines: about one character per frame (~60 chars/s). The original's 0.01 s/char was capped by one `WaitForSeconds` per character.
  - Whispers: 0.1 s/char. The whisper pacing is the mood.
  - Use a time accumulator, and pre-wrap lines.
- **Text box:** `text_box.png` goes in the playfield (`top` layer), so it is scaled by the render texture like all other art. Its smallest integer scale, 438 px, is already wider than a 375 px phone. The text is placed over it in the UI layer. The continue cursor is an indicator only.

## Audio

- **Plain Web Audio:** decode everything into `AudioBuffer`s. `BGM01` loops for the whole game.
- **Unlock** with `ctx.resume()` on the first tap's `pointerup`, with a `touchend` fallback. On touch, `pointerdown` doesn't count as a user gesture.
- **Overlay switching:** schedule each change at the current clip's next loop boundary (`start(t)` / `stop(t)` with a gain ramp to 0.9) instead of polling. This also removes the "PlayOverlay every frame" quirk.
  - **Align it (decided by the owner).** `OverlayPhase04` is 7.176 s, not 9.6 s. Restart it on every 9.6 s `BGM01` boundary, so it rests for about 2.4 s each bar instead of drifting. Check this by ear: if the rest sounds wrong, the alternative is to loop it inside the bar.
- **SFX:** two channels (decided by the owner).
  - The **world** channel keeps the original behaviour for thunder and the kraken: a new SFX stops the previous one. Pitch 0.95–1.05 maps to `playbackRate`.
  - A separate **UI** channel plays the gesture ticks and the creak loop.
- **Mute button:** in a safe-area corner. It drives a master `GainNode`, and its state is stored in `localStorage` (wrapped in try/catch).
- **Background tab:** `visibilitychange` hidden → `ctx.suspend()`. On return, show the "Tap to continue" overlay.
  - Treat any state other than `running` as "needs a tap". This includes iOS's non-standard `interrupted` state.
- **Risks:**
  - **AAC loop padding:** set `loopStart`/`loopEnd` from the known clip lengths.
  - **iOS silent switch:** it may mute Web Audio. `navigator.audioSession.type = 'playback'` might help *(uncertain; feature-detect it)*.

## Lifecycle

- **Start gate:** this replaces the original 5 s load screen. It covers asset loading, the flashing-lights warning, and "Tap to begin". That tap also unlocks audio.
- **Game clock:** every timer runs on Pixi ticker `deltaMS`. No `setTimeout`. Stopping the ticker freezes the whole game. The Ticker already caps a frame at 100 ms.
- **bfcache:** treat `pageshow` with `persisted` like returning from a hidden tab.
- **Pause and resume:**
  - Pause on `visibilitychange` and `pagehide`.
  - When the page returns, show "Tap to continue" instead of resuming automatically.
  - During gameplay, progress on the current challenge resets.
- **Replay:** "Tap to play again" after the ending soft-resets to the title, keeping the decoded assets and the unlocked audio context. Don't reload the page.
- **Fullscreen:** iPhone Safari has no element Fullscreen API, so don't rely on it. A "Fullscreen" button shown only when supported (Android) is optional.

## Effects and performance

- **Keep every effect.** The fixed-size render texture bounds the cost, whatever the screen size.
- **Rain:** v8 `ParticleContainer` / `Particle`, pooled, at 220/s. Halve the rate automatically only if a low-end test needs it.
- **Ticker:** don't set `maxFPS = 60`. Pixi truncates the frame delta, which can give about 40 fps on 120 Hz screens (04, correction 3). Use `maxFPS` ≥ 63, or limit frames by hand. All motion is time-based.
- **Flashes:**
  - Keep the warning.
  - The strike rate is already under the WCAG 2.3.1 threshold of 3 flashes/s.
  - When `prefers-reduced-motion: reduce` matches, cap the flash's peak alpha at about 0.35–0.5.
  - An optional "reduce flashes" toggle can sit next to mute.
- **Lightning placement:** compute it in playfield units, not screen pixels. Use all 5 bolt sprites; this fixes quirk 8.

## Dropped from the port

- **Unity-only issues:** the duplicate `SoundManager`, `using UnityEditor;`, and the non-working `ChangeText` fade.
- **The 5 s untappable load screen.**
- **Unused assets:** `noise.ogg`, `eye_*.png`, `PillarsSwitch.anim`, `Fundo.prefab`.

## Open device checks

1. iOS Ogg decoding. Until it's confirmed, ship AAC.
2. Audio unlock on iOS: `pointerup` vs `touchend`.
3. iOS silent switch and `navigator.audioSession`.
4. Recovery from the `interrupted` audio state on iOS.
5. Event timing during rotation and URL-bar resizes.
6. Pixi `maxFPS` behaviour on 120 Hz screens.
7. Whether 1 s is comfortable as the Sequence timeout on touch.
8. Real tap rates for Many.
9. Long-press callout suppression on iOS Safari and Android Chrome.
