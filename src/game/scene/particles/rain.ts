// The rain and its splash sub-emitter (m5-particles-spec §1, §2), on a fixed pool each. Pure TypeScript with no Pixi
// import. Written by Claude Code.
//
// Every particle moves on a closed form of its age, so where it is depends on the weather's time, not on how the
// frames cut it. A drop dies where it meets the sea line, or the intact boat's capsule, and splashes there: the
// crossing is solved on its straight path, so a fast frame can't carry it through.
import type { Point } from "../../../core/layout.ts";
import type { Rng } from "../../challenges/rng.ts";
import { createSlots, emitBetween, park, type Dot, type Emitter } from "./pool.ts";
import { between, BOAT_COLLIDER, RAIN, SPLASH } from "./spec.ts";

export interface RainStep {
  /** Multiplies the rain's emission: 1 is the original's. Reduced motion's hook (m5-plan, deliverable 4). */
  readonly rate: number;
  /** The intact boat sprite's position while it shows, or null: drops then fall through to the sea. */
  readonly boat: Point | null;
}

export interface RainStats {
  readonly drops: number;
  readonly splashes: number;
  /** Particles a full pool turned away since the last reset. */
  readonly dropped: number;
}

export interface RainSystem {
  /** Empties both pools and takes `rng` for every later draw: each drop's, its splash's with it. */
  readonly reset: (rng: Rng) => void;
  /** Moves the rain from `from` to `to` (s of weather time): emits, kills, splashes, and places every dot. */
  readonly step: (from: number, to: number, options: RainStep) => void;
  readonly stats: RainStats;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Moves `box` around the boat at `boat`, and returns it: one box for every step, so a frame allocates nothing. */
const placeBoatBox = (box: Box, boat: Point) => {
  box.left = boat.x + BOAT_COLLIDER.offsetX - BOAT_COLLIDER.halfWidth;
  box.right = boat.x + BOAT_COLLIDER.offsetX + BOAT_COLLIDER.halfWidth;
  box.top = boat.y + BOAT_COLLIDER.offsetY - BOAT_COLLIDER.halfHeight;
  box.bottom = boat.y + BOAT_COLLIDER.offsetY + BOAT_COLLIDER.halfHeight;

  return box;
};

/** When, from now, a point at `p` moving at `v` is inside [`low`, `high`]: [enter, leave], empty if enter > leave. */
const slab = (p: number, v: number, low: number, high: number): [number, number] => {
  if (v > 0) {
    return [(low - p) / v, (high - p) / v];
  }

  if (v < 0) {
    return [(high - p) / v, (low - p) / v];
  }

  return p >= low && p <= high ? [-Infinity, Infinity] : [Infinity, -Infinity];
};

/**
 * `drops` and `splashes` are the drawn dots, one per pool slot (RAIN.pool and SPLASH.pool of them). A free slot's dot
 * is parked; a live one gets its whole-px position each step (the art grid), and its alpha when that changes.
 */
export const createRain = (drops: readonly Dot[], splashes: readonly Dot[]): RainSystem => {
  const dropSlots = createSlots(drops.length);
  const dropBirth = new Float64Array(drops.length);
  const dropX = new Float64Array(drops.length);
  const dropY = new Float64Array(drops.length);
  // When the drop dies on its own: at the sea line (it splashes) or at the end of its life (it vanishes).
  const dropEnd = new Float64Array(drops.length);
  const dropSplashes = new Uint8Array(drops.length);
  // Each drop's splash, drawn with the drop: the draws then follow the emission order alone, so the same seed gives the
  // same rain however the frames cut it.
  const splashOffsets = new Float64Array(drops.length * SPLASH.count);
  const splashAlphas = new Float64Array(drops.length * SPLASH.count);

  const splashSlots = createSlots(splashes.length);
  const splashBirth = new Float64Array(splashes.length);
  const splashX = new Float64Array(splashes.length);
  const splashY = new Float64Array(splashes.length);
  const splashAlpha = new Float64Array(splashes.length);

  const emitter: Emitter = { phase: 0 };
  const box: Box = { left: 0, right: 0, top: 0, bottom: 0 };
  let rng: Rng | null = null;
  let dropped = 0;

  const draw = () => {
    if (rng === null) {
      throw new Error("The rain steps before its first reset");
    }

    return rng.next();
  };

  /**
   * The splash of the drop in `drop`: its dots from (x, y) at `at`, unless the hit is off the playfield. A dot already
   * gone by `to` takes no slot.
   */
  const splash = (drop: number, at: number, x: number, y: number, to: number) => {
    if (x < RAIN.splashX.min || x > RAIN.splashX.max || at + SPLASH.life <= to) {
      return;
    }

    for (let index = drop * SPLASH.count; index < (drop + 1) * SPLASH.count; index++) {
      const slot = splashSlots.take();

      if (slot < 0) {
        dropped += 1;
        continue;
      }

      splashBirth[slot] = at;
      splashX[slot] = x + splashOffsets[index];
      splashY[slot] = y;
      splashAlpha[slot] = splashAlphas[index];
    }
  };

  const killDrop = (slot: number) => {
    dropSlots.free(slot);
    park(drops[slot]);
  };

  /** When the drop in `slot` enters `box` between `from` and `until`, or −1. */
  const boatHit = (slot: number, box: Box, from: number, until: number) => {
    const age = from - dropBirth[slot];
    const [enterX, leaveX] = slab(dropX[slot] + RAIN.vx * age, RAIN.vx, box.left, box.right);
    const [enterY, leaveY] = slab(dropY[slot] + RAIN.vy * age, RAIN.vy, box.top, box.bottom);
    const enter = Math.max(enterX, enterY, 0);
    const leave = Math.min(leaveX, leaveY);

    return enter <= leave && from + enter <= until ? from + enter : -1;
  };

  /** Moves the drop in `slot` over (`from`, `to`]: it hits the boat, ends, or is placed at `to`. */
  const moveDrop = (slot: number, from: number, to: number, box: Box | null) => {
    const birth = dropBirth[slot];
    const end = dropEnd[slot];
    const hit = box === null ? -1 : boatHit(slot, box, Math.max(from, birth), Math.min(to, end));

    if (hit >= 0) {
      killDrop(slot);
      splash(slot, hit, dropX[slot] + RAIN.vx * (hit - birth), dropY[slot] + RAIN.vy * (hit - birth), to);
    } else if (end <= to) {
      killDrop(slot);

      if (dropSplashes[slot] === 1) {
        splash(slot, end, dropX[slot] + RAIN.vx * (end - birth), RAIN.seaLine, to);
      }
    } else {
      const drop = drops[slot];

      drop.x = Math.round(dropX[slot] + RAIN.vx * (to - birth));
      drop.y = Math.round(dropY[slot] + RAIN.vy * (to - birth));
    }
  };

  const spawnDrop = (at: number, to: number, box: Box | null) => {
    const x = between(draw, RAIN.x);
    const y = between(draw, RAIN.y);
    const alpha = between(draw, RAIN.alpha);
    const slot = dropSlots.take();

    if (slot < 0) {
      // Its splash's draws still go, so a full pool shifts no later drop.
      for (let index = 0; index < 2 * SPLASH.count; index++) {
        draw();
      }

      dropped += 1;
      return;
    }

    for (let index = slot * SPLASH.count; index < (slot + 1) * SPLASH.count; index++) {
      splashOffsets[index] = (draw() * 2 - 1) * SPLASH.spread;
      splashAlphas[index] = between(draw, SPLASH.alpha);
    }

    const seaAt = at + (RAIN.seaLine - y) / RAIN.vy;

    dropBirth[slot] = at;
    dropX[slot] = x;
    dropY[slot] = y;
    dropSplashes[slot] = seaAt < at + RAIN.life ? 1 : 0;
    dropEnd[slot] = Math.min(seaAt, at + RAIN.life);
    drops[slot].alpha = alpha;
    moveDrop(slot, at, to, box);
  };

  const killSplash = (slot: number) => {
    splashSlots.free(slot);
    park(splashes[slot]);
  };

  const placeSplash = (slot: number, to: number) => {
    const age = to - splashBirth[slot];
    const dot = splashes[slot];

    if (age >= SPLASH.life) {
      killSplash(slot);
      return;
    }

    const t = age / SPLASH.life;
    const fade = t < SPLASH.fadeFrom ? 1 : (1 - t) / (1 - SPLASH.fadeFrom);

    dot.x = Math.round(splashX[slot] + SPLASH.vx * age);
    dot.y = Math.round(splashY[slot] + SPLASH.vy * age + (SPLASH.gravity * age * age) / 2);
    dot.alpha = splashAlpha[slot] * fade;
  };

  return {
    reset: (next) => {
      rng = next;
      emitter.phase = 0;
      dropped = 0;
      dropSlots.clear();
      splashSlots.clear();
      drops.forEach(park);
      splashes.forEach(park);
    },
    step: (from, to, { rate, boat }) => {
      const boatAt = boat === null ? null : placeBoatBox(box, boat);

      // The splashes gone by `to` free their slots first, so a long step's new ones don't find the pool full of them.
      for (let slot = 0; slot < splashes.length; slot++) {
        if (splashSlots.live[slot] === 1 && splashBirth[slot] + SPLASH.life <= to) {
          killSplash(slot);
        }
      }

      for (let slot = 0; slot < drops.length; slot++) {
        if (dropSlots.live[slot] === 1) {
          moveDrop(slot, from, to, boatAt);
        }
      }

      emitBetween(emitter, RAIN.rate * rate, from, to, (at) => spawnDrop(at, to, boatAt));

      for (let slot = 0; slot < splashes.length; slot++) {
        if (splashSlots.live[slot] === 1) {
          placeSplash(slot, to);
        }
      }
    },
    stats: {
      get drops() {
        return dropSlots.inUse;
      },
      get splashes() {
        return splashSlots.inUse;
      },
      get dropped() {
        return dropped;
      },
    },
  };
};
