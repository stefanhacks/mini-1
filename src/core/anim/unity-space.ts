// Unity's clip values in the playfield's terms. Pure TypeScript. Written by Claude Code.
//
// The original's canvas is 500×500 units with the origin at its centre and y up; the playfield is 500×500 art px with
// the origin top-left and y down, one canvas unit per art px (positions.ts: playfield = (250 + x, 250 − y)). No object
// between the Canvas and an animated one scales or rotates (the importer checks), so a clip's absolute position in its
// parent's space is a fixed offset from the parent: playfield = origin + (x, −y), where `origin` is where (0, 0) sits
// (src/assets/anims.ts TARGETS: `anchorOrigin` for m_AnchoredPosition, `parentOrigin` for m_LocalPosition).
import { snapToArtPixels } from "../art-grid.ts";
import type { Point } from "../layout.ts";

/** A Unity position channel's value on one axis, in playfield px (y flips). */
export const toPlayfieldX = (origin: Point, x: number) => origin.x + x;
export const toPlayfieldY = (origin: Point, y: number) => origin.y - y;

/**
 * Unity's z rotation in degrees to Pixi's in radians. Unity's +z turns counter-clockwise on screen (y up, the camera
 * looking down +z); Pixi's +rotation turns clockwise (y down). So the sign flips.
 */
export const toPixiRotation = (degrees: number) => ((0 - degrees) * Math.PI) / 180;

/** What `placeOnArtGrid` (layers.ts) needs from a node, without Pixi. */
export interface GridNode {
  readonly position: { x: number; y: number };
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
}

/**
 * `placeOnArtGrid` for any node: its texture's edges on whole art pixels. A node without an anchor (a container) has
 * its origin at its top-left, so it is just rounded.
 */
export const placeNodeOnArtGrid = (node: GridNode, x: number, y: number) => {
  node.position.x = snapToArtPixels(x, node.anchor?.x ?? 0, node.width);
  node.position.y = snapToArtPixels(y, node.anchor?.y ?? 0, node.height);
};
