// Asset manifest for the After the Waves Crash port. Data only.
// Sprites, audio (except creak_loop/haul_tick) and the font come from scripts/import-assets.sh, which prints the
// anchors and timings below; creak_loop and haul_tick come from scripts/make-sfx.sh. Written by Claude Code.
import boatUrl from "./sprites/actors/boat.png?url";
import boatFlippedUrl from "./sprites/actors/boat_flipped.png?url";
import monsterAUrl from "./sprites/actors/monster_a.png?url";
import monsterBUrl from "./sprites/actors/monster_b.png?url";
import backgroundPillarsUrl from "./sprites/stage/background_pillars.png?url";
import backgroundTentaclesUrl from "./sprites/stage/background_tentacles.png?url";
import bubbleUrl from "./sprites/stage/bubble.png?url";
import cloudsUrl from "./sprites/stage/clouds.png?url";
import flashUrl from "./sprites/stage/flash.png?url";
import raindropUrl from "./sprites/stage/raindrop.png?url";
import seaBUrl from "./sprites/stage/sea_b.png?url";
import seaFUrl from "./sprites/stage/sea_f.png?url";
import seaMUrl from "./sprites/stage/sea_m.png?url";
import thunder0Url from "./sprites/stage/thunder_0.png?url";
import thunder1Url from "./sprites/stage/thunder_1.png?url";
import thunder2Url from "./sprites/stage/thunder_2.png?url";
import thunder3Url from "./sprites/stage/thunder_3.png?url";
import thunder4Url from "./sprites/stage/thunder_4.png?url";
import vignetteUrl from "./sprites/stage/vignette.png?url";
import arrowDownUrl from "./sprites/ui/arrow_down.png?url";
import arrowLeftUrl from "./sprites/ui/arrow_left.png?url";
import arrowRightUrl from "./sprites/ui/arrow_right.png?url";
import arrowUpUrl from "./sprites/ui/arrow_up.png?url";
import cursorEmptyUrl from "./sprites/ui/cursor_empty.png?url";
import cursorPastUrl from "./sprites/ui/cursor_past.png?url";
import cursorSelectedUrl from "./sprites/ui/cursor_selected.png?url";
import textBoxUrl from "./sprites/ui/text_box.png?url";
import titleUrl from "./sprites/ui/title.png?url";
import bgm01Url from "./audio/music/bgm01.m4a?url";
import bgm02Url from "./audio/music/bgm02.m4a?url";
import overlayPhase02Url from "./audio/music/overlay_phase02.m4a?url";
import overlayPhase03Url from "./audio/music/overlay_phase03.m4a?url";
import overlayPhase04Url from "./audio/music/overlay_phase04.m4a?url";
import thunderclapUrl from "./audio/sfx/thunderclap.m4a?url";
import krakenUrl from "./audio/sfx/kraken.m4a?url";
import creakLoopUrl from "./audio/sfx/creak_loop.m4a?url";
import haulTickUrl from "./audio/sfx/haul_tick.m4a?url";
import josefinSlabUrl from "./fonts/JosefinSlab-Regular.ttf?url";

export interface Anchor {
  readonly x: number;
  readonly y: number;
}

export interface SpriteAsset {
  readonly url: string;
  readonly anchor: Anchor;
}

// Times in seconds. Playback starts at `offset` and lasts `duration`; loops repeat [loopStart, loopEnd].
export interface OneShotAudioAsset {
  readonly url: string;
  readonly offset: number;
  readonly duration: number;
  readonly loop: false;
}

export interface LoopAudioAsset {
  readonly url: string;
  readonly offset: number;
  readonly duration: number;
  readonly loop: true;
  readonly loopStart: number;
  readonly loopEnd: number;
}

export type AudioAsset = OneShotAudioAsset | LoopAudioAsset;

// Unity pivots (y up) flipped to Pixi anchors (y down). Every sprite is centred except the top-centred thunder bolts.
const CENTER: Anchor = { x: 0.5, y: 0.5 };
const TOP_CENTER: Anchor = { x: 0.5, y: 0 };

