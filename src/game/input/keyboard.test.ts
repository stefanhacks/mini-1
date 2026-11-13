import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMuteKey, isPauseKey, type KeyInput, keyToDirection, readKeyDown } from "./keyboard.ts";

const key = (name: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key: name,
  repeat: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});

describe("keyToDirection", () => {
  it("maps the four arrows and nothing else", () => {
    assert.equal(keyToDirection("ArrowUp"), "up");
    assert.equal(keyToDirection("ArrowDown"), "down");
    assert.equal(keyToDirection("ArrowLeft"), "left");
    assert.equal(keyToDirection("ArrowRight"), "right");
    assert.equal(keyToDirection("w"), null);
    assert.equal(keyToDirection("toString"), null);
  });
});

describe("readKeyDown", () => {
  it("presses and advances on an arrow, and advances on any other key, F13 and other F-named keys included", () => {
    const CASES: readonly (readonly [name: string, dir: "left" | null])[] = [
      ["ArrowLeft", "left"],
      [" ", null],
      ["Enter", null],
      ["F13", null],
      ["f", null],
    ];

    for (const [name, dir] of CASES) {
      assert.deepEqual(readKeyDown(key(name)), { dir, advance: true }, JSON.stringify(name));
    }
  });

  it("ignores repeats, shortcuts, lone modifiers, compositions, Escape, Tab, F1–F12, Dead, Process", () => {
    const CASES: readonly (readonly [name: string, extra: Partial<KeyInput>])[] = [
      ["ArrowUp", { repeat: true }],
      ["Enter", { repeat: true }],
      ["ArrowLeft", { altKey: true }],
      ["r", { ctrlKey: true }],
      ["r", { metaKey: true }],
      ["Shift", {}],
      ["Control", { ctrlKey: true }],
      ...["Escape", "Tab", "F1", "F5", "F10", "F12", "Dead", "Process", "Unidentified"].map(
        (name) => [name, {}] as const,
      ),
      ["a", { isComposing: true }],
      ["ArrowUp", { isComposing: true }],
    ];

    for (const [name, extra] of CASES) {
      assert.equal(readKeyDown(key(name, extra)), null, `${name} ${JSON.stringify(extra)}`);
    }
  });
});

describe("isMuteKey", () => {
  it("is M in either case, but not a repeat, a composition or a shortcut", () => {
    assert.equal(isMuteKey(key("m")), true);
    assert.equal(isMuteKey(key("M")), true);
    assert.equal(isMuteKey(key("n")), false);
    assert.equal(isMuteKey(key("m", { repeat: true })), false);
    assert.equal(isMuteKey(key("m", { isComposing: true })), false);
    assert.equal(isMuteKey(key("m", { ctrlKey: true })), false);
    assert.equal(isMuteKey(key("m", { metaKey: true })), false);
  });
});

describe("isPauseKey", () => {
  it("is Escape or P in either case, but not a repeat, a composition or a shortcut", () => {
    assert.equal(isPauseKey(key("Escape")), true);
    assert.equal(isPauseKey(key("p")), true);
    assert.equal(isPauseKey(key("P")), true);
    assert.equal(isPauseKey(key("m")), false);
    assert.equal(isPauseKey(key("p", { repeat: true })), false);
    assert.equal(isPauseKey(key("Escape", { isComposing: true })), false);
    assert.equal(isPauseKey(key("p", { ctrlKey: true })), false);
    assert.equal(isPauseKey(key("Escape", { metaKey: true })), false);
  });
});
