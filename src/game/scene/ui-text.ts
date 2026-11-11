// The ui layer's texts: built from a UiTextSpec, then sized and placed per layout. Written by Claude Code.
import { Text, type Container } from "pixi.js";
import { playfieldToScreen, snapToDevicePixels, type Layout } from "../../core/layout.ts";
import { UI_FONT } from "./palette.ts";
import type { UiTextSpec } from "./positions.ts";

/** A ui text for `spec`, appended to `parent`: centred, in the game's font. */
export const createUiText = (parent: Container, spec: UiTextSpec, text: string, visible = true) => {
  const result = new Text({
    text,
    visible,
    anchor: { x: 0.5, y: spec.anchorY },
    style: { fontFamily: UI_FONT, fill: spec.fill, align: "center" },
    roundPixels: true,
    label: spec.label,
  });

  parent.addChild(result);

  return result;
};

/** Sizes and places a ui text for `layout`: the original's size on the square, at least `spec.min` CSS px. */
export const placeUiText = (text: Text, spec: UiTextSpec, layout: Layout) => {
  const { x, y } = playfieldToScreen(layout, spec.at);

  text.style.fontSize = Math.max(spec.min, spec.size * layout.scale);
  text.position.set(snapToDevicePixels(x, layout.dpr), snapToDevicePixels(y, layout.dpr));
};