// Every imported clip starts after the same 0.1 s guard band (the loop's own tail for loops, silence otherwise).
const GUARD = 0.1;
const SAMPLE_RATE = 44100;
const BAR = 423360 / SAMPLE_RATE; // 9.6 s: BGM01 and the looping overlays

export const SPRITES = {
  boat: { url: boatUrl, anchor: CENTER },
  boatFlipped: { url: boatFlippedUrl, anchor: CENTER },
  monsterA: { url: monsterAUrl, anchor: CENTER },
  monsterB: { url: monsterBUrl, anchor: CENTER },
  backgroundPillars: { url: backgroundPillarsUrl, anchor: CENTER },
  backgroundTentacles: { url: backgroundTentaclesUrl, anchor: CENTER },
  bubble: { url: bubbleUrl, anchor: CENTER },
  clouds: { url: cloudsUrl, anchor: CENTER },
  flash: { url: flashUrl, anchor: CENTER },
  raindrop: { url: raindropUrl, anchor: CENTER },
  seaB: { url: seaBUrl, anchor: CENTER },
  seaF: { url: seaFUrl, anchor: CENTER },
  seaM: { url: seaMUrl, anchor: CENTER },
  thunder0: { url: thunder0Url, anchor: TOP_CENTER },
  thunder1: { url: thunder1Url, anchor: TOP_CENTER },
  thunder2: { url: thunder2Url, anchor: TOP_CENTER },
  thunder3: { url: thunder3Url, anchor: TOP_CENTER },
  thunder4: { url: thunder4Url, anchor: TOP_CENTER },
  vignette: { url: vignetteUrl, anchor: CENTER },
  arrowDown: { url: arrowDownUrl, anchor: CENTER },
  arrowLeft: { url: arrowLeftUrl, anchor: CENTER },
  arrowRight: { url: arrowRightUrl, anchor: CENTER },
  arrowUp: { url: arrowUpUrl, anchor: CENTER },
  cursorEmpty: { url: cursorEmptyUrl, anchor: CENTER },
  cursorPast: { url: cursorPastUrl, anchor: CENTER },
  cursorSelected: { url: cursorSelectedUrl, anchor: CENTER },
  textBox: { url: textBoxUrl, anchor: CENTER },
  title: { url: titleUrl, anchor: CENTER },
} as const satisfies Readonly<Record<string, SpriteAsset>>;

export type SpriteKey = keyof typeof SPRITES;

export const AUDIO = {
  bgm01: { url: bgm01Url, offset: GUARD, duration: BAR, loop: true, loopStart: GUARD, loopEnd: GUARD + BAR },
  bgm02: { url: bgm02Url, offset: GUARD, duration: 900775 / SAMPLE_RATE, loop: false },
  overlayPhase02: {
    url: overlayPhase02Url,
    offset: GUARD,
    duration: BAR,
    loop: true,
    loopStart: GUARD,
    loopEnd: GUARD + BAR,
  },
  overlayPhase03: {
    url: overlayPhase03Url,
    offset: GUARD,
    duration: BAR,
    loop: true,
    loopStart: GUARD,
    loopEnd: GUARD + BAR,
  },
  // Not looped: restarted on every BGM01 bar, so it rests for the ~2.4 s after its 7.176 s.
  overlayPhase04: { url: overlayPhase04Url, offset: GUARD, duration: 316460 / SAMPLE_RATE, loop: false },
  thunderclap: { url: thunderclapUrl, offset: GUARD, duration: 121055 / SAMPLE_RATE, loop: false },
  kraken: { url: krakenUrl, offset: GUARD, duration: 318049 / SAMPLE_RATE, loop: false },
  creakLoop: { url: creakLoopUrl, offset: GUARD, duration: 1.6, loop: true, loopStart: GUARD, loopEnd: 1.7 },
  // Synthesized by make-sfx.sh without a start guard.
  haulTick: { url: haulTickUrl, offset: 0, duration: 0.07, loop: false },
} as const satisfies Readonly<Record<string, AudioAsset>>;

export type AudioKey = keyof typeof AUDIO;

export const FONTS = {
  "Josefin Slab": josefinSlabUrl,
} as const satisfies Readonly<Record<string, string>>;

export type FontFamily = keyof typeof FONTS;
