# M5 particles: Unity spec and port conversion

Written by Claude Code (Dwarf Surveyor: Particles Unity-spec), read-only survey for M5 Deliverables 1–2.

Sources. `U` = `/home/user/stefanhacks/after-the-waves-crash/Assets/Scenes/Main.unity` (Unity 2018.2.11f1, `ProjectSettings/ProjectVersion.txt`). `GM` = `Assets/Scripts/GameManager.cs`. Line numbers are 1-based. The modules were dumped with the port's own parser (`scripts/unity-yaml.mjs`) through a scratch script (not committed). Every module not listed under a system is `enabled: 0`.

Unity enum values used below: `minMaxState` 0 constant, 1 curve, 2 two constants, 3 two curves. In two-curves mode, **both** curves are multiplied by `scalar` and `minScalar` is ignored. Shape `type` 5 is Box and 19 is Sprite (see U1). Collision `type` 1 is World and `collisionMode` 1 is 2D. Sub-emitter `type` 1 is Collision. `scalingMode` 1 is Local. `moveWithTransform` 0 is simulation space Local. Renderer `m_RenderMode` 0 is Billboard.

---

## 0. The unit conversion (read first)

| Fact | Where |
|---|---|
| Canvas: Screen Space – Camera (`m_RenderMode: 1`), plane distance 100 | U 343–345 |
| Camera: orthographic, size 1 (sees 2 world units vertically), viewport 0,0,1,1 | U 5780–5790 |
| CanvasScaler: Scale With Screen Size (`m_UiScaleMode: 1`), reference **500×500**, match mode 0 (MatchWidthOrHeight), match **0 = width** | U 309–314 |
| Canvas `m_LocalScale` is stored as 0: Unity sets it at runtime | dump chain, Canvas RectTransform |
| All 3 systems: `scalingMode: 1` (Local) and `moveWithTransform: 0` (Local simulation) | U 796–798, 7226–7228, 12378–12380 |

**What this means.** Positions of the emitters come from the canvas hierarchy, in canvas units. They convert with positions.ts's rule `playfield = (250 + x, 250 − y)` (`src/game/scene/positions.ts:5`). But Local scaling mode ignores the parents' scale, so the canvas's runtime scale never reaches the particles. **Every particle quantity is in world units:** shape size, speeds, velocity, gravity, start size and collision radius.

- Canvas px per world unit = 500 / (2 · aspect) = **250 / aspect**, with the width match and ortho size 1. On the square 500×500 window (01 infers a 500×500 itch embed): **1 world unit = 250 playfield px**. positions.ts already uses this for the arrows (0.2 world = 50 px, `positions.ts` ARROW_ROW doc).
- `m_MaxParticleSize` is a fraction of the viewport (Unity: "fraction of viewport size", Billboard mode only). On the square, viewport = 500 px, so it is independent of the canvas scale.
- **Scale-dependent:** every world-unit number below. They are exact only for a square window. On a 16:9 window the original's particles moved at 250/1.78 = 140.6 canvas px per world unit relative to the art, so the original looked different on every window shape. The port uses the square, as it did for the arrows.
- **Not scale-dependent:** times, rates, counts, alphas, gradient keys, and the emitter and collider positions (canvas units).

Gravity: `Physics.gravity` = (0, −9.81, 0) (`ProjectSettings/DynamicsManager.asset:7`; 2D is the same, `Physics2DSettings.asset:7`). Port y is down, so Unity +y becomes port −y.

---

## 1. Rain (`Stage/Rain`, ParticleSystem &280523594, renderer &280523593)

**Transform chain.** Rain is a `Transform` at local (207.00002, 275), scale 1 (U 662–663). It sits under `Stage`, a RectTransform anchored at (0, −9) with scale 1 (U 6973), under `Canvas`. So canvas (207, 266), which is **playfield (457, −16)**. Children: `RainCollision` and `Splash`.

