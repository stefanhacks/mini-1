import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIPS, TARGETS } from "../../assets/anims.ts";
import { snapToArtPixels } from "../art-grid.ts";
import { GameClock } from "../clock.ts";
import type { Clip } from "./clip.ts";
import { evaluateCurve } from "./hermite.ts";
import { createClipPlayer, type AnimNode } from "./player.ts";

// A 32×32 centre-anchored sprite, as the boat.
const sprite = (size = 32): AnimNode => ({
  alpha: 1,
  rotation: 0,
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
  width: size,
  height: size,
});

const BOAT = TARGETS["Stage/Barco Inteiro/InteiroSprite"];

const eventsOnly = (length: number, loop: boolean, events: [number, string][]): Clip => ({
  name: "Test",
  length,
  loop,
  legacy: false,
  controllers: [],
  curves: [],
  sprites: [],
  events: events.map(([time, functionName]) => ({ time, functionName })),
});

const curveKeys = (clip: Clip, attribute: string) => {
  const curve = clip.curves.find((candidate) => candidate.attribute === attribute);

  assert.ok(curve !== undefined);

  return curve.keys;
};

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

describe("createClipPlayer: poses", () => {
  it("bobs and tilts the boat from its Main.unity origin, on whole art pixels (Barco)", () => {
    const player = createClipPlayer();
    const boat = sprite();

    player.play(CLIPS.barco, { node: boat, origin: BOAT.parentOrigin });

    // The first key reproduces the boat's static place: 309.5 snaps to 310, as positions.ts.
    player.sync(0);
    assert.deepEqual(boat.position, { x: 250, y: 310 });
    assert.equal(boat.rotation, 0);

    // 0.8 s: y −1.5 (down 1.5 art px: 311 on the grid), tilted +7° in Unity, so −7° (clockwise is +) in Pixi.
    player.sync(800);
    assert.deepEqual(boat.position, { x: 250, y: 311 });
    close(boat.rotation, (-7 * Math.PI) / 180);

    // 0.4 s: y −0.9375 → 310.4375, still 310 on the grid.
    player.sync(2600 + 400);
    assert.deepEqual(boat.position, { x: 250, y: 310 });
  });

  it("wraps a looping clip by its length", () => {
    const player = createClipPlayer();
    const [a, b] = [sprite(), sprite()];

    player.play(CLIPS.barco, { node: a, origin: BOAT.parentOrigin });
    player.sync(0);
    player.sync(3 * 2600 + 1234);

    const once = createClipPlayer();

    once.play(CLIPS.barco, { node: b, origin: BOAT.parentOrigin });
    once.sync(0);
    once.sync(1234);
    assert.deepEqual(a.position, b.position);
    // 9.034 % 2.6 is 1.234 give or take float noise.
    assert.ok(Math.abs(a.rotation - b.rotation) < 1e-12);
  });

  it("moves only the axes the clip animates (Clouds: x only)", () => {
    const player = createClipPlayer();
    const clouds = sprite(500);

    clouds.position.y = 73;
    player.play(CLIPS.clouds, { node: clouds, origin: TARGETS["Stage/Sky"].anchorOrigin });
    player.sync(0);
    assert.deepEqual(clouds.position, { x: 250, y: 73 });
    // 2.5 s of a linear 0 → −84 over 10 s: −21.
    player.sync(2500);
    assert.deepEqual(clouds.position, { x: 229, y: 73 });
  });

  it("sets alpha and scale unsnapped, scale times baseScale", () => {
    const player = createClipPlayer();
    const arrow = sprite(24);

    player.play(CLIPS.arrowMany, { node: arrow, baseScale: { x: -2, y: 2 } });
    player.sync(0);
    player.sync(400);

    const t = 0.4;
    const expectedScale = evaluateCurve(curveKeys(CLIPS.arrowMany, "m_LocalScale.x"), t);

    close(arrow.alpha, evaluateCurve(curveKeys(CLIPS.arrowMany, "m_Color.a"), t));
    close(arrow.scale.x, -2 * expectedScale);
    close(arrow.scale.y, 2 * expectedScale);
    assert.deepEqual(arrow.position, { x: 0, y: 0 });
  });

  it("ignores m_SizeDelta.y unless the binding gives a base height", () => {
    const player = createClipPlayer();
    const [unbound, bound] = [sprite(500), sprite(500)];
    const origin = TARGETS["Stage/Sea/Back"].anchorOrigin;

    player.play(CLIPS.seaAnimTres, { node: unbound, origin });
    player.play(CLIPS.seaAnimTres, { node: bound, origin, baseHeight: 180 });
    player.sync(0);
    assert.equal(unbound.scale.y, 1);
    // SeaAnimTrês holds the size delta at 0.
    assert.equal(bound.scale.y, 0);
  });

  it("animates a child by its curve path (BarcoQuebradoJogadoCima → QuebradoSprite)", () => {
    const player = createClipPlayer();
    const root = sprite();
    const broken = sprite(42);
    const target = TARGETS["Stage/Barco Quebrado/QuebradoSprite"];

    player.play(CLIPS.barcoQuebradoJogadoCima, {
      node: root,
      children: { QuebradoSprite: { node: broken, origin: target.parentOrigin } },
    });
    player.sync(0);
    assert.deepEqual(broken.position, { x: 250, y: 294 });
    assert.deepEqual(root.position, { x: 0, y: 0 });
  });

  it("keeps the last pose of a one-shot clip and drops it", () => {
    const player = createClipPlayer();
    const bolt = sprite();
    let ended = 0;

    player.play(CLIPS.flash, { node: bolt }, { onEnd: () => ended++ });
    player.sync(0);
    player.sync(10_000);
    assert.equal(bolt.alpha, curveKeys(CLIPS.flash, "m_Color.a").at(-1)?.value);
    assert.equal(ended, 1);
    assert.equal(player.active, 0);
  });
});

