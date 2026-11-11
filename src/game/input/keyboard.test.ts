import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMuteKey, type KeyInput, keyToDirection, readKeyDown } from "./keyboard.ts";

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
  it("presses and advances on an arrow", () => {
    assert.deepEqual(readKeyDown(key("ArrowLeft")), { dir: "left", advance: true });
  });

  it("advances on any other key", () => {
    assert.deepEqual(readKeyDown(key(" ")), { dir: null, advance: true });
    assert.deepEqual(readKeyDown(key("Enter")), { dir: null, advance: true });
  });

  it("ignores auto-repeats", () => {
    assert.equal(readKeyDown(key("ArrowUp", { repeat: true })), null);
    assert.equal(readKeyDown(key("Enter", { repeat: true })), null);
  });

  it("ignores shortcuts and lone modifiers", () => {
    assert.equal(readKeyDown(key("ArrowLeft", { altKey: true })), null);
    assert.equal(readKeyDown(key("r", { ctrlKey: true })), null);
    assert.equal(readKeyDown(key("r", { metaKey: true })), null);
    assert.equal(readKeyDown(key("Shift")), null);
    assert.equal(readKeyDown(key("Control", { ctrlKey: true })), null);
  });

  it("does not advance on Escape, Tab, F1–F12, Dead, Process or Unidentified", () => {
    for (const name of ["Escape", "Tab", "F1", "F5", "F10", "F12", "Dead", "Process", "Unidentified"]) {
      assert.equal(readKeyDown(key(name)), null, name);
    }
  });

  it("still advances on F13 and other F-named keys", () => {
    assert.deepEqual(readKeyDown(key("F13")), { dir: null, advance: true });
    assert.deepEqual(readKeyDown(key("f")), { dir: null, advance: true });
  });

  it("ignores keys during an input method composition", () => {
    assert.equal(readKeyDown(key("a", { isComposing: true })), null);
    assert.equal(readKeyDown(key("ArrowUp", { isComposing: true })), null);
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