**Renderer** (U 670–726)
- Material fileID 10754, built-in (= Sprites-Default; see U4). Normal alpha blend.
- `m_SortingOrder: -6` (U 706), sorting layer 0.
- Billboard (`m_RenderMode: 0`), `m_SortMode: 0`.
- `m_MaxParticleSize: 0.015` (U 710), `m_MinParticleSize: 0`.

**Main** (U 727–1346)
- duration (`lengthInSec`) **2**; `looping 1`; `prewarm 1`; playOnAwake 1 (U 734–739).
- startDelay constant 0.
- startLifetime constant **1** (U 803–).
- startSpeed constant **0**.
- startColor: random between two colors (mode 2). min = white, a 0.7058824; max = white, a 0.11764706. So alpha is uniform in [0.118, 0.706] and the colour stays white (U 909–).
- startSize constant 1. `startSizeY`/`Z` 1, but `size3D 0`, so it is uniform.
- startRotation 0 for every axis.
- `maxNumParticles` 1000 (U 1291).
- gravityModifier constant **0** (U 1294).
- simulationSpace Local; scalingMode Local.

**Shape** (U 1347–1493)
- `type 5` = **Box** (volume; `boxThickness` 0).
- `m_Position` (0,0,0), `m_Rotation` (0,0,0), **`m_Scale` (4, 1, 1)** (U 1358).
- The box is ±2 × ±0.5 world, emitting along +Z (into the screen). startSpeed is 0, so the direction is moot.

**Emission** (U 1494–1604)
- rateOverTime constant **220** (U 1500).
- rateOverDistance 0; no bursts.

**Texture sheet (UV) module** (U 1994–2113)
- Mode 1 (Sprites), one sprite: guid `1bf417fa…` = `Graphics/SpritesFinal/Stage/raindrop.png` (U 2113).
- frameOverTime curve × 0.9999 over a single frame: no visible effect. It is there only to assign the sprite.

**Velocity over lifetime** (U 2114–2699)
- x constant **−1.5**, y constant **−1.5** (U 2119, 2172), z 0.
- Local space (`inWorldSpace 0`); orbital, radial and offsets 0; speedModifier 1.

**Collision** (U 4126–~4320)
- `type 1` World, `collisionMode 1` **2D**.
- dampen 0, bounce 0, `m_EnergyLossOnCollision` (lifetime loss) constant **1** (U 4247): the drop dies on contact.
- minKillSpeed 0, `radiusScale` **0.03** (U 4302).
- `collidesWith` bits **768** = layers 8 "Barco" and 9 "Chuva" (`ProjectSettings/TagManager.asset:11–21`).
- quality 0 (High), collisionMessages 0.

**Sub emitters** (U 4325–4332)
- One entry: emitter &1833090339 (`Splash`), type **1 = Collision**, properties 0 (inherit nothing).

Disabled: Size, Rotation, Color over lifetime, InheritVelocity, Force, ExternalForces, LimitVelocity, Noise, the BySpeed modules, Trigger, Lights, Trails, CustomData.

**The colliders it hits.** These are the only two `Collider2D` in the scene; no prefab has one.
- `Stage/Rain/RainCollision` (layer 9, U 5828–5871). BoxCollider2D `m_Size` (2, 0.06), offset 0, under a Transform at local (−207.00002, −358.6) with **scale (300, 250)** (U 5842–5843). In canvas units: centre (0, −92.6), size 600 × 15. In **playfield**: x −50…550, **y 335.1…350.1**, centre (250, 342.6).
- `Stage/Barco Inteiro/InteiroSprite` (layer 8, U 5890). CapsuleCollider2D, vertical, size (15.86, 24.65), offset (0.14, −0.7) (U 5986–5987). Its parent is anchored at canvas (0, −50.5) (U 407), so the centre is canvas (0.14, −60.2) = **playfield (250.14, 310.2)**, the boat sprite's spot (WORLD_SPRITES boat (250, 310)). It moves with the boat's bob (InteiroSprite has the Animator). It is gone once `barcoInteiro.SetActive(false)` runs (GM:100, story part 3).

