// The compass pad view: one cross of four buttons per pad, drawn with Graphics in the ui layer (CSS px) until there is
// art for it. It only draws: input is the DOM router's job (src/game/input/), so nothing here is interactive. Geometry
// comes from pad-geometry.ts and the look from pad-view-style.ts, so art and hit-testing never disagree.

import { Container, Graphics } from "pixi.js";
import { DIRECTIONS, type Direction } from "./direction.ts";
import type { Pad } from "./input/pad-geometry.ts";
import { buttonArt, buttonStyle, DIMMED_ALPHA } from "./pad-view-style.ts";

export interface PadView {
  /**
   * Rebuild/reposition for new pads (call from onLayout with computePads(layout)). Pass `layout.dpr` to snap the art to
   * whole device pixels; without it the art snaps to whole CSS px.
   */
  setPads(pads: readonly Pad[], dpr?: number): void;
  /** Shown only during rounds (owner decision 4). */
  setVisible(visible: boolean): void;
  /** Dimmed (not yet interactive), e.g. during the Transition before the first challenge. */
  setDimmed(dimmed: boolean): void;
  /**
   * Called every frame: draw each direction pressed when isHeld(dir) is true, on ALL pads (dual landscape pads show the
   * same state). Redraws only when the held set changes.
   */
  update(isHeld: (dir: Direction) => boolean): void;
  /** Optional emphasis of the expected direction (e.g. the current Hold/Many direction); null clears. */
  setHint(dir: Direction | null): void;
  destroy(): void;
}

// One bit per direction, in DIRECTIONS order.
const heldMask = (isHeld: (dir: Direction) => boolean) =>
  DIRECTIONS.reduce((mask, dir, index) => (isHeld(dir) ? mask | (1 << index) : mask), 0);

const isInMask = (mask: number, dir: Direction) => (mask & (1 << DIRECTIONS.indexOf(dir))) !== 0;

const drawPad = (graphics: Graphics, pad: Pad, dpr: number, held: number, hint: Direction | null) => {
  graphics.clear();

  if (pad.size <= 0) {
    return;
  }

  for (const dir of DIRECTIONS) {
    const { body, radius, outlineWidth, arrow } = buttonArt(pad.buttons[dir], dir, dpr);
    const style = buttonStyle(isInMask(held, dir), dir === hint);

    graphics
      .roundRect(body.x, body.y, body.width, body.height, radius)
      .fill({ color: style.fill, alpha: style.fillAlpha })
      .stroke({ width: outlineWidth, color: style.outline, alpha: style.outlineAlpha, alignment: 1 });
    graphics.poly([...arrow]).fill({ color: style.arrow });
  }
};

/** Builds the pad view inside `parent` (the ui layer). It starts hidden, undimmed, with no pads: call `setPads`. */
export const createPadView = (parent: Container): PadView => {
  const root = new Container({ label: "pad-view", visible: false });
  const views: Graphics[] = [];
  let pads: readonly Pad[] = [];
  let dpr = 1;
  let held = 0;
  let hint: Direction | null = null;

  root.eventMode = "none";
  root.interactiveChildren = false;
  parent.addChild(root);

  const redraw = () => {
    pads.forEach((pad, index) => drawPad(views[index], pad, dpr, held, hint));
  };

  return {
    setPads(nextPads, nextDpr = 1) {
      pads = nextPads;
      dpr = nextDpr;

      while (views.length < pads.length) {
        views.push(root.addChild(new Graphics({ label: `pad-${views.length}`, eventMode: "none" })));
      }

      for (const extra of views.splice(pads.length)) {
        extra.destroy();
      }

      redraw();
    },
    setVisible(visible) {
      root.visible = visible;
    },
    setDimmed(dimmed) {
      root.alpha = dimmed ? DIMMED_ALPHA : 1;
    },
    update(isHeld) {
      const next = heldMask(isHeld);

      if (next !== held) {
        held = next;
        redraw();
      }
    },
    setHint(dir) {
      if (dir !== hint) {
        hint = dir;
        redraw();
      }
    },
    destroy() {
      root.destroy({ children: true });
      views.length = 0;
      pads = [];
    },
  };
};
