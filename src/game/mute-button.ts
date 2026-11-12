// The mute button's view: a speaker drawn with Graphics in the ui layer (CSS px), with a slash when muted. It only
// draws: the input router hit-tests the same rect (input/mute-geometry.ts) before the pads, so nothing here is
// interactive. Static, like the rest of M3's ui. Written by Claude Code.

import { Container, Graphics } from "pixi.js";
import { snapToDevicePixels, type Layout } from "../core/layout.ts";
import { muteButtonRect, muteIconBox } from "./input/mute-geometry.ts";
import { VOICE_GREY } from "./story/script.ts";

export interface MuteButtonView {
  /** Follows a new layout. Call it from onLayout. Hidden while the layout has no room for it. */
  setLayout(layout: Layout): void;
  setMuted(muted: boolean): void;
  readonly graphics: Graphics;
}

/** The icon's colour: the voice grey, as the pad's outlines, so it stays out of the way. */
const ICON_COLOR = VOICE_GREY;

/** Stroke width in CSS px, before snapping. */
const STROKE = 2;

/** Maps a point on the icon's 24-unit grid to snapped screen CSS px, as [x, y]. */
type IconPoint = (x: number, y: number) => number[];

/** The speaker: a small box and its cone, on the left of the icon box (24-unit grid). */
const drawSpeaker = (graphics: Graphics, at: IconPoint) => {
  graphics.poly([...at(3, 9), ...at(7, 9), ...at(12, 4), ...at(12, 20), ...at(7, 15), ...at(3, 15)])
    .fill({ color: ICON_COLOR });
};

/** Two sound waves. */
const drawWaves = (graphics: Graphics, at: IconPoint, unit: number, width: number) => {
  const [cx, cy] = at(12, 12);

  for (const radius of [4, 8]) {
    const r = radius * unit;

    graphics.moveTo(cx + r * Math.cos(-Math.PI / 4), cy + r * Math.sin(-Math.PI / 4))
      .arc(cx, cy, r, -Math.PI / 4, Math.PI / 4)
      .stroke({ width, color: ICON_COLOR, cap: "round" });
  }
};

/** A slash across the whole icon, with a black edge so it reads where it crosses the speaker. */
const drawSlash = (graphics: Graphics, at: IconPoint, width: number) => {
  const [x0, y0] = at(3, 3);
  const [x1, y1] = at(21, 21);

  graphics.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width * 3, color: 0x000000, cap: "round" });
  graphics.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color: ICON_COLOR, cap: "round" });
};

export const createMuteButton = (parent: Container): MuteButtonView => {
  const graphics = new Graphics({ label: "mute-button", eventMode: "none" });
  let layout: Layout | null = null;
  let muted = false;

  const draw = () => {
    graphics.clear();

    const rect = layout === null ? null : muteButtonRect(layout);

    graphics.visible = rect !== null;

    if (layout === null || rect === null) {
      return;
    }

    const { dpr } = layout;
    const snap = (value: number) => snapToDevicePixels(value, dpr);
    const box = muteIconBox(rect);
    const unit = box.width / 24;
    const at: IconPoint = (x, y) => [snap(box.x + x * unit), snap(box.y + y * unit)];
    const width = Math.max(1, snap(STROKE));

    drawSpeaker(graphics, at);
    drawWaves(graphics, at, unit, width);

    if (muted) {
      drawSlash(graphics, at, width);
    }
  };

  parent.addChild(graphics);

  return {
    setLayout: (next) => {
      layout = next;
      draw();
    },
    setMuted: (next) => {
      if (next !== muted) {
        muted = next;
        draw();
      }
    },
    graphics,
  };
};