**Port units (square)**
- Emitter box: x **−43…957**, y **−141…109**.
- Velocity: **(−375, +375) px/s**, a constant 45° slant down and left, 530 px/s along the path. It matches the raindrop art, a bottom-left to top-right diagonal.
- Lifetime 1 s, so a drop travels at most 375 px down.
- Drawn size: min(250 px, 0.015 × 500) = **7.5 px**. The sprite is 8×8, so draw it at **scale 1 (8 px)** on the art grid (tune).
- Alpha uniform in [0.118, 0.706], constant over its life (no colour module). No rotation.
- Collision radius: startSize 1 world × radiusScale 0.03 = 7.5 px (or 3.75 px if Unity halves it, see U3).
- **Sea line: a drop dies when its centre reaches y ≈ 331** (335.1 − radius, 327.6–331.4). That is the top of sea_f's surface: sea_f's first opaque rows sit at y 326–330 (see §5).

**Measured behaviour** (Monte Carlo of the above, `tools/mc.mjs`)
- Mean alive: 193.
- About 61% of drops hit the sea collider (at 0.59–1 s of age).
- The rest are born at y < −44 and **vanish in mid-air** when their 1 s ends, at y 234–331. In the playfield that is about 68 drops/s, and it is in the original too.
- Hits inside x 0–500: about **70/s**.
- About 44% of spawns are born already inside the playfield (y0 > 0). Prewarm hides this at start, but drops do pop in mid-sky all game, as in the original.

---

## 2. Splash (`Stage/Rain/Splash`, ParticleSystem &1833090339, renderer &1833090338)

**Transform.** Local (−207, −335) under Rain (U 12246–12247), so canvas (0, −69), playfield (250, 319). GameObject layer 9. As a collision sub-emitter it emits at each collision point, so this position does not matter.

**Renderer** (U 12252–12308)
- Material fileID **10301** (built-in Default-Particle, see U4).
- **`m_SortingOrder: -10`** (U 12288).
- Billboard. **`m_MaxParticleSize: 0.003`** (U 12292).

**Main** (U 12309–12928)
- duration **1**, looping 1, **prewarm 0**, playOnAwake 1 (U 12316–12321).
- startDelay 0.
- startLifetime: two curves (mode 3) × **0.75**. Both curves are flat at 1, so it is a **constant 0.75 s** (U 12385–12388).
- startSpeed constant **0.05** (U 12441).
- startColor: random between two colors. min white, a 0.19607843; max white, a 0.11764706. So alpha is uniform in **[0.118, 0.196]**.
- startSize constant 1. `startSizeY` 0.5 (U 12607) is **ignored** because `size3D 0`.
- Rotation 0. maxNumParticles 1000 (U 12873).
- gravityModifier constant **0.07** (U 12879).

**Shape** (U 12929–13075)
- `type 19` (Sprite in the 2018 enum) with **no sprite assigned** (`m_Sprite {fileID: 0}`).
- `m_Scale` **(2, 0.06, 0)** (U 12940), the same numbers as the RainCollision box size.
- arc 45, arc mode 3 (burst spread), spread 1, radius 1.
- What Unity does with an empty Sprite shape is **not verifiable from the files** (U1).

**Emission** (U 13076–13243)
- rateOverTime constant 1, which is unused for a collision sub-emitter (U2).
- One burst: time 0, count = two curves × **3**, flat at 1, so **3 particles**; minScalar 1 is ignored (U 13189–13192). cycleCount 1, repeatInterval 0.01.

**Colour over lifetime** (U 13568–13603)
- Colour white throughout.
- Alpha keys: **1 at t 0.7588 (49730/65535), 0 at t 1.0**. It is held at 1 before the first key.

**UV**: sprite `raindrop.png` (U 13752).

