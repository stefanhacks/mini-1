import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createReduceFlashes,
  type FlashesStorage,
  parseReduceFlashes,
  REDUCE_FLASHES_STORAGE_KEY,
  serializeReduceFlashes,
} from "./reduce-flashes.ts";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  const storage: FlashesStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };

  return { items, storage };
};

const blocked: FlashesStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("the stored reduce-flashes flag", () => {
  it("is on only for \"1\"; anything else is the default, off", () => {
    assert.equal(parseReduceFlashes("1"), true);

    for (const raw of [null, "0", "", "true", "yes", "11"]) {
      assert.equal(parseReduceFlashes(raw), false, String(raw));
    }
  });

  it("round-trips", () => {
    for (const on of [false, true]) {
      assert.equal(parseReduceFlashes(serializeReduceFlashes(on)), on);
    }
  });
});

describe("createReduceFlashes", () => {
  it("starts off with nothing stored, and stores each toggle", () => {
    const { items, storage } = memoryStorage();
    const setting = createReduceFlashes(() => storage);

    assert.equal(setting.on, false);
    assert.equal(setting.toggle(), true);
    assert.equal(setting.on, true);
    assert.equal(items.get(REDUCE_FLASHES_STORAGE_KEY), "1");
    assert.equal(setting.toggle(), false);
    assert.equal(items.get(REDUCE_FLASHES_STORAGE_KEY), "0");
  });

  it("reads the stored value back, as a reload does", () => {
    const { storage } = memoryStorage();

    createReduceFlashes(() => storage).toggle();
    assert.equal(createReduceFlashes(() => storage).on, true);
    assert.equal(createReduceFlashes(() => memoryStorage({ [REDUCE_FLASHES_STORAGE_KEY]: "x" }).storage).on, false);
  });

  it("works for the session when storage is blocked or missing", () => {
    for (const storage of [() => blocked, () => {
      throw new ReferenceError("window is not defined");
    }]) {
      const setting = createReduceFlashes(storage);

      assert.equal(setting.on, false);
      assert.equal(setting.toggle(), true);
      assert.equal(setting.on, true);
    }
  });
});
