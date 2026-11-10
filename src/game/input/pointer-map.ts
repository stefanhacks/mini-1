// The input state behind the router: which pointers and keys hold which direction, and the event queue the active
// state drains in `update`. Pure TypeScript with no DOM access, so it runs under `node --test`. The DOM glue
// (dom-router.ts, keyboard.ts) only translates browser events into the calls below.
//
// Contract for the game states and the challenge rules:
//
// - Every pad (both landscape pads) and the keyboard feed ONE logical state per direction (owner decision 1).
// - "press" is emitted once for every new holder that goes down on a direction: a pointer going down on a button, or a
//   non-repeat arrow keydown. It is emitted even when the direction is already held by another holder, so two thumbs
//   tapping the same arrow count twice.
// - "release" is emitted only when the LAST holder of a direction lets go, so a direction is held exactly from its
//   first "press" until the next "release" or "cancel". Consumers can track that from the events alone.
// - "cancel" means everything was let go at once (blur, hidden page): no "release" events accompany it. It is only
//   emitted when at least one direction was held. Pointers and keys that were down become stale (see below).
// - "advance" is emitted for every tap that ends normally (pointerup, never pointerdown: on touch only pointerup can
//   unlock audio) and every non-repeat keydown that isn't a modifier or a shortcut. It comes in addition to any
//   press/release of the same input: rounds ignore "advance", the other states ignore press/release.
// - Events are queued in DOM order. A pointerup on a button gives "release" (if last) then "advance"; an arrow keydown
//   gives "press" then "advance".
// - A pointer is bound to the direction it went down on until it lifts. Sliding to another button, off the pad, or to
//   the other pad changes nothing ("sliding off is tolerated", 02). A pointer that went down on no button (outside the
//   pads, or in the dead centre) holds nothing, but its pointerup still advances.
// - A pointercancel or lost capture lets that one pointer go like a pointerup, but without "advance".
// - `beginEpoch` (call it when a state starts) empties the queue and makes every pointer and key that is down stale:
//   stale ones hold nothing, and their later up emits nothing. So the tap that closed the dialogue can't count as the
//   round's first input, and can't release or advance anything either.

import { type Direction, DIRECTIONS } from "../direction.ts";

export type InputEvent =
  | { readonly kind: "press" | "release"; readonly dir: Direction }
  | { readonly kind: "advance" | "cancel" };

type Holder = number | "keyboard";

interface TrackedPointer {
  readonly dir: Direction | null;
  stale: boolean;
}

export class PointerMap {
  private readonly pointers = new Map<number, TrackedPointer>();
  // Arrow keys that are down: "live" ones hold their direction, "stale" ones only wait for their keyup.
  private readonly keys = new Map<Direction, "live" | "stale">();
  private readonly holders = new Map<Direction, Set<Holder>>(DIRECTIONS.map((dir) => [dir, new Set<Holder>()]));
  private queue: InputEvent[] = [];

  /** Whether any live pointer or key holds `dir`. For the pad view's pressed state; rules should use the events. */
  isHeld(dir: Direction): boolean {
    return this.holdersOf(dir).size > 0;
  }

  /**
   * A pointer went down on `dir`, or on no button (null). A down for an id that is already live means its up was lost:
   * the old pointer is cancelled first. A stale record with the same id is simply replaced.
   */
  pointerDown(id: number, dir: Direction | null): void {
    if (this.pointers.get(id)?.stale === false) {
      this.pointerCancel(id);
    }

    this.pointers.set(id, { dir, stale: false });

    if (dir !== null) {
      this.hold(dir, id);
    }
  }

  /** A pointer lifted normally. Unknown ids (down before the router existed, or a non-primary button) are ignored. */
  pointerUp(id: number): void {
    if (this.letPointerGo(id)) {
      this.queue.push({ kind: "advance" });
    }
  }

  /** A pointer was cancelled by the browser or lost its capture: let go like a pointerup, with no "advance". */
  pointerCancel(id: number): void {
    this.letPointerGo(id);
  }

  /**
   * A non-repeat keydown, already read by keyboard.ts: the arrow's direction (or null) and whether it advances.
   * An arrow already held live by the keyboard is not pressed again.
   */
  keyDown(dir: Direction | null, advance: boolean): void {
    if (dir !== null && this.keys.get(dir) !== "live") {
      this.keys.set(dir, "live");
      this.hold(dir, "keyboard");
    }

    if (advance) {
      this.queue.push({ kind: "advance" });
    }
  }

  /** An arrow key went up. */
  keyUp(dir: Direction): void {
    const state = this.keys.get(dir);

    this.keys.delete(dir);

    if (state === "live") {
      this.letGo(dir, "keyboard");
    }
  }

  /** Lets everything go at once (blur, hidden page). Emits "cancel" if anything was held. */
  cancelAll(): void {
    const anyHeld = DIRECTIONS.some((dir) => this.isHeld(dir));

    this.makeAllStale();

    if (anyHeld) {
      this.queue.push({ kind: "cancel" });
    }
  }

  /** Starts a new state: drops queued events and makes everything that is down stale, silently. */
  beginEpoch(): void {
    this.makeAllStale();
    this.queue = [];
  }

  /** Returns the queued events, oldest first, and empties the queue. */
  drain(): InputEvent[] {
    const events = this.queue;

    this.queue = [];

    return events;
  }

  private holdersOf(dir: Direction): Set<Holder> {
    const set = this.holders.get(dir);

    if (set === undefined) {
      throw new Error(`Unknown direction ${dir}`);
    }

    return set;
  }

  private hold(dir: Direction, holder: Holder) {
    this.holdersOf(dir).add(holder);
    this.queue.push({ kind: "press", dir });
  }

  private letGo(dir: Direction, holder: Holder) {
    const set = this.holdersOf(dir);

    if (set.delete(holder) && set.size === 0) {
      this.queue.push({ kind: "release", dir });
    }
  }

  // Forgets a pointer. Returns true if it was live, false if it was stale or unknown.
  private letPointerGo(id: number) {
    const pointer = this.pointers.get(id);

    if (pointer === undefined) {
      return false;
    }

    this.pointers.delete(id);

    if (pointer.stale) {
      return false;
    }

    if (pointer.dir !== null) {
      this.letGo(pointer.dir, id);
    }

    return true;
  }

  private makeAllStale() {
    for (const pointer of this.pointers.values()) {
      pointer.stale = true;
    }

    for (const dir of this.keys.keys()) {
      this.keys.set(dir, "stale");
    }

    for (const set of this.holders.values()) {
      set.clear();
    }
  }
}