**Velocity over lifetime** (U 13753–14338)
- x constant **−0.05**, y constant **+0.22** (U 13758, 13811). Local space.

**Limit velocity** (U 14561–)
- Enabled, magnitude constant 1, separateAxis 0, **`dampen: 0`** (U 14779), drag 0.
- With dampen 0 it never slows anything, so it is **a no-op** (and the speeds stay far under 1 world/s anyway).

Disabled: Collision, SubModule, Noise, Size, Rotation, Force, Lights, Trails, and the rest.

**Port units (square)**
- Velocity **(−12.5, −55) px/s**, gravity +0.07 × 9.81 × 250 = **+171.7 px/s²**.
- startSpeed 0.05 world = 12.5 px/s along the shape's normal. Its direction is unknown (U1). If it is +Z, it is invisible.
- Path over 0.75 s, starting at the hit point:
  - it rises to an apex **8.8 px up at 0.32 s**;
  - it ends **7 px below** the start;
  - it drifts **−9.4 px** in x.
- Drawn size 0.003 × 500 = **1.5 px**. A nearest-sampled 1.5 px quad of the 8×8 diagonal raindrop shows 1–2 diagonal texels. Port: a **1 or 2 art-px white dot** (`Texture.WHITE`, 1×1, `node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.js:186`), tuned by eye.
- Alpha uniform in [0.118, 0.196], multiplied by 1 until 0.569 s, then linear to 0 at 0.75 s.
- Count: 3 per rain collision, all with the same velocity.
  - With no shape spread they overlap exactly, so a splash is one speck at about 3× alpha.
  - If Unity spread them over the shape, they scatter.
  - Port recommendation: give each a small x jitter (±2–4 px) or a vx spread (**tune by eye**).
- Mean splash particles alive in the playfield: ~70 hits/s × 3 × 0.75 s ≈ **158**.

---

## 3. Bubbles (`Stage/UnderSea/Bubbles`, ParticleSystem &1517667643, renderer &1517667642)

**Transform chain.** Bubbles is a `Transform` at local (0, −240), scale 1 (U 7094–7095). It sits under `UnderSea` (RectTransform anchored (0, 0), scale 1, U 17085–; Bubbles is its only child), under `Stage` (0, −9). So canvas (0, −249), **playfield (250, 499)**. Neither UnderSea nor Stage has an Animator.

**Renderer** (U 7100–7156)
- Material 10754 (Sprites-Default).
- **`m_SortingOrder: -4`** (U 7136).
- Billboard. **`m_MaxParticleSize: 0.015`** (U 7140).

**Main** (U 7157–7776)
- duration **2**, looping 1, **prewarm 1** (U 7164–7168).
- startLifetime constant **5** (U 7236).
- startSpeed: two curves × **0.04**, flat at 1, so 0.04 (U 7288–7289).
- startColor: random between two colors, white, alpha uniform in **[0.118, 0.706]** (the same as rain).
- startSize: two curves × 1, so 1 (U 7404). size3D 0.
- Rotation 0. maxNumParticles 1000 (U 7721). gravityModifier 0.

**Shape** (U 7777–7923)
- **Box**, `m_Rotation` **(−90, 0, 0)**, `m_Scale` **(1.3, 0.02, 0.026413132)** (U 7787–7788), position 0.
- The −90° about X turns the box's +Z (emit direction) to **+Y, up**, and its z size to vertical.
- So the spawn area is x ±0.65 world, y ±0.0132 world.

**Emission** (U 7924–8034)
- rateOverTime: two curves (mode 3) × **1**, flat at 1, so **1/s** (U 7929). No bursts.

**Colour over lifetime** (U 8359–8394)
- White.
- Alpha keys: **1 at t 0, 1 at t 0.9 (58982/65535), 0 at t 1.0**.

**UV**: sprite guid `cff40854…` = `Graphics/SpritesFinal/Stage/bubble.png` (U 8543).

