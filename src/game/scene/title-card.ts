// The title card: the logo (top layer), the tap prompt and the credits (ui layer). M4's intro and fades hook in here.
// Written by Claude Code.
import type { Sprite, Text } from "pixi.js";
import type { Layers } from "../../core/layers.ts";
import type { Layout } from "../../core/layout.ts";
import { addArtSprite, type Textures } from "./art-sprite.ts";
import { CREDITS, CREDITS_TEXT, LOGO_AT, TAP_PROMPT } from "./positions.ts";
import { createUiText, placeUiText } from "./ui-text.ts";

export interface TitleCardView {
  readonly logo: Sprite;
  readonly tapPrompt: Text;
  readonly credits: Text;
  /** The logo and the credits. */
  readonly setTitle: (visible: boolean) => void;
  /** The tap prompt ("Tap to begin", "Tap to play again"), or none. */
  readonly setPrompt: (text: string | null) => void;
  /** Follows a new layout: the prompt and the credits. */
  readonly relayout: (layout: Layout) => void;
}

export const createTitleCard = (layers: Layers, textures: Textures): TitleCardView => {
  const logo = addArtSprite(layers.top, textures, "title", LOGO_AT);
  const tapPrompt = createUiText(layers.ui, TAP_PROMPT, "");
  const credits = createUiText(layers.ui, CREDITS_TEXT, CREDITS);

  return {
    logo,
    tapPrompt,
    credits,
    setTitle: (visible) => {
      logo.visible = visible;
      credits.visible = visible;
    },
    setPrompt: (text) => {
      tapPrompt.visible = text !== null;
      tapPrompt.text = text ?? "";
    },
    relayout: (next) => {
      placeUiText(tapPrompt, TAP_PROMPT, next);
      placeUiText(credits, CREDITS_TEXT, next);
    },
  };
};