describe("createClipPlayer: time", () => {
  it("fires each event once, in order, then onEnd (Fim)", () => {
    const player = createClipPlayer();
    const log: string[] = [];

    const handle = player.play(CLIPS.fim, { node: sprite() }, {
      onEvent: (name) => log.push(name),
      onEnd: () => log.push("end"),
    });

    for (let now = 0; now <= 12_000; now += 100) {
      player.sync(now);
    }

    assert.deepEqual(log, ["FimBarco", "FimKraken", "FimFade", "FimFinal", "end"]);
    assert.equal(handle.done, true);
  });

  it("fires events across loop wraps, the one at 0 at every cycle start", () => {
    const player = createClipPlayer();
    const log: string[] = [];

    player.play(eventsOnly(1, true, [[0, "a"], [0.5, "b"]]), { node: sprite() }, { onEvent: (name) => log.push(name) });

    player.sync(0);
    assert.deepEqual(log, ["a"]);
    player.sync(600);
    assert.deepEqual(log, ["a", "b"]);
    player.sync(1000);
    assert.deepEqual(log, ["a", "b", "a"]);
    player.sync(2100);
    assert.deepEqual(log, ["a", "b", "a", "b", "a"]);
    // The same time again fires nothing.
    player.sync(2100);
    assert.equal(log.length, 5);
  });

  it("plays at a speed (the ending card's half speed)", () => {
    const player = createClipPlayer();
    const log: string[] = [];

    player.play(CLIPS.fim, { node: sprite() }, { speed: 0.5, onEvent: (name) => log.push(name) });
    player.sync(0);
    // FimBarco at 0.5833333 clip s is 1166.67 game ms at half speed.
    player.sync(1150);
    assert.deepEqual(log, []);
    player.sync(1200);
    assert.deepEqual(log, ["FimBarco"]);
  });

  it("can loop a one-shot clip, or play a looping one once", () => {
    const player = createClipPlayer();
    const once = player.play(CLIPS.barco, { node: sprite(), origin: BOAT.parentOrigin }, { loop: false });
    const looped = player.play(eventsOnly(1, false, []), { node: sprite() }, { loop: true });

    player.sync(0);
    player.sync(5000);
    assert.equal(once.done, true);
    assert.equal(looped.done, false);
  });

  it("stops a clip where it is, without onEnd", () => {
    const player = createClipPlayer();
    const boat = sprite();
    let ended = false;

    const handle = player.play(CLIPS.barco, { node: boat, origin: BOAT.parentOrigin }, { onEnd: () => (ended = true) });

    player.sync(0);
    player.sync(800);
    handle.stop();
    player.sync(1600);
    assert.deepEqual(boat.position, { x: 250, y: 311 });
    assert.equal(handle.done, true);
    assert.equal(ended, false);
    assert.equal(player.active, 0);
  });

  it("clears every clip", () => {
    const player = createClipPlayer();
    const handles = [CLIPS.flash, CLIPS.raio].map((clip) => player.play(clip, { node: sprite() }));

    assert.equal(player.active, 2);
    player.clear();
    assert.equal(player.active, 0);
    assert.ok(handles.every((handle) => handle.done));
  });

  it("follows the game clock: frozen while paused, started at the clock's time", () => {
    const clock = new GameClock();
    const player = createClipPlayer(clock);
    const boat = sprite();

    clock.tick(1000);
    player.play(CLIPS.barco, { node: boat, origin: BOAT.parentOrigin });
    clock.tick(800);
    player.sync(clock.now);
    assert.deepEqual(boat.position, { x: 250, y: 311 });

    clock.paused = true;
    clock.tick(500);
    player.sync(clock.now);
    assert.deepEqual(boat.position, { x: 250, y: 311 });

    clock.paused = false;
    clock.tick(400);
    player.sync(clock.now);
    close(boat.rotation, (evaluateCurve(curveKeys(CLIPS.barco, "localEulerAnglesRaw.z"), 1.2) * -Math.PI) / 180);
  });

  it("starts at the next sync without a clock", () => {
    const player = createClipPlayer();
    const log: string[] = [];

    player.sync(5000);
    player.play(eventsOnly(1, false, [[0, "start"]]), { node: sprite() }, { onEvent: (name) => log.push(name) });
    player.sync(7000);
    assert.deepEqual(log, ["start"]);
    assert.equal(player.active, 1);
    player.sync(8000);
    assert.equal(player.active, 0);
  });

  it("starts a clip from an event at that event's time, in the same sync", () => {
    const player = createClipPlayer();
    const broken = sprite(42);
    const target = TARGETS["Stage/Barco Quebrado/QuebradoSprite"];

    player.play(CLIPS.fim, { node: sprite() }, {
      onEvent: (name) => {
        if (name === "FimBarco") {
          player.play(CLIPS.barcoQuebradoJogadoCima, {
            node: sprite(),
            children: { QuebradoSprite: { node: broken, origin: target.parentOrigin } },
          });
        }
      },
    });
    player.sync(0);
    player.sync(1000);

    // 1000 − 583.3333 ms into the throw, not 1000 (the frame's time) nor 0 (the next sync).
    const y = evaluateCurve(curveKeys(CLIPS.barcoQuebradoJogadoCima, "m_LocalPosition.y"), 1 - 0.5833333);

    assert.equal(player.active, 2);
    assert.equal(broken.position.y, snapToArtPixels(target.parentOrigin.y - y, 0.5, 42));
  });

  it("changes speed mid-loop from the last synced pose, with no jump (reduced motion)", () => {
    // The boat's tilt is unsnapped: its pose at clip time `ms`, from a player that never changed speed.
    const tiltAt = (ms: number) => {
      const reference = createClipPlayer();
      const node = sprite();

      reference.play(CLIPS.barco, { node, origin: BOAT.parentOrigin });
      reference.sync(0);
      reference.sync(ms);

      return node.rotation;
    };
    const player = createClipPlayer();
    const boat = sprite();
    const handle = player.play(CLIPS.barco, { node: boat, origin: BOAT.parentOrigin });

    player.sync(0);
    player.sync(1000);
    close(boat.rotation, tiltAt(1000));
    handle.setSpeed(0.5);
    // The same frame again: the same pose. Then half the clip's time per game second.
    player.sync(1000);
    close(boat.rotation, tiltAt(1000));
    player.sync(3000);
    close(boat.rotation, tiltAt(2000));
    // Back to full speed, past the loop's wrap at 2.6 s: 2 s + 1.5 s is 0.9 s into the next cycle.
    handle.setSpeed(1);
    player.sync(4500);
    close(boat.rotation, tiltAt(900));
  });

  it("keeps events and the end on time after a speed change, and takes a speed set before the first sync", () => {
    const player = createClipPlayer();
    const fired: number[] = [];
    let endedAt = NaN;
    let now = 0;
    const handle = player.play(eventsOnly(2, false, [[0.5, "a"], [1.5, "b"]]), { node: sprite() }, {
      onEvent: () => fired.push(now),
      onEnd: () => {
        endedAt = now;
      },
    });

    for (now = 0; now <= 1000; now += 100) {
      player.sync(now);
    }

    // 1 s of clip time played; the last second takes 2 s at half speed.
    handle.setSpeed(0.5);

    for (now = 1100; now <= 3000; now += 100) {
      player.sync(now);
    }

    assert.deepEqual(fired, [500, 2000]);
    assert.equal(endedAt, 3000);

    const late = player.play(eventsOnly(1, false, []), { node: sprite() }, { onEnd: () => fired.push(-1) });

    late.setSpeed(2);
    player.sync(3000);
    player.sync(3500);
    assert.equal(late.done, true);
    assert.throws(() => late.setSpeed(Number.NaN), RangeError);
  });

  it("never fires an event twice after its callback throws", () => {
    const player = createClipPlayer();
    let calls = 0;

    player.play(eventsOnly(1, false, [[0.1, "boom"]]), { node: sprite() }, {
      onEvent: () => {
        calls++;
        throw new Error("boom");
      },
    });
    player.sync(0);
    assert.throws(() => player.sync(200), /boom/);
    player.sync(300);
    assert.equal(calls, 1);
  });

  it("rejects a bad speed, a missing child and a position curve with no origin", () => {
    const player = createClipPlayer();

    assert.throws(() => player.play(CLIPS.flash, { node: sprite() }, { speed: 0 }), RangeError);
    assert.throws(() => player.play(CLIPS.barcoQuebradoJogadoCima, { node: sprite() }), /no child "QuebradoSprite"/);
    assert.throws(() => player.play(CLIPS.barco, { node: sprite() }), /no origin/);
    assert.equal(player.active, 0);
  });
});
