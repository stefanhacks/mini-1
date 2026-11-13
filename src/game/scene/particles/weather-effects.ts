// The weather's display objects (weather.ts drives them): Pixi `ParticleContainer`s of parked particles, and the two
// eye sprites. Written by Claude Code.
import { Particle, ParticleContainer, Rectangle, Sprite, Texture } from "pixi.js";
import { SPRITES } from "../../../assets/manifest.ts";
import { PLAYFIELD_SIZE } from "../../../core/layout.ts";
import type { Textures } from "../art-sprite.ts";
import type { WorldEffectLabel } from "../positions.ts";
import { PARKED_X } from "./pool.ts";
import { BUBBLES, RAIN, SPLASH } from "./spec.ts";

/** By WORLD_EFFECTS label: the world appends each where that table puts it. */
export interface WeatherEffects extends Readonly<Record<WorldEffectLabel, ParticleContainer | Sprite>> {
  readonly splash: ParticleContainer;
  readonly rain: ParticleContainer;
  readonly bubbles: ParticleContainer;
  readonly "eye-small": Sprite;
  readonly "eye-large": Sprite;
}

interface PoolSpec {
  readonly label: string;
  readonly texture: Texture;
  readonly size: number;
  readonly anchor: number;
  readonly scale: number;
}

/** A container of `size` parked particles, which only ever change position and colour. */
const createPool = ({ label, texture, size, anchor, scale }: PoolSpec) => {
  const particles = Array.from({ length: size }, () => new Particle({
    texture,
    x: PARKED_X,
    y: 0,
    anchorX: anchor,
    anchorY: anchor,
    scaleX: scale,
    scaleY: scale,
    alpha: 0,
  }));
  const container = new ParticleContainer({
    label,
    texture,
    dynamicProperties: { position: true, color: true },
    // A ParticleContainer measures no bounds: the playfield is enough.
    boundsArea: new Rectangle(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE),
  });

  container.addParticle(...particles);

  return { container, particles };
};

const createEye = (textures: Textures, key: "eyeSmall" | "eyeLarge", label: string) =>
  new Sprite({ texture: textures[key], anchor: SPRITES[key].anchor, label, visible: false, alpha: 0 });

/** Builds the weather's display objects, unattached: the world appends them in WORLD_EFFECTS order. */
export const createWeatherEffects = (textures: Textures) => {
  const splash = createPool({
    label: "splash",
    texture: Texture.WHITE,
    size: SPLASH.pool,
    anchor: 0,
    scale: SPLASH.size,
  });
  const rain = createPool({
    label: "rain",
    texture: textures.raindrop,
    size: RAIN.pool,
    anchor: 0.5,
    scale: RAIN.scale,
  });
  const bubbles = createPool({
    label: "bubbles",
    texture: textures.bubble,
    size: BUBBLES.pool,
    anchor: 0.5,
    scale: BUBBLES.scale,
  });
  const effects: WeatherEffects = {
    splash: splash.container,
    rain: rain.container,
    bubbles: bubbles.container,
    "eye-small": createEye(textures, "eyeSmall", "eye-small"),
    "eye-large": createEye(textures, "eyeLarge", "eye-large"),
  };

  return { effects, drops: rain.particles, splashes: splash.particles, bubbles: bubbles.particles };
};

export type WeatherParts = ReturnType<typeof createWeatherEffects>;
