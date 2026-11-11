import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIPS } from "../../assets/anims.ts";
import { createClipPlayer } from "../../core/anim/player.ts";
import { createFades, faded, type FadeNode } from "./fades.ts";

const node = (): FadeNode => ({
  visible: false,
  alpha: 1,
  rotation: 0,
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  width: 10,
  height: 10,
});

const setup = () => {
  const clock = { now: 0 };
  const player = createClipPlayer(clock);
  const fades = createFades(player);
  const at = (ms: number) => {
    clock.now = ms;
    player.sync(ms);
  };

  return { player, fades, at };
};

describe("createFades", () => {
  it("cuts: shown at alpha 1, hidden invisible at alpha 0", () => {
    const { fades } = setup();
    const black = node();

    fades.show(black);
    assert.deepEqual([black.visible, black.alpha], [true, 1]);
    fades.hide(black);
    assert.deepEqual([black.visible, black.alpha], [false, 0]);
  });

  it("fades in visible from alpha 0, and fades out to invisible at alpha 0", () => {
    const { fades, at } = setup();
    const black = node();

    fades.show(black, faded({ speed: 1 }, CLIPS.fadeIn));
    assert.equal(black.visible, true);
    at(0);
    assert.equal(black.alpha, 0);
    at(500);
    assert.ok(black.alpha > 0.4 && black.alpha < 0.6, `${black.alpha}`);
    at(1000);
    assert.equal(black.alpha, 1);

    fades.hide(black, faded({ speed: 1 }, CLIPS.fadeOut));
    at(1500);
    assert.equal(black.visible, true, "visible while it fades out");
    at(2000);
    assert.deepEqual([black.visible, black.alpha], [false, 0]);
  });

  it("plays at the fade's speed: half speed takes 2 s", () => {
    const { fades, at } = setup();
    const logo = node();

    fades.show(logo, faded({ speed: 0.5 }, CLIPS.fadeIn));
    at(1000);
    assert.ok(logo.alpha > 0.4 && logo.alpha < 0.6, `${logo.alpha}`);
    at(2000);
    assert.equal(logo.alpha, 1);
  });

  it("does nothing when asked for what it shows or fades to, and a new call cuts the running fade", () => {
    const { fades, player, at } = setup();
    const credits = node();

    fades.show(credits, faded({ speed: 1 }, CLIPS.tmpFadeIn));
    at(400);

    const alpha = credits.alpha;

    fades.show(credits, faded({ speed: 1 }, CLIPS.tmpFadeIn));
    at(400);
    assert.equal(credits.alpha, alpha, "not restarted");
    assert.equal(player.active, 1);

    fades.hide(credits);
    assert.deepEqual([credits.visible, credits.alpha, player.active], [false, 0, 0]);
    at(1000);
    assert.equal(credits.alpha, 0, "the cut fade-in doesn't come back");
  });

  it("runs `then` after the fade-in, or at once for a cut, never after a fade cut short", () => {
    const { fades, at } = setup();
    const prompt = node();
    const other = node();
    const calls: string[] = [];

    fades.show(prompt, faded({ speed: 1 }, CLIPS.tmpFadeIn), () => calls.push("prompt"));
    fades.show(other, undefined, () => calls.push("other"));
    assert.deepEqual(calls, ["other"]);
    at(999);
    assert.deepEqual(calls, ["other"]);
    at(1000);
    assert.deepEqual(calls, ["other", "prompt"]);

    fades.hide(prompt);
    fades.show(prompt, faded({ speed: 1 }, CLIPS.tmpFadeIn), () => calls.push("again"));
    fades.hide(prompt);
    at(3000);
    assert.deepEqual(calls, ["other", "prompt"]);
  });

  it("keeps one clip per node: `play` replaces it, and a hide stops a loop", () => {
    const { fades, player, at } = setup();
    const prompt = node();

    fades.show(prompt);
    fades.play(prompt, { clip: CLIPS.tmpIdle, speed: 1 });
    at(800);
    assert.ok(prompt.alpha < 0.7, "pulsing");
    assert.equal(player.active, 1);
    fades.hide(prompt, faded({ speed: 1 }, CLIPS.tmpFadeOut));
    assert.equal(player.active, 1, "the fade-out replaced the pulse");
    at(2000);
    assert.deepEqual([prompt.visible, prompt.alpha, player.active], [false, 0, 0]);
  });

  it("lets a cut win over a running fade: a hide cut ends a fade-out, a show cut a fade-in", () => {
    const { fades, player, at } = setup();
    const prompt = node();

    fades.show(prompt);
    fades.hide(prompt, faded({ speed: 1 }, CLIPS.tmpFadeOut));
    at(300);
    fades.hide(prompt);
    assert.deepEqual([prompt.visible, prompt.alpha, player.active], [false, 0, 0]);

    const calls: string[] = [];

    fades.show(prompt, faded({ speed: 1 }, CLIPS.tmpFadeIn), () => calls.push("faded"));
    at(600);
    fades.show(prompt, undefined, () => calls.push("cut"));
    assert.deepEqual([prompt.visible, prompt.alpha, player.active], [true, 1, 0]);
    at(2000);
    assert.deepEqual([prompt.alpha, calls], [1, ["cut"]]);

    // Once shown or hidden, a cut asks for nothing new.
    fades.play(prompt, { clip: CLIPS.tmpIdle, speed: 1 });
    fades.show(prompt);
    assert.equal(player.active, 1, "the pulse goes on");
  });

  it("fades out from the alpha a cut-short fade-in reached, over the clip's full length", () => {
    const { fades, at } = setup();
    const credits = node();

    fades.show(credits, faded({ speed: 1 }, CLIPS.tmpFadeIn));
    at(500);

    const reached = credits.alpha;

    assert.ok(reached > 0.4 && reached < 0.6, `${reached}`);
    fades.hide(credits, faded({ speed: 1 }, CLIPS.tmpFadeOut));
    at(500);
    assert.equal(credits.alpha, reached, "no jump to 1");
    at(1000);
    assert.ok(credits.alpha > 0 && credits.alpha < reached, `${credits.alpha}`);
    at(1500);
    assert.deepEqual([credits.visible, credits.alpha], [false, 0]);

    // From a finished fade-in or a cut, it starts from 1, as the clip does.
    fades.show(credits);
    fades.hide(credits, faded({ speed: 1 }, CLIPS.tmpFadeOut));
    at(1500);
    assert.equal(credits.alpha, 1);
  });
});
