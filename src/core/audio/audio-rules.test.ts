import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMuted, randomPitch, serializeMuted, sourceParams, statusFor } from "./audio-rules.ts";

describe("sourceParams", () => {
  it("passes a loop's offset and loop points, and no duration", () => {
    const params = sourceParams({ url: "a", offset: 0.1, duration: 9.6, loop: true, loopStart: 0.1, loopEnd: 9.7 });

    assert.deepEqual(params, { offset: 0.1, loop: true, loopStart: 0.1, loopEnd: 9.7 });
    assert.equal("duration" in params, false);
  });

  it("plays a one-shot from its offset to the end of the buffer", () => {
    const params = sourceParams({ url: "a", offset: 0.1, duration: 2.7, loop: false });

    assert.deepEqual(params, { offset: 0.1, loop: false, loopStart: 0, loopEnd: 0 });
  });
});

describe("mute persistence", () => {
  it("round-trips", () => {
    assert.equal(parseMuted(serializeMuted(true)), true);
    assert.equal(parseMuted(serializeMuted(false)), false);
  });

  it("defaults to unmuted for missing or unknown values", () => {
    for (const raw of [null, "", "true", "yes", "01", " 1"]) {
      assert.equal(parseMuted(raw), false, `raw ${JSON.stringify(raw)}`);
    }
  });
});

describe("statusFor", () => {
  it("is locked until unlocked, whatever the context says", () => {
    assert.equal(statusFor("running", false), "locked");
    assert.equal(statusFor("suspended", false), "locked");
  });

  it("maps running to running and everything else but closed to needs-gesture", () => {
    assert.equal(statusFor("running", true), "running");
    assert.equal(statusFor("suspended", true), "needs-gesture");
    assert.equal(statusFor("interrupted", true), "needs-gesture");
    assert.equal(statusFor("something-new", true), "needs-gesture");
  });

  it("maps closed to closed, locked or not", () => {
    assert.equal(statusFor("closed", true), "closed");
    assert.equal(statusFor("closed", false), "closed");
  });
});

describe("randomPitch", () => {
  it("maps the RNG's [0, 1) onto 0.95..1.05", () => {
    assert.equal(randomPitch(() => 0), 0.95);
    assert.ok(Math.abs(randomPitch(() => 0.5) - 1) < 1e-12);
    assert.ok(Math.abs(randomPitch(() => 0.999999) - 1.05) < 1e-6);
  });

  it("clamps an RNG that leaves [0, 1]", () => {
    assert.equal(randomPitch(() => -3), 0.95);
    assert.ok(Math.abs(randomPitch(() => 7) - 1.05) < 1e-12);
  });
});