**Velocity over lifetime** (U 8544–9147, local space)
- y: curve × **0.08**, keys (0, 1) and (1, 1), so a constant 0.08 (U 8617–8620).
- z: curve × 1, keys (0, 0) and (1, 0), so 0.
- x: **curve × 1**, a wobble. The keys are (time, value, inSlope = outSlope):
  - (0, 0, 0.22024041)
  - (0.20147349, 0.044372603, 0.020000458)
  - (0.701751, −0.042935878, 0.12718819)
  - (1, 0.020000458, 0.21101943)
  - The curve is not weighted. Its time axis is normalized particle age.

**Collision** (U 10574–~10760)
- The same as rain: World, 2D, layers 8 and 9, lifetime loss 1, radiusScale 0.03 (U 10750).

Disabled: SubModule, Size, Rotation, Force, Noise, Limit, and the rest.

**Port units (square)**
- **Spawn**: x uniform in **87.5…412.5**, y uniform in **495.7…502.3**.
- **Rise**: −(0.04 + 0.08) × 250 = **−30 px/s**, so +150 px over 5 s, ending near **y 349**.
  - That is the bottom of RainCollision (350.1): bubbles hit it at y ≈ 354–358 (with the 3.75–7.5 px radius), at age ≈ 4.7–4.85 s, while already fading.
  - Port: lifetime 5 s, optionally killed at y ≤ 354. There is no visible difference.
- **Sway**: vx(t) = 250 × curve(age/5) px/s, in −11.4…+11.1 px/s. Integrated (`tools/curve.mjs`):

  | Age (s) | 0 | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0 |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | x offset (px) | 0 | 1.6 | 6.4 | 11.5 | 14.4 | 13.7 | 9.7 | 4.2 | −0.2 | −2.1 | −1.0 |

  Every bubble sways the same way (curve mode, no randomness), so the port can use a lookup: `x = x0 + DX(age)`.
- **Size**: min(250, 0.015 × 500) = **7.5 px**. The sprite is 4×4, so draw it at **scale 2 (8 px)** on the art grid (tune).
- **Alpha**: start uniform in [0.118, 0.706], × 1 until **4.5 s**, then linear to 0 at 5 s.
- **Prewarm**: one 2 s loop, so at 1/s about 2 bubbles exist at start, in the bottom 60 px.

---

## 4. Runtime changes by script

The only script touching any particle system is `GameManager`. A grep of `Assets/Scripts` for particle, emission, rain and bubble finds only these lines, and no `.anim` file has a path to Rain, Bubbles or UnderSea.

