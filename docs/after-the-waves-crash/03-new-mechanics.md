# After the Waves Crash: new touch-native mechanics

The challenges here replace the literal compass-pad port from [02-mobile-alternatives.md](02-mobile-alternatives.md), so that the challenges stop feeling like "a keyboard on glass". They were proposed from the knowledge base alone. The original rules they must respect are in [01-original-game.md](01-original-game.md).

## Review notes

These notes come from the reviewer, not the agents.

- **One shared gesture.** The two design agents worked independently, but their recommendations combine into one gesture language: **drag toward the heading**, inside the control zone reserved by the layout in 02.
  - Portrait: the bottom 35–40% of the screen.
  - Landscape: both side bands.
- **Why it matters.** It answers the main open question raised by the Sequence agent, "do Hold and Many stay on the pad?": all three challenges move to the same surface. A round never mixes two input styles.
- **The compass pad stays** as the accessibility fallback, and for desktop alongside the keyboard arrows.
- **Owner decisions** are listed at the end.

## The recommended set

| Challenge | Verb | Mechanic | Gesture |
|---|---|---|---|
| Sequence ("... follow ...") | follow | **Chart the Course** | Relative drag, one notch per heading |
| Hold ("... hold strong ...") | lean | **Brace the Helm** | Drag toward the heading and stay there |
| Many ("... be fast ...") | haul | **Haul the Line** | Repeated strokes along the heading |

**Shared rules:**
- One large `hitArea` covers the control zone. There are no small targets.
- Distances are in CSS px, not playfield units, because thumbs don't scale with the square.
- Touches that start within about 24 px of a screen edge are ignored, because of the iOS and Android edge gestures.
- A pointer that went down before the challenge appeared is ignored.
- Each pointer is tracked by `pointerId`.
- Pixi v8 calls used: `globalpointermove`, `pointerup`, `pointerupoutside`.
  - A **mandatory** `pointercancel` DOM listener on `app.canvas`, because Pixi never forwards it.
  - `globalpointermove` fires for every pointer, so filter by `pointerId`.
- The zone's hit areas live in the UI layer, not in the pixel render texture.

### Chart the Course: Sequence

1. On "... follow ...", the N headings appear as the existing arrow sprites, with the cursors (`cursorP/S/E`) acting as nodes.
2. The player drags anywhere in the zone. Each time the finger travels one **notch** (about 32–40 CSS px) along the dominant axis, one heading is committed.
   - Commit when |major| ≥ notch and |minor| < 0.6·notch.
   - After each commit, re-zero the origin at the finger's position.
   - The drag is relative, like a trackpad, so ↑↑↑↑↑↑↑ never runs out of room.
   - **Drift reset:** if the minor axis reaches the limit before a commit, re-zero it. Otherwise a slow diagonal blocks every commit.
   - **One active pointer only.** A second finger is ignored, which is what keeps the mash exploit closed.
3. **Correct notch:** the next node lights, the boat drifts slightly that way, and a wake line grows behind it.
4. **Wrong notch:** progress goes back to node 0, and the vignette pulses (not lightning, to stay under the 3 flashes/s budget).
   - A wrong notch that equals heading 0 advances to step 1 instead (the KB fix from 02).
5. **Timeouts:** both replace the original 1 s keydown timeout, and both need playtesting.
   - **Stall:** finger down, no new notch for about 1 s.
   - **Lift grace:** about 1 s to put the finger back down and resume.
6. **Building unease:** in later rounds the wake line lags or sways behind the finger ("is it steering you?") and the vignette tightens. The bubbles already rise 2 → 4 → 6.
7. **The mash exploit** is impossible, because one pointer gives one axis per notch.
8. **Accessibility:** the compass pad is the fallback: tap the arrows in order. The earlier "tap a node" idea was dropped by the owner, because the nodes are out of thumb reach in portrait and "the node in a direction" isn't well-defined.

### Brace the Helm: Hold

