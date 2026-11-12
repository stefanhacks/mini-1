// What the challenge view shows for a spec and its progress, as plain values. Pure TypeScript with no Pixi import, so
// it runs under `node --test`. Written by Claude Code.
import type { SpriteKey } from "../../assets/manifest.ts";
import type { ChallengeKind, ChallengeProgress, ChallengeSpec } from "../challenges/rule.ts";
import type { Direction } from "../direction.ts";

/** KeyManager.SpawnArrows' ArrowText, quotes included. */
export const CHALLENGE_PROMPTS: Readonly<Record<ChallengeKind, string>> = {
  sequence: "\"... follow ...\"",
  hold: "\"... hold strong ...\"",
  many: "\"... be fast ...\"",
};

/** The arrow art for each direction. */
export const ARROW_SPRITES: Readonly<Record<Direction, SpriteKey>> = {
  up: "arrowUp",
  down: "arrowDown",
  left: "arrowLeft",
  right: "arrowRight",
};

/** The arrows a spec shows, left to right: a sequence's directions, or the one arrow of a hold or many. */
export const directionsOf = (spec: ChallengeSpec | null): readonly Direction[] => {
  if (spec === null) {
    return [];
  }

  return spec.kind === "sequence" ? spec.directions : [spec.direction];
};

/**
 * A key that changes only when the drawn progress does, so `setProgress` can be called every frame. A hold's fraction
 * counts to 3 decimals. No progress is "".
 */
export const progressKey = (value: ChallengeProgress | null) => {
  if (value === null) {
    return "";
  }

  switch (value.kind) {
  case "sequence":
    return `s${value.pointer}`;
  case "hold":
    return `h${value.fraction.toFixed(3)}`;
  case "many":
    return `m${value.count}`;
  }
};

/**
 * The cursor art under arrow `index` (KeyManager.UpdateArrows): done cursorP, current cursorS, pending cursorE. Only a
 * sequence moves its pointer; a hold or many keeps its one cursor current.
 */
export const cursorKey = (index: number, progress: ChallengeProgress): SpriteKey => {
  const pointer = progress.kind === "sequence" ? progress.pointer : 0;

  return index < pointer ? "cursorPast" : index === pointer ? "cursorSelected" : "cursorEmpty";
};
