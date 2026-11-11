import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AudioStatus } from "../core/audio/audio-rules.ts";
import { createAudioLifecycle } from "./audio-lifecycle.ts";
import type { InputEvent } from "./input/pointer-map.ts";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** An engine whose context the test drives: `resume()` settles with whatever `resumeResult` holds then. */
class FakeEngine {
  status: AudioStatus = "running";
  log: string[] = [];
  resumes: ((running: boolean) => void)[] = [];
  listeners = new Set<(status: AudioStatus) => void>();

  setStatus(status: AudioStatus) {
    if (status !== this.status) {
      this.status = status;
      this.listeners.forEach((listener) => listener(status));
    }
  }

  suspend() {
    this.log.push("suspend");
    this.setStatus("needs-gesture");

    return Promise.resolve();
  }

  resume() {
    this.log.push("resume");

    return new Promise<boolean>((resolve) => {
      this.resumes.push(resolve);
    });
  }

  /** Settles the last resume: the context runs again, or stays suspended. */
  settleResume(running: boolean) {
    if (running) {
      this.setStatus("running");
    }

    this.resumes.at(-1)?.(running);
  }

  unlock() {
    this.log.push("unlock");
  }

  onStatusChange(listener: (status: AudioStatus) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}

const setup = () => {
  const audio = new FakeEngine();
  const view = { visible: false, setVisible: (visible: boolean) => {
    view.visible = visible;
  } };
  const page = { visible: true };
  const lifecycle = createAudioLifecycle(audio, view, () => page.visible);
  const hide = () => {
    page.visible = false;
    lifecycle.hidden();
  };
  const show = () => {
    page.visible = true;
    lifecycle.visible();
  };

  return { audio, view, page, lifecycle, hide, show };
};

const ADVANCE: InputEvent = { kind: "advance" };
const CANCEL: InputEvent = { kind: "cancel" };

describe("audio lifecycle", () => {
  it("suspends when hidden and resumes when visible, with no prompt while hidden", async () => {
    const t = setup();

    t.hide();
    await settle();
    assert.deepEqual(t.audio.log, ["suspend"]);
    assert.equal(t.audio.status, "needs-gesture");
    assert.equal(t.view.visible, false, "needs-gesture while hidden shows nothing");

    t.show();
    assert.deepEqual(t.audio.log, ["suspend", "resume"]);
    t.audio.settleResume(true);
    await settle();
    assert.equal(t.view.visible, false);
    assert.equal(t.lifecycle.prompting, false);
  });

  it("shows Tap to continue when the resume fails, and a tap unlocks and hides it", async () => {
    const t = setup();

    t.hide();
    t.show();
    t.audio.settleResume(false);
    await settle();
    assert.equal(t.view.visible, true);
    assert.equal(t.lifecycle.prompting, true);

    // The tap: its advance is queued first, then the activation runs (router-core.ts), twice on touch.
    t.lifecycle.activate();
    t.lifecycle.activate();
    assert.deepEqual(t.audio.log.filter((entry) => entry === "unlock"), ["unlock", "unlock"]);
    assert.equal(t.view.visible, true, "hidden only once audio runs");

    t.audio.setStatus("running");
    assert.equal(t.view.visible, false);
    assert.deepEqual(t.lifecycle.filter([ADVANCE, CANCEL]), [CANCEL], "the tap's advance is dropped");
    assert.deepEqual(t.lifecycle.filter([ADVANCE]), [ADVANCE], "the next tap advances");
  });

  it("drops advances drained while the prompt is up, but keeps the other events", async () => {
    const t = setup();

    t.hide();
    t.show();
    t.audio.settleResume(false);
    await settle();

    const press: InputEvent = { kind: "press", dir: "up" };
    const release: InputEvent = { kind: "release", dir: "up" };

    assert.deepEqual(t.lifecycle.filter([CANCEL, press, ADVANCE, release]), [CANCEL, press, release]);
    t.lifecycle.activate();
    assert.deepEqual(t.lifecycle.filter([ADVANCE]), []);
    t.audio.setStatus("running");
    assert.deepEqual(t.lifecycle.filter([]), []);
    assert.deepEqual(t.lifecycle.filter([ADVANCE]), [ADVANCE]);
  });

  it("drops nothing when the prompt goes away without a tap", async () => {
    const t = setup();

    t.hide();
    t.show();
    t.audio.settleResume(false);
    await settle();
    // iOS ends an interruption by itself.
    t.audio.setStatus("running");
    assert.equal(t.view.visible, false);
    assert.deepEqual(t.lifecycle.filter([ADVANCE]), [ADVANCE]);
  });

  it("ignores a resume that settles after the page hid again", async () => {
    const t = setup();

    t.hide();
    t.show();
    t.hide();
    t.audio.settleResume(false);
    await settle();
    assert.equal(t.view.visible, false);
  });

  it("shows the prompt when audio is interrupted while visible, but not while a resume is running", async () => {
    const t = setup();

    t.audio.setStatus("needs-gesture");
    assert.equal(t.view.visible, true, "iOS interrupted mid-game");
    t.audio.setStatus("running");
    assert.equal(t.view.visible, false);

    t.hide();
    t.show();
    // A late status change while the resume attempt runs.
    t.audio.setStatus("running");
    t.audio.setStatus("needs-gesture");
    assert.equal(t.view.visible, false);
    t.audio.settleResume(true);
    await settle();
    assert.equal(t.view.visible, false);
  });

  it("unlocks on a tap only while recovering and audio needs a gesture", async () => {
    const t = setup();

    t.lifecycle.activate();
    t.audio.status = "locked";
    t.lifecycle.activate();
    // The begin tap whose unlock didn't take yet: Gate's and the touchend fallback's job, not the lifecycle's.
    t.audio.status = "needs-gesture";
    t.lifecycle.activate();
    assert.deepEqual(t.audio.log, []);

    t.audio.status = "running";
    t.hide();
    t.show();
    // A tap before the resume attempt settled.
    t.lifecycle.activate();
    assert.deepEqual(t.audio.log, ["suspend", "resume", "unlock"]);
    t.audio.settleResume(true);
    await settle();
    t.lifecycle.activate();
    assert.deepEqual(t.audio.log, ["suspend", "resume", "unlock"]);
  });

  it("never shows the prompt before audio first ran", async () => {
    const audio = new FakeEngine();
    const view = { visible: false, setVisible: (visible: boolean) => {
      view.visible = visible;
    } };

    audio.status = "locked";

    const lifecycle = createAudioLifecycle(audio, view, () => true);

    // A hidden tab at the gate.
    lifecycle.hidden();
    lifecycle.visible();
    audio.resumes.at(-1)?.(false);
    await settle();
    assert.equal(view.visible, false);

    // The begin tap: unlocked, and "needs-gesture" until its resume settles (or the touchend fallback retries it).
    audio.status = "locked";
    audio.setStatus("needs-gesture");
    assert.equal(view.visible, false);
    audio.setStatus("running");
    assert.deepEqual(lifecycle.filter([ADVANCE]), [ADVANCE], "the begin tap's advance reaches Gate");

    // From now on an interruption shows it.
    audio.setStatus("needs-gesture");
    assert.equal(view.visible, true);
  });
});
