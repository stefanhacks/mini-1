// What the particle systems share: a fixed pool of slots, the dots they drive and Unity's even emission. Pure
// TypeScript with no Pixi import. Written by Claude Code.

/** One drawn particle as a system sees it: a Pixi `Particle` fits. */
export interface Dot {
  x: number;
  y: number;
  alpha: number;
}

/** Where a free slot's dot waits, off the playfield and transparent (m5-particles-spec §7, pool rule). */
export const PARKED_X = -64;

export const park = (dot: Dot) => {
  dot.x = PARKED_X;
  dot.y = 0;
  dot.alpha = 0;
};

/**
 * A fixed set of slots, one per dot. Taking one never allocates: the free ones sit on a stack, so which slot a new
 * particle gets depends only on what came before, never on the frame rate.
 */
export interface Slots {
  /** A free slot, or −1 when every one is in use (the new particle is dropped). */
  readonly take: () => number;
  readonly free: (slot: number) => void;
  /** Frees every slot, in the order a new pool hands them out. */
  readonly clear: () => void;
  readonly live: Uint8Array;
  readonly inUse: number;
  readonly size: number;
}

export const createSlots = (size: number): Slots => {
  const stack = new Int32Array(size);
  const live = new Uint8Array(size);
  let top = 0;

  const clear = () => {
    live.fill(0);

    // Slot 0 on top.
    for (let index = 0; index < size; index++) {
      stack[index] = size - 1 - index;
    }

    top = size;
  };

  clear();

  return {
    take: () => {
      if (top === 0) {
        return -1;
      }

      top -= 1;
      const slot = stack[top];

      live[slot] = 1;

      return slot;
    },
    free: (slot) => {
      if (live[slot] === 1) {
        live[slot] = 0;
        stack[top] = slot;
        top += 1;
      }
    },
    clear,
    live,
    get inUse() {
      return size - top;
    },
    size,
  };
};

/**
 * Unity's emission: `rate` particles a second at even intervals, the fraction carried over. The emission times in
 * (`from`, `to`] (s), given to `emit` in order. A rate of 0 or less emits nothing and keeps the fraction.
 */
export interface Emitter {
  phase: number;
}

export const emitBetween = (emitter: Emitter, rate: number, from: number, to: number, emit: (at: number) => void) => {
  if (!(rate > 0) || !(to > from)) {
    return;
  }

  const start = emitter.phase;
  const total = start + rate * (to - from);
  const count = Math.floor(total);

  // The carried fraction is set first, so a throw in `emit` can't emit the same particles twice.
  emitter.phase = total - count;

  for (let index = 1; index <= count; index++) {
    emit(from + (index - start) / rate);
  }
};
