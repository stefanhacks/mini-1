// Asset manifest for the After the Waves Crash port. Data only.
// Sprites, audio (except creak_loop/haul_tick) and the font come from scripts/import-assets.sh, which prints the
// anchors and timings below; creak_loop and haul_tick come from scripts/make-sfx.sh. Written by Claude Code.
import boatUrl from "./sprites/actors/boat.png?url&no-inline";
import boatFlippedUrl from "./sprites/actors/boat_flipped.png?url&no-inline";
import eyeLargeUrl from "./sprites/actors/eye_large.png?url&no-inline";
import eyeSmallUrl from "./sprites/actors/eye_small.png?url&no-inline";
import monsterAUrl from "./sprites/actors/monster_a.png?url&no-inline";
import monsterBUrl from "./sprites/actors/monster_b.png?url&no-inline";
import backgroundPillarsUrl from "./sprites/stage/background_pillars.png?url&no-inline";
import backgroundTentaclesUrl from "./sprites/stage/background_tentacles.png?url&no-inline";
import bubbleUrl from "./sprites/stage/bubble.png?url&no-inline";
import cloudsUrl from "./sprites/stage/clouds.png?url&no-inline";
import flashUrl from "./sprites/stage/flash.png?url&no-inline";
import raindropUrl from "./sprites/stage/raindrop.png?url&no-inline";
import seaBUrl from "./sprites/stage/sea_b.png?url&no-inline";
import seaFUrl from "./sprites/stage/sea_f.png?url&no-inline";
import seaMUrl from "./sprites/stage/sea_m.png?url&no-inline";
import thunder0Url from "./sprites/stage/thunder_0.png?url&no-inline";
import thunder1Url from "./sprites/stage/thunder_1.png?url&no-inline";
import thunder2Url from "./sprites/stage/thunder_2.png?url&no-inline";
import thunder3Url from "./sprites/stage/thunder_3.png?url&no-inline";
import thunder4Url from "./sprites/stage/thunder_4.png?url&no-inline";
import vignetteUrl from "./sprites/stage/vignette.png?url&no-inline";
import arrowDownUrl from "./sprites/ui/arrow_down.png?url&no-inline";
import arrowLeftUrl from "./sprites/ui/arrow_left.png?url&no-inline";
import arrowRightUrl from "./sprites/ui/arrow_right.png?url&no-inline";
import arrowUpUrl from "./sprites/ui/arrow_up.png?url&no-inline";
import cursorEmptyUrl from "./sprites/ui/cursor_empty.png?url&no-inline";
import cursorPastUrl from "./sprites/ui/cursor_past.png?url&no-inline";
import cursorSelectedUrl from "./sprites/ui/cursor_selected.png?url&no-inline";
import textBoxUrl from "./sprites/ui/text_box.png?url&no-inline";
import titleUrl from "./sprites/ui/title.png?url&no-inline";
import bgm01Url from "./audio/music/bgm01.m4a?url&no-inline";
import bgm02Url from "./audio/music/bgm02.m4a?url&no-inline";
import overlayPhase02Url from "./audio/music/overlay_phase02.m4a?url&no-inline";
import overlayPhase03Url from "./audio/music/overlay_phase03.m4a?url&no-inline";
import overlayPhase04Url from "./audio/music/overlay_phase04.m4a?url&no-inline";
import thunderclapUrl from "./audio/sfx/thunderclap.m4a?url&no-inline";
import krakenUrl from "./audio/sfx/kraken.m4a?url&no-inline";
import creakLoopUrl from "./audio/sfx/creak_loop.m4a?url&no-inline";
import haulTickUrl from "./audio/sfx/haul_tick.m4a?url&no-inline";
import josefinSlabUrl from "./fonts/JosefinSlab-Regular.ttf?url&no-inline";

export interface Anchor {
  readonly x: number;
  readonly y: number;
}

export interface SpriteAsset {
  readonly url: string;
  readonly anchor: Anchor;
}

// Times in seconds. `offset` is where the clip starts in the decoded buffer: pass it to start(when, offset).
// `duration` is the clip length. For loops it equals loopEnd - loopStart and must NOT be passed to
// AudioBufferSourceNode.start(), which would stop the loop after one pass. One-shots play to the end of the buffer;
// anything after `offset + duration` is AAC padding (silence).
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
const BAR_SAMPLES = 423360; // 9.6 s: BGM01 and the looping overlays

// `samples` is the clip's exact length at 44.1 kHz, as printed by import-assets.sh.
const loop = (url: string, samples: number): LoopAudioAsset => ({
  url,
  offset: GUARD,
  duration: samples / SAMPLE_RATE,
  loop: true,
  loopStart: GUARD,
  loopEnd: GUARD + samples / SAMPLE_RATE,
});

const once = (url: string, samples: number): OneShotAudioAsset => ({
  url,
  offset: GUARD,
  duration: samples / SAMPLE_RATE,
  loop: false,
});

export const SPRITES = {
  boat: { url: boatUrl, anchor: CENTER },
  boatFlipped: { url: boatFlippedUrl, anchor: CENTER },
  eyeLarge: { url: eyeLargeUrl, anchor: CENTER },
  eyeSmall: { url: eyeSmallUrl, anchor: CENTER },
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
  bgm01: loop(bgm01Url, BAR_SAMPLES),
  bgm02: once(bgm02Url, 900775),
  overlayPhase02: loop(overlayPhase02Url, BAR_SAMPLES),
  overlayPhase03: loop(overlayPhase03Url, BAR_SAMPLES),
  // Not looped: restarted on every BGM01 bar, so it rests for the ~2.4 s after its 7.176 s.
  overlayPhase04: once(overlayPhase04Url, 316460),
  thunderclap: once(thunderclapUrl, 121055),
  kraken: once(krakenUrl, 318049),
  // From make-sfx.sh: 1.6 s loop with a 0.1 s guard on each side (loopStart 0.1, loopEnd 1.7).
  creakLoop: loop(creakLoopUrl, 70560),
  // From make-sfx.sh, synthesized without a start guard.
  haulTick: { url: haulTickUrl, offset: 0, duration: 0.07, loop: false },
} as const satisfies Readonly<Record<string, AudioAsset>>;

export type AudioKey = keyof typeof AUDIO;

export const FONTS = {
  "Josefin Slab": josefinSlabUrl,
} as const satisfies Readonly<Record<string, string>>;

export type FontFamily = keyof typeof FONTS;