- `bubbles = bubbleGenerator.GetComponent<ParticleSystem>().emission` (GM:44). `bubbleGenerator` is &1517667640, Bubbles (U 17479).
- `SetBubbles(int intensity)` (GM:191–197) sets `rateOverTime.constantMin = 0.8·i` and `constantMax = i`.
- **When**:
  - (a) after each round succeeds and `afterGamePlayDelay` = 1.25 s (U `afterGamePlayDelay: 1.25`, GM:155–162), `parteHistoria += 1` and then `SetBubbles(parteHistoria × 2)`. So **2 after round 1, 4 after round 2, 6 after round 3**.
  - (b) in GameEnd, after `endGameDelay` = **3.5 s** (the scene overrides the code's 2.5; U GameManager block), together with the title and credits fade-in: `SetBubbles(1)` (GM:175–184).
- Before the first call the rate is the scene's **1/s**, from the start of Title.
- **Intended rate** for intensity i: random between 0.8i and i per evaluation, a mean of 0.9i. So 1.6–2, 3.2–4, 4.8–6, then 0.8–1 per second.
- **Probable no-op (U5).** The rate's serialized mode is two curves (U 7929). In Unity, setting `constantMin` and `constantMax` does not change a MinMaxCurve's `mode`, and in two-curves mode the native side reads only `curveMultiplier` and the curves. So in the shipped original the bubbles very likely stayed at **1/s all game**, and the 2/4/6 ramp never showed. The port follows the plan (2/4/6, none after the kraken; owner decision 4), which matches the code's intent. **Owner FYI.**
- **Rain** is never touched by any script. It plays from load (prewarmed) through Title, every story part, the rounds, the ending and replay. The only change is indirect: the boat collider leaves at GM:100 (part 3) when the intact boat is hidden, so drops then pass the boat's spot down to the sea.
- **Splash** is driven only by rain collisions.

---

## 5. Lines, bands and z-order (playfield px)

**Sea line (rain kill / splash spawn): y ≈ 331**
- RainCollision's top is 335.1, minus the collision radius of 3.75–7.5 px.
- sea_f is drawn at (225, 409), 500×180 with a centre anchor, so it spans y 319–499. Its surface (first opaque row per column) is at **y 326–330, median 329**, and it is 100% opaque from y ≈ 339.
- sea_m's surface is at 316–320 and sea_b's at 306–310 (measured on `src/assets/sprites/stage/sea_*.png`).
- The strips bob (world.ts clips), but the collider is static: keep the line static.
- Rain is drawn **behind** seaF, so a drop's tail tucks under the surface rows.
- Splashes: spawn at the drop's crossing point. With slope −1, x_hit = x − (y − 331) when y overshoots in a frame.
- The collider spans x −50…550, the whole playfield.

**Boat (parts 0–2 only)**
- A drop also dies, and splashes, inside the capsule: 15.86 × 24.65, centre = the boat sprite's live position + (0.14, +0.7).
- An AABB of ±7.93 × ±12.33, grown by the radius, is close enough.
- Without it, rain (−6) draws over the boat (−16).

**Underwater band (bubbles)**: x 87.5–412.5 (+15 sway), **y ≈ 350–502**.

**Eyes (proposal; the original gives no behaviour)**
- Keep a whole eye inside the bubble band and under the sea line.
  - eye_large (64×32): centre x **120–380**, y **372–478**.
  - eye_small (12×12): centre x 94–406, y 362–490.
- Draw them at the bubbles' order (**−4**, above seaF). seaF is opaque from y 339 down, so anything below it would be hidden.
- The vignette darkens the edges, so prefer the middle 60%.

**Z-order against WORLD_SPRITES** (`src/game/scene/positions.ts:30–46`, back to front)

| Order | Row |
|---|---|
| −25 | seaB |
| −19 | kraken-tail |
| −16 | boat |
| −15 | seaM |
| −10 | clouds, clouds-2 |
| **−10** | **splash**: after clouds-2 (`positions.ts:41`), before kraken-body (`:42`). The tie with clouds doesn't matter: clouds span y 9–137, splashes y ~320–335. |
| −9 | kraken-body |
| **−6** | **rain**: after kraken-body (`:42`), before seaF (`:43`) |
| −5 | seaF |
| **−4** | **bubbles and eyes**: after seaF (`:43`), before broken-boat (`:45`) |
| −2 | broken-boat |
| fx | Raio −2, TelaPreta/vignette −1, flash 0 |

All three systems sit in `world`, below `fx`. The black overlay (−1) and the flash cover them, as in the original. Splash at −10 is **behind seaF and the kraken body**: the front strip hides the lower half of each hop.

---

## 6. Textures in the port

| System | Unity sprite | Port asset | Status |
|---|---|---|---|
| Rain | `Stage/raindrop.png`, 8×8, Point filter, PPU 1, pivot centre (`raindrop.png.meta:34,47,48`) | `src/assets/sprites/stage/raindrop.png`, manifest key `raindrop` (`src/assets/manifest.ts:111`), imported by `scripts/import-assets.sh:30` | Present, byte-identical (cmp) |
| Splash | the same raindrop (U 13752) | the same, or `Texture.WHITE` for a 1–2 px dot | Present |
| Bubbles | `Stage/bubble.png`, 4×4, grey #808080 ring (`bubble.png.meta`) | `src/assets/sprites/stage/bubble.png`, key `bubble` (`manifest.ts:108`) | Present, byte-identical |
| Eyes | `Actors/eye_large.png` 64×32, `eye_small.png` 12×12 | not imported: `import-assets.sh:28` drops them | Re-import (Deliverable 2) |

Raindrop art: one white diagonal from (0, 7) to (7, 0), bottom-left to top-right.

---

## 7. Pixi v8 implementation sketch (verified against `node_modules/pixi.js` 8.20.1)

**Verified API** (`lib/scene/particle-container/shared/*.d.ts`)
- `new ParticleContainer({ texture?, particles?, dynamicProperties?, roundPixels?, shader?, ...ViewContainerOptions })`.
- `dynamicProperties` keys are `vertex`, `position`, `rotation`, `uvs` and `color`. The defaults are **position true, the rest false** (`particleData.js`).
- `particleChildren: T[]`, `addParticle(...)`, `addParticleAt`, `removeParticle(...)`, `removeParticleAt`, `removeParticles(begin, end)`, and `update()`.
- `update()` (or add/remove) sets `_childrenDirty`. Only then are the **static** attributes re-uploaded (`ParticleBuffer.update(particles, uploadStatic)`). Dynamic ones upload every frame for `particleChildren.length` particles.
- The buffer grows ×1.5 when the count exceeds its size.
- Bounds are not computed, so set `boundsArea` (`Container.boundsArea: Rectangle`).
- One texture source per container; `texture` defaults to the first particle's.
- `new Particle(texture | { texture, x, y, scaleX, scaleY, anchorX, anchorY, rotation, tint, alpha })`. `alpha` and `tint` setters clamp and recompute `color`.
- Pipes are registered for WebGL, WebGPU and Canvas (`particle-container/init.js`).
- Each ParticleContainer **breaks the batch** (`ParticleContainerPipe.addRenderable` → `batch.break`).
- Its `roundPixels` rounds in the vertex shader to the render target's pixels (`uResolution`), not to art pixels. That is k device px per art px inside the k× render texture, so it does not replace art-grid snapping: **round x and y in JS** (as `snapToArtPixels` does).

**Structure** (`src/game/scene/particles/`): three containers inserted into `layers.world` at the indices in §5.

| Container | Texture | dynamicProperties | Pool |
|---|---|---|---|
| splash | `Texture.WHITE` (or raindrop) | position, color | **256** |
| rain | raindrop, anchor 0.5, scale 1 | position, color | **224** |
| bubbles | bubble, anchor 0.5, scale 2 | position, color | **32** |

- `vertex`, `uvs` and `rotation` stay static: scale, anchor and frame are the same for every particle in a container.
- **Pool rule.** Fill `particleChildren` once to the pool size and never call `update()` again. A dead particle is parked (x = −64) with alpha 0. Spawning reuses a dead slot and sets x, y and alpha, which are all dynamic. This relies only on the documented dynamic and static contract.
  - The alternative (swap-remove plus `update()` on each change) re-uploads static data each frame. It is also cheap at these counts.
- **Pool sizes.**
  - Rain: 220/s × 1 s = 220, at most. If the spawn box is clipped to the visible-relevant x0 ∈ [−4, 880] (MC: no drop born at x0 > 879 ever enters the playfield) at 220 × 0.884 = 194.5/s, the density is the same, the mean alive is 154 and the pool can be 224.
  - Splash: mean 158, about 230 at peak with Poisson headroom, so 256.
  - Bubbles: 6/s × 5 s = 30, so 32.
  - Unity's `maxNumParticles` is 1000 for each and is never reached.
- **Step** (inside the game-logic guard, on the game clock, `dt` in seconds):
  - Emit with an accumulator: `acc += rate·dt; while (acc >= 1) { acc -= 1; spawn(); }`. Unity also emits at even intervals. Positions and alphas come from salted streams (`createRng((seed ^ RAIN_SALT) >>> 0)`, as in `session.ts:71`): rain, bubbles and eyes each get their own.
  - Rain: `x += −375·dt; y += 375·dt; age += dt`. If y ≥ 331 (or it is in the boat box while the boat shows): kill, and spawn 3 splashes at the crossing (only if −4 ≤ x ≤ 504). Else, if age ≥ 1: kill.
  - Splash: `vy += 171.7·dt; x += −12.5·dt; y += vy·dt`, starting at vy = −55. alpha = a0 · (t < 0.759 ? 1 : (1 − t)/(1 − 0.759)), with t = age/0.75. Kill at 0.75 s.
  - Bubbles: `y = y0 − 30·age; x = x0 + DX(age)`. alpha = a0 · (age < 4.5 ? 1 : (5 − age)/0.5). Kill at 5 s.
  - Rate: 1/s from Title until round 1 is won, then 0.9 × 2·part (or a per-frame random in [0.8i, i]), and 0 from the ending's kraken phase.
  - Prewarm: on reset, step the systems 2 s with a fixed dt (for example 120 × 1/60). The rain reaches steady state, and the bubbles match Unity's 2 s prewarm.
  - Write `Math.round` positions into the Particles (art grid).
- **Reduced motion and pause.** Pause is free on the game clock. Reduced motion lowers the rain rate per the plan's table.

**Per-frame cost estimate**
- About 175–195 rain + about 160 splash + at most 30 bubbles ≈ 400 live, inside a fixed 512 quads.
- JS: ≈ 10 flops plus a branch per particle. That is about 10–20 µs on desktop, and about 0.1–0.2 ms at 4× CPU throttle.
- Upload: about 512 × (8 position floats + 4 colour words) × 4 B ≈ 24 KB per frame across 3 `bufferSubData` calls.
- GPU: 3 extra draws, plus up to 3 batch breaks in `world` (about 6 draws in all). The fill is tiny quads inside the 500 px render texture, independent of screen size.
- Expected: **well under the +1 ms budget**. Confirm on the throttled iPhone-13 profile.

---

## Uncertainties (U)

- **U1. Splash shape type 19.** It is Sprite in the 2018 enum (Rectangle = 18), with no sprite assigned. I can't tell from the files whether Unity emitted from the hit point, scattered over a 2×0.06 world box (±250 px), or what the normal for startSpeed 0.05 was. Port: emit at the hit point with a small jitter, tuned by eye.
- **U2. A collision sub-emitter uses only its bursts.** This is my understanding of Unity's sub-emitter semantics: rateOverTime 1 is ignored. Not verifiable without the editor.
- **U3. Collision radius.** size × radiusScale (7.5 px) or half that (3.75 px). It only moves the sea line between y 327.6 and 331.4. Tune by eye; 331 is recommended.
- **U4. Built-in material IDs.** 10754 = Sprites-Default and 10301 = Default-Particle (`Particles/Alpha Blended Premultiply`, about normal blend at these alphas) are from memory of Unity's built-in IDs. Use the normal blend for all three.
- **U5. `SetBubbles` is probably a no-op** in the original (two-curves mode kept), so the original's bubbles were likely 1/s throughout. The port uses the plan's 2/4/6 as decided.
- **U6. Square window assumed** (01's inference). Every world-unit number scales by 1/aspect on wider windows, so the original had no single "true" size or speed. The drawn sizes (7.5, 7.5 and 1.5 px) and the slant are the values to confirm by eye.
- **U7. `m_MaxParticleSize`** is taken as a fraction of the viewport height. That is the same on the square.
- Unity's burst-count two-curves mode is read as scalar × curve (3); if minScalar were honoured it would be 1–3.
- **Must tune by eye:** the drop and bubble pixel sizes (8 vs 7.5), the splash dot size and spread, the sea line ±4 px, the splash z-order effect, the rate at the 4× throttle, and the eye band.