1. Drag at least about 36 CSS px toward the heading, within ±45° of it, and stay there. A ring around the **heading arrow** on the playfield, not under the thumb, fills over 3 s.
2. **Release resets** (`pointerup`, `pointerupoutside` or `pointercancel`), as in the original.
3. Sliding back inside the threshold **pauses** the ring instead of resetting it. This is more forgiving than the original (decided by the owner).
4. The boat's tilt is pushed against the gust, and the rain slants. Both settle as the ring fills.
5. **Assist ("Latch")**, the single Hold assist (merged with 02's tap-to-start/stop): tap the matching compass-pad button, or press the matching key, once. The ring then fills on its own; tapping again cancels it. Using the pad avoids defining a "heading half" of the zone in landscape.

### Haul the Line: Many

1. Pull "rope" with repeated strokes along the heading. Only movement along the heading axis counts; return strokes count for nothing.
2. Every **D** px of rope pulled passes one knot, at about 40–48 px to start. Pass **10 knots within 3 s**, which takes about 4–6 strokes.
   - Counting by distance avoids the tiring "one swipe per press" (3.3 strokes/s) that 02 rejected.
3. The window starts at the first counted movement and resets for each challenge (the quirk-3 fix). It still resets when it expires.
4. Several fingers count.
5. **Feedback:** an `ArrowMany.anim` burst for each knot, a 10-pip meter made of cursors, and a faster boat bob.
6. **Assist ("Steady haul"):** the window doubles, to 10 knots in 6 s (decided by the owner).
7. **Window expiry:** the next window starts at the next counted movement, not immediately (decided by the owner).
8. **Fallback if playtests show fatigue or diagonal confusion: All Hands.** The heading-side half of the zone becomes one big drum target. Tap it 10× within 3 s, with several fingers allowed. It costs almost nothing, because it reuses the pad's hit areas.

## Alternatives considered

| Mechanic | For | Verdict |
|---|---|---|
| **Helm Wheel** | Sequence (could unify all three) | Ranked 2nd. Strongest steering fantasy, but slow per heading (90–180° of turn each), ghost detents between opposite headings, and rotating pixel art shimmers. It needs new wheel art. |
| **Follow the Light** | Sequence | Ranked 3rd. Best payoff for the kraken twist (the lure), but the light moves over the playfield, out of thumb reach in portrait, and the finger covers it. It turns reading into dexterity, and it's the worst for motor accessibility. Possible cosmetic reuse: a faint glow on the last node in round 3. |
| **Weather the Gust** | Hold | Rejected. It adds a skill test the original Hold never had, the finger hides the drifting mark, and it's poor for motor impairment. |
| Tilt (DeviceOrientation) | Hold | Rejected. iOS needs a permission prompt, axes must be remapped per orientation, and it fails when lying down and on desktop. |
| Shake (DeviceMotion) | Many | Rejected. Permission prompt, risk of dropping the phone, unreliable detection, and it loses the heading. |
| **Hold-to-advance whispers** | Dialogue | Rejected. It's inconsistent, and it would teach Hold before the game asks for it. Tap-to-continue stays as 02 describes it. |

## New assets needed

| Asset | Kind | Needed by |
|---|---|---|
| Wake and path lines, nodes, rings, anchor line | Drawn in code with Pixi `Graphics`, inside the pixel render texture so they stay pixelated | Chart, Brace |
| Rope/knot strip | A few pixel sprites, or drawn in code | Haul |
| Creak loop (hold) and haul tick | **Made**: synthetic chiptune placeholders in `src/assets/audio/sfx/` (`creak_loop`, `haul_tick`, as `.ogg` masters and `.m4a`), generated by `scripts/make-sfx.sh`. Not yet checked by ear. | Brace, Haul |
| Per-notch tick | Reuse `haul_tick` at a different `playbackRate` | Chart |

`creak_loop` is 1.8 s long and includes 0.1 s guard bands on each side. Play it with `loopStart = 0.1` and `loopEnd = 1.7`; the seam was checked and the samples match.

`noise.ogg` (unused in the original) might serve as a reset hiss. Nobody has listened to it yet.

## Owner decisions (resolved)

1. **The new set:** Chart, Brace and Haul are the main controls. The compass pad stays as the fallback, and for desktop.
2. **Brace pauses** when the thumb slides back inside the threshold. It doesn't reset.
3. **A second SFX channel:** yes. UI ticks play on their own channel, so they never cut off the thunder or the kraken.
4. **All Hands lets several fingers drum:** confirmed.
5. **New audio assets:** made by Claude as placeholders (see New assets needed). They're optional for a first version.

## Device tuning still to measure

- Notch size (32–40 px), Brace threshold (36 px, ±45°) and knot distance D (40–48 px), in both orientations and on small phones.
- Chart's stall timeout and lift grace.
- Whether the side bands in landscape are wide enough, about 180–220 px on 16:9 (uncertain, varies by device).
- Long-press callout and double-tap zoom suppression on iOS and Android.
