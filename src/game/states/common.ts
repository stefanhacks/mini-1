// Small steps the states share. Pure TypeScript. Written by Claude Code.
import type { ChallengeRule } from "../challenges/rule.ts";
import type { InputEvent } from "../input/pointer-map.ts";
import { startNewGame, type GameSession } from "./session.ts";
import type { GameDeps, InputSource, PadControl } from "./types.ts";

/** Drains the input queue (every state does on every update) and says whether it held an "advance". */
export const drainAdvanced = (input: InputSource) => input.drain().some((event) => event.kind === "advance");

/** Drains the input queue and says whether it held an "advance" and whether it held an "endless" (the icon's tap). */
export const drainTaps = (input: InputSource) => {
  const events = input.drain();

  return {
    advanced: events.some((event) => event.kind === "advance"),
    endless: events.some((event) => event.kind === "endless"),
  };
};

/** Hides the pad and its hint (Title, Story, Ending). */
export const hidePad = (pad: PadControl) => {
  pad.setVisible(false);
  pad.setHint(null);
};

/**
 * Feeds one input event to a challenge (m2-plan: an explicit switch, as challenges/ must not import input/): press,
 * release and cancel go to it, the taps are dropped.
 */
export const applyChallengeInput = (
  rule: Pick<ChallengeRule, "press" | "release" | "cancelAll">,
  event: InputEvent,
) => {
  switch (event.kind) {
  case "press":
    rule.press(event.dir);
    break;
  case "release":
    rule.release(event.dir);
    break;
  case "cancel":
    rule.cancelAll();
    break;
  case "advance":
  case "endless":
    break;
  }
};

/**
 * A new game on the opening frame (the soft reset of owner decision 2): the app's housekeeping, a new seed, the scene
 * reset and the weather restarted, the pad hidden. Title runs it on every enter; the Ending runs it before endless
 * mode.
 */
export const startFreshGame = (deps: GameDeps, session: GameSession) => {
  const { pad, scene, nextSeed, tuning, onTitle } = deps;

  onTitle?.();
  startNewGame(session, nextSeed(), tuning);

  const view = scene();

  hidePad(pad);
  view.reset();
  view.startWeather(session.seed);
};
