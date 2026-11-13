import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLayout, ZERO_INSETS, type Layout } from "../core/layout.ts";
import { createLayoutBus } from "./layout-bus.ts";

const layoutOf = (width: number, height: number) => computeLayout({ width, height, insets: ZERO_INSETS, dpr: 1 });

describe("createLayoutBus", () => {
  it("publishes to every listener in subscription order, after making the layout current", () => {
    const bus = createLayoutBus(layoutOf(800, 600));
    const next = layoutOf(390, 844);
    const calls: string[] = [];

    bus.onLayout((layout) => calls.push(`a:${layout === next && bus.current === next}`));
    bus.onLayout(() => calls.push("b"));
    bus.publish(next);

    assert.deepEqual(calls, ["a:true", "b"]);
    assert.equal(bus.current, next);
  });

  it("onLayout doesn't call the listener at once; follow does, with the current layout", () => {
    const initial = layoutOf(800, 600);
    const bus = createLayoutBus(initial);
    const seen: Layout[] = [];

    bus.onLayout((layout) => seen.push(layout));
    assert.equal(seen.length, 0);
    bus.follow((layout) => seen.push(layout));
    assert.deepEqual(seen, [initial]);
    assert.equal(bus.listenerCount, 2);
  });

  it("unsubscribes, for onLayout and follow alike", () => {
    const bus = createLayoutBus(layoutOf(800, 600));
    let calls = 0;
    const off = bus.onLayout(() => calls++);
    const unfollow = bus.follow(() => calls++);

    off();
    unfollow();
    bus.publish(layoutOf(390, 844));

    assert.equal(calls, 1);
    assert.equal(bus.listenerCount, 0);
  });
});
