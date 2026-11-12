// The title card: the logo (top layer), the tap prompt and the credits (ui layer), with their fades. On Title the logo
// shows only at the reveal's flash peak (scene/lightning.ts), as a cut; the credits and the prompt fade in at the end
// of the intro, and the three fade out on the tap (`Inicio`). On the ending card they fade in at half speed.
// Which clip plays on which: the logo `FadeIn`/`FadeOut` (LogoAnimator; never `IdleOn`, the original never triggered
// it), the credits `TMPFadeIn`/`TMPFadeOut`, the prompt the same then the `TMPIdle` pulse (m4-plan, Notes for wave 2).
// Written by Claude Code.
import type { Sprite, Text } from "pixi.js";
import { CLIPS } from "../../assets/anims.ts";
import type { Layers } from "../../core/layers.ts";
import type { Layout } from "../../core/layout.ts";
import type { Fade } from "../states/types.ts";
import { addArtSprite, type Textures } from "./art-sprite.ts";
import { faded, type Fades } from "./fades.ts";
import { CREDITS_TEXT, LOGO_AT, TAP_PROMPT } from "./positions.ts";
import { createUiText, placeUiText } from "./ui-text.ts";

/** The credits line (`UI/Title/CopyRight`). */
export const CREDITS = "©the Stefan & Nied";

/** The prompt's pulse (`TMPIdle`, alpha 1 → 0.647 → 1 over 1.6 s), at the clip's own speed on Title and the card. */
const PROMPT_PULSE = { clip: CLIPS.tmpIdle, speed: 1 } as const;

export interface TitleCardView {
  readonly logo: Sprite;
  readonly tapPrompt: Text;
  readonly credits: Text;
  /** The logo and the credits. */
  readonly setTitle: (visible: boolean, fade?: Fade) => void;
  /** The logo alone, as a cut: the reveal at the flash peak. */
  readonly setLogo: (visible: boolean) => void;
  readonly setCredits: (visible: boolean, fade?: Fade) => void;
  /** The tap prompt ("Tap to begin", "Tap to play again"), or none; shown, it pulses. */
  readonly setPrompt: (text: string | null, fade?: Fade) => void;
  /** Follows a new layout: the prompt and the credits. */
  readonly relayout: (layout: Layout) => void;
}

export const createTitleCard = (layers: Layers, textures: Textures, fades: Fades): TitleCardView => {
  const logo = addArtSprite(layers.top, textures, "title", LOGO_AT);
  const tapPrompt = createUiText(layers.ui, TAP_PROMPT, "");
  const credits = createUiText(layers.ui, CREDITS_TEXT, CREDITS);

  const setLogo = (visible: boolean, fade?: Fade) => {
    if (visible) {
      fades.show(logo, faded(fade, CLIPS.fadeIn));
    } else {
      fades.hide(logo, faded(fade, CLIPS.fadeOut));
    }
  };

  const setCredits = (visible: boolean, fade?: Fade) => {
    if (visible) {
      fades.show(credits, faded(fade, CLIPS.tmpFadeIn));
    } else {
      fades.hide(credits, faded(fade, CLIPS.tmpFadeOut));
    }
  };

  return {
    logo,
    tapPrompt,
    credits,
    setTitle: (visible, fade) => {
      setLogo(visible, fade);
      setCredits(visible, fade);
    },
    setLogo: (visible) => setLogo(visible),
    setCredits,
    setPrompt: (text, fade) => {
      if (text === null) {
        // The pulse stops for the fade-out (`Inicio` resets IdleOn), which starts from alpha 1 as the clip does, or
        // from where a cut-short fade-in got to. The text stays for the fade; a cut clears it, and ends the fade.
        fades.hide(tapPrompt, faded(fade, CLIPS.tmpFadeOut));

        if (fade === undefined) {
          tapPrompt.text = "";
        }

        return;
      }

      tapPrompt.text = text;
      fades.show(tapPrompt, faded(fade, CLIPS.tmpFadeIn), () => fades.play(tapPrompt, PROMPT_PULSE));
    },
    relayout: (next) => {
      placeUiText(tapPrompt, TAP_PROMPT, next);
      placeUiText(credits, CREDITS_TEXT, next);
    },
  };
};
