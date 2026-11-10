# After the Waves Crash: knowledge base

A knowledge base for porting [After the Waves Crash](https://github.com/stefanhacks/After-the-Waves-Crash) (a 2018 Unity jam game played with the arrow keys) to a mobile web game in this repo (TypeScript + Pixi.js v8).

| File | What it covers |
|---|---|
| [01-original-game.md](01-original-game.md) | How the **original** desktop game works: flow, arrow-key challenges, story script, presentation, audio, desktop dependencies, quirks, tunables. |
| [02-mobile-alternatives.md](02-mobile-alternatives.md) | A literal mobile port: compass pad input, layout and scaling, text, audio, lifecycle, effects. |
| [03-new-mechanics.md](03-new-mechanics.md) | Touch-native replacements for the challenges (Chart the Course, Brace the Helm, Haul the Line), alternatives considered, owner decisions. |
| [04-implementation-difficulty.md](04-implementation-difficulty.md) | Effort estimates, corrections found against Pixi 8.20.1, build weight, milestones, device-testing plan, owner questions. |
| [m0-plan.md](m0-plan.md) | M0 foundations plan (done), with review carry-overs for later milestones. |
| [m1-plan.md](m1-plan.md) | M1 display skeleton plan (done). |
| [m2-plan.md](m2-plan.md) | M2 playable loop plan, replanned against what M0 and M1 built. |

## How it was produced

Written by Claude Code. Eight research agents worked in four phases. Each phase was reviewed, and claims were spot-checked against the Unity source and `node_modules/pixi.js` before being merged here.

1. **Original game:**
   - "Orc Mage: Input Gameplay-logic" covered input and core logic.
   - "Elf Bard: Presentation Flow-and-assets" covered presentation, flow and assets.
2. **Mobile alternatives:**
   - "Dwarf Ranger: Gameplay Touch-alternatives" covered touch input.
   - "Gnome Cleric: Platform Mobile-presentation" covered layout, audio, lifecycle and performance.
3. **New mechanics** (these two read the knowledge base only):
   - "Lizard Druid: Sequence Native-mechanics" covered Sequence.
   - "Goblin Monk: Hold-many Native-mechanics" covered Hold and Many.
4. **Difficulty:**
   - "Dragon Paladin: Mechanics Difficulty-gauge" covered gameplay and core.
   - "Troll Artificer: Platform Difficulty-gauge" covered platform and pipeline.

Items marked *(uncertain)* were not verified at runtime. Anything about iOS or real touch ergonomics needs a real-device check.
