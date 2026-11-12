import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Container } from "pixi.js";
import { countChildren, removeChildrenAddedSince } from "./scene-rollback.ts";

const labelsOf = (parent: Container) => parent.children.map((child) => child.label);

describe("removeChildrenAddedSince", () => {
  it("removes and destroys only what each parent got after the count", () => {
    const world = new Container({ label: "world", children: [new Container({ label: "sea" })] });
    const ui = new Container({ label: "ui", children: [new Container({ label: "pad" })] });
    const parents = [world, ui];
    const counts = countChildren(parents);
    const added = new Container({ label: "boat", children: [new Container({ label: "sail" })] });

    world.addChild(added);
    ui.addChild(new Container({ label: "text" }), new Container({ label: "prompt" }));
    removeChildrenAddedSince(parents, counts);

    assert.deepEqual(labelsOf(world), ["sea"]);
    assert.deepEqual(labelsOf(ui), ["pad"]);
    assert.equal(added.destroyed, true);
    assert.equal(world.children[0]?.destroyed, false);
  });

  it("leaves a non-empty parent that got nothing new alone, instead of throwing", () => {
    const world = new Container({ label: "world", children: [new Container({ label: "sea" })] });
    const ui = new Container({ label: "ui", children: [new Container({ label: "pad" })] });
    const parents = [world, ui];
    const counts = countChildren(parents);

    world.addChild(new Container({ label: "boat" }));

    assert.doesNotThrow(() => removeChildrenAddedSince(parents, counts));
    assert.deepEqual(labelsOf(world), ["sea"]);
    assert.deepEqual(labelsOf(ui), ["pad"]);
  });
});
