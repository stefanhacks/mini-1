# After the Waves Crash: how the original game works

Source: [stefanhacks/After-the-Waves-Crash](https://github.com/stefanhacks/After-the-Waves-Crash) at `7ded87d`, Unity 2018.2.11f1. It was a 2018 Halloween jam game by Stefan and Gabriel Nied, published on itch.io (probably as a 500×500 WebGL embed; inferred).

This file documents the **original desktop/keyboard behaviour only**. Mobile adaptation lives in the other files in this folder. Paths are relative to the Unity project's `Assets/`. Items marked *(uncertain)* were inferred from the serialized files, not from running the game.

## Summary

The game is a short, linear story about a ship lost in a storm. A mysterious voice gives the crew "headings", and the player follows them by entering arrow-key challenges. There are 4 story parts and 3 gameplay rounds between them. The ending reveals that the voice was a kraken leading the ship to it.

- There is no fail state, score, restart or quit.
- A mistake only resets progress on the current challenge.
- Playtime is a few minutes.

## Flow

1. **Load scene** (`Scenes/Load.unity`, `PreloadManager.cs`).
   - Shows "This game contains flashing lights." for 5 s, fades it out, waits 1.5 s, then loads `Main` asynchronously. There is no input.
   - `SoundManager` is created here as a `DontDestroyOnLoad` singleton.
2. **Title** (`GameState.Inicio`). This part is timer driven and ignores input until the prompt appears.
   - Lightning strikes at about 2.0 s and 3.25 s.
   - A big strike at about 5.25 s reveals the logo at the flash peak (`Flash.anim` event, then `MessageCaster`, then `GameManager.DoWhileFlash`).
   - At about 7.25 s the credits and a pulsing "Press Any Key" fade in. After that, ambient lightning strikes every 6–10 s.
   - **Any key** (`Input.anyKeyDown`, which also counts mouse buttons) fades the title out, and after 1 s the state becomes `Historia`.
3. **Story part N** (`Historia`).
   - On the first part only, there is a preamble: a 1.25 s pause, a thunder strike, then another 1.25 s pause.
   - A text box types "[Speaker]: sentence" at 0.01 s per character. "Special" lines are the voice's whispers: centred, 0.1 s per character.
   - **Any key** advances, but only after typing has finished. There is no skip.
4. **Transition** (`Transicao`).
   - Driven by animation events in `Troca.anim`: a thunder strike at 0.167 s, then gameplay starts at 0.5 s.
5. **Gameplay round** (`GamePlay`, `KeyManager.cs`). See the next section.
   - After the round, there is a 1.25 s pause while a background layer fades in: pillars after round 1, tentacles after round 2.
   - Underwater bubble intensity rises to 2, 4, then 6.
   - The game then moves on to story part N+1.
6. **Ending** (after story part 3, which has no gameplay).
   - The ship becomes the broken ship and `Fim.anim` plays:
     - 0.58 s: the ship is thrown up.
     - 1.5 s: kraken sound and the kraken fades in.
     - 8 s: fade to black.
     - 10 s: the scene is cleared and the empty sea fades back in.
   - After 3.5 s more, the logo and credits fade in at half speed.
   - `GameOver` is terminal. There is no handler, restart or quit.

## Core mechanic: arrow-key "cheats"

`KeyManager.PopulateCheats` builds all rounds once at scene start:

| Round | Challenges | Sequence length | Special challenges (random index) |
|---|---|---|---|
| 1 | 3 | 3 | 1 Hold |
| 2 | 5 | 5 | 1 Many |
| 3 | 7 | 7 | 1 Hold and 1 Many (distinct indices) |

Every key is a uniformly random arrow (↑ ↓ ← →). Difficulty comes only from longer sequences and more challenges; the timings never change.

There are three challenge types. The on-screen prompt for each is shown in `ArrowText`.

| Type | Prompt | Rule | Reset |
|---|---|---|---|
| **Sequence** | "... follow ..." | Press the N shown arrows in order (`GetKeyDown`). | A wrong key resets to the start. So does 1 s without a keydown (`sequenceDelay`: scene value 1, code default 2). |
| **Hold** | "... hold strong ..." | Hold one arrow for 3 s (`GetKey`, `holdExpectedTime`). | Releasing the key resets the timer. Other keys are ignored. |
| **Many** | "... be fast ..." | Press one arrow 10 times within a fixed 3 s window (`manyExpectedPresses`, `manyExpectedTime`). | When the window expires, the count resets. Wrong keys are ignored. |

Visuals:
- **Arrows:** each challenge spawns one 24×24 arrow sprite per key, spaced 0.2 world units apart, with a cursor under each one.
- **Cursors:** they mark done, current and pending keys (`cursorP`, `cursorS`, `cursorE`).
- **Special challenges:** Hold arrows play an inward pulse (`ArrowHold.anim`). Many arrows play an outward burst (`ArrowMany.anim`).

Once a challenge is complete, its arrows are destroyed and the next challenge spawns. Completing the last challenge of a round sets `gamePlaySucess`, which `GameManager` polls.

## Story script

The text lives in `Prefabs/TextManager.prefab`; part 2 is overridden in `Scenes/Main.unity`. *Italics* mark the voice's special lines.

- **Part 0:**
  - First Mate: "Captain! This wind is too strong! We're gonna lose the sails!"
  - Captain: "Men! Get a grip on yourselves!"
  - Captain: "We need to find our way out of this storm or we're dead!"
  - *"... follow ..."*
  - Captain: "...?"
  - First Mate: "... the he-?! Cap'n, do you hear this voice!?"
  - Captain: "Shush sailor! Let me think!"
  - *"... follow ..."*
- **Part 1:**
  - First Mate: "Sir, these headings make no sense!"
  - Captain: "But they are working!"
  - Captain: "If we keep this up, we might outrun the storm!"
  - *"... faster ..."*
- **Part 2:**
  - First Mate: "Look! In the distance!"
  - First Mate: "Oh lord - what IS that thing!?"
  - Captain: "...!"
  - First Mate: "Sir, please! We need to go!"
- **Part 3:**
  - Captain: "How..."
  - Captain: "The winds've completely stopped. We're adrift!"
  - First Mate: "...!"
  - Captain: "...!"
  - First Mate: "Sir I... I don't think that voice was speaking with-"
  - *"... eat ..."*

Other text:
- Title screen: "Press Any Key" and "©the Stefan & Nied".
- Font: Josefin Slab (TMP SDF).

## Presentation

### Canvas and scene

- **Canvas:** 500×500 logical canvas. It is Screen Space – Camera with Scale With Screen Size, reference 500×500, matched to **width**.
  - At 16:9 only about 281 units of height are visible, so the sky, clouds and credits get cropped.
  - The art is authored for a square canvas.
- **Rendering:** almost all visuals are `SpriteRenderer`s and particles parented under the canvas, all on one sorting layer, ordered by `sortingOrder`.
  - Pixel art: PPU 1, Point filtering, Gamma colour space, no anti-aliasing.
- **Scene layers, back to front:**
  - Tentacles and pillars backgrounds (hidden at first).
  - Back, mid and front sea strips, 500×180 each, with looping parallax slide and bob animations.
  - Sky with a 10 s cloud scroll.
  - Rain particles at 220/s, with splash sub-emitters.
  - Boat: 32×32, with a 2.6 s bob and tilt loop.
  - Underwater bubbles.
  - Lightning bolt (5 sprites), white flash, black overlay (`TelaPreta`) and vignette.
  - Ending only: the broken boat and the kraken (body and tail).

### UI

- **Story:** text box (438×110) with the typed text, plus a "continue" cursor shown when typing ends. That cursor is a non-clickable `Button` (*uncertain*).
- **Title:** logo (330×64), a pulsing "Press Any Key", and the credits.

### Lightning

`DoTheThunder` picks a random sprite, mirrors it at random, and places it at a random x with a flash and a thunderclap SFX. Its position is written in raw `Screen.width/height` pixels into canvas units, so placement depends on the resolution.

### Audio

All audio is mono OGG made in Pixitracker.

- **`BGM01.ogg`** (9.6 s): base loop. It fades in when Main starts and loops for the whole game.
- **Overlay layer:** one track per story part, faded to 0.9 volume.
  - Parts 0–2: `OverlayPhase02/03/04.ogg`, looped.
  - Part 3: `BGM02.ogg`, played once.
  - Tracks only change on clip boundaries: the current loop is allowed to finish first.
- **SFX:** `thunderclap.ogg` and `kraken.ogg`, on a single channel with random pitch 0.95–1.05. A new SFX cuts off the previous one.
- **Unused:** `noise.ogg`.
- **No controls:** no mixer, volume setting or mute.

## Desktop and keyboard dependencies

These are the things a mobile port has to replace:

1. **Arrow keys** are the only gameplay input.
   - Hold needs a sustained press of one specific key.
   - Many needs fast repeated taps of one specific key.
   - Sequence needs discrete directional presses.
2. **"Press any key"** wording, and any-key progression on the title and in the dialogue.
3. **The square 500×500 layout**, which assumes a landscape or square window that is width-matched and crops vertically.
4. **Screen-pixel lightning placement**, and arrow spacing in world units.
5. **No pause, quit, restart or settings.** These are acceptable for a jam desktop build, but not for a mobile tab that can be backgrounded.
6. **Audio starts with no user gesture.** Browsers block that on mobile (and on desktop).

## Known quirks and bugs in the original

1. **Mashing all four arrows at once always advances a Sequence**: there is no check that only the expected key was pressed.
2. **A wrong key resets the Sequence to 0**, even when that key matches the first step, and it does not reset the 1 s timeout.
3. **The Many window starts when the challenge appears**, not at the first press, and `manyTimer` is never reset between challenges. The first window can therefore be shorter than 3 s.
4. **Cursor visuals lag input by one frame**: they update before input is read.
5. **`PlayOverlay` is called every frame** during the first story preamble.
6. **A duplicate `SoundManager` may be found before it is destroyed** (*uncertain*).
7. **`using UnityEditor;` in `GameManager.cs`** normally breaks player builds (*uncertain* how the original build handled it).
8. **The title lightning never uses sprite 5**: it uses `Random.Range(0,4)` while there are 5 sprites.
9. **The per-line text fade (`ChangeText.anim`) probably has no visible effect**: it animates an object without a TMP component (*uncertain*).
10. **Unused assets and code:**
    - `eye_large.png`, `eye_small.png`, `PillarsSwitch.anim`, `Fundo.prefab`, `noise.ogg`.
    - `firstTimeDelay`, `SoundManager.PlaySingle`, and a stale `gameAudio` field in `Load.unity`.
11. **Identifiers are in Portuguese**: `setas` (arrows), `raio` (lightning), `barco` (boat), `telaPreta` (black screen), `parteHistoria` (story part).

## Tunable values

| Value | Effective | Where |
|---|---|---|
| Sequence timeout | 1 s | KeyManager, `Main.unity` override |
| Hold duration | 3 s | KeyManager |
| Many: presses / window | 10 / 3 s | KeyManager |
| Round sizes | 3 / 5 / 7 | `PopulateCheats`, hardcoded |
| Typing speed (normal / special) | 0.01 / 0.1 s per char | TextManager prefab |
| Title timings: warm-up / thunder interval / reveal / prompt | 0.75 / 1.25 / +2 / +2 s | GameManager |
| Ambient thunder | every 6–10 s (title only) | GameManager |
| After-round delay | 1.25 s | GameManager |
| End delay before title card | 3.5 s | GameManager, `Main.unity` override |
| Load screen | 5 s + 1.5 s | `Load.unity` |
| Bubble rate | 2 / 4 / 6, then 1 at end | `GameManager.SetBubbles` |
