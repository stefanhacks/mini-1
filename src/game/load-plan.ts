// What the start gate loads: named parts (sprites, font, audio), each with a weight for the progress bar, loaded in
// parallel; a retry re-runs only the parts that failed. Pure TypeScript with no Pixi import, so it runs under
// `node --test`. main.ts builds the parts from Pixi's Assets and the audio engine. Written by Claude Code.

export interface LoadPart {
  /** Its share of the progress bar, relative to the other parts (roughly its size). Must be positive. */
  readonly weight: number;
  /**
   * Loads whatever of the part isn't loaded yet, reporting its own progress (0..1). Called again after a rejection,
   * so it must retry only what failed, or everything if it can't tell.
   */
  load(onProgress: (fraction: number) => void): Promise<void>;
}

export interface LoadPlan<Key extends string> {
  /**
   * Loads every part not loaded yet, in parallel, reporting the weighted progress of all of them (0..1, never going
   * down within one run; loaded parts count as whole). Resolves once all are loaded; rejects with the first failure
   * once every part has settled. Calling it again retries just the failed parts. Concurrent calls share one run (the
   * later call's `onProgress` is not called).
   */
  load(onProgress?: (fraction: number) => void): Promise<void>;
  /** Whether `key` has loaded. */
  isLoaded(key: Key): boolean;
}

const clampFraction = (value: number) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);

export const createLoadPlan = <Key extends string>(parts: Readonly<Record<Key, LoadPart>>): LoadPlan<Key> => {
  const keys = Object.keys(parts) as Key[];
  const total = keys.reduce((sum, key) => sum + parts[key].weight, 0);
  const loaded = new Set<Key>();
  let running: Promise<void> | null = null;

  if (!(total > 0) || keys.some((key) => !(parts[key].weight > 0))) {
    throw new RangeError("Every load part needs a positive weight");
  }

  const run = async (onProgress: (fraction: number) => void) => {
    const fractions = new Map<Key, number>(keys.map((key) => [key, loaded.has(key) ? 1 : 0]));
    let reported = -1;

    const report = () => {
      const sum = keys.reduce((acc, key) => acc + parts[key].weight * (fractions.get(key) ?? 0), 0);
      const fraction = Math.max(reported, clampFraction(sum / total));

      if (fraction !== reported) {
        reported = fraction;
        onProgress(fraction);
      }
    };

    report();

    const pending = keys.filter((key) => !loaded.has(key));
    const results = await Promise.allSettled(pending.map(async (key) => {
      await parts[key].load((fraction) => {
        // A part's progress never goes down within a run either.
        fractions.set(key, Math.max(fractions.get(key) ?? 0, clampFraction(fraction)));
        report();
      });
      loaded.add(key);
      fractions.set(key, 1);
      report();
    }));
    const failure = results.find((result) => result.status === "rejected");

    if (failure !== undefined) {
      throw failure.reason;
    }
  };

  return {
    load: (onProgress = () => undefined) => {
      running ??= run(onProgress).finally(() => {
        running = null;
      });

      return running;
    },
    isLoaded: (key) => loaded.has(key),
  };
};
