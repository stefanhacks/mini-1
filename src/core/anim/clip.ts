// Animation clip data, as scripts/import-anims.mjs writes it into src/assets/anims.ts from the original's Unity .anim
// files. Pure TypeScript, types only. Written by Claude Code.
//
// Times are in seconds and values in Unity's units, exactly as in the YAML: the player converts (player.ts).

/** One key of a Unity AnimationCurve (Keyframe). Slopes are per second. */
export interface Keyframe {
  readonly time: number;
  readonly value: number;
  readonly inSlope: number;
  readonly outSlope: number;
  /**
   * Unity's packed tangent modes, for reference only (the slopes already carry them): bit 0 broken, bits 1–4 the left
   * tangent, bits 5–8 the right one (0 free, 1 auto, 2 linear, 3 constant, 4 clamped auto). So 136 is clamped auto on
   * both sides, 34 legacy auto, 65 and 5 broken with a linear right or left side. A constant side shows as an infinite
   * slope.
   */
  readonly tangentMode: number;
  /** Set only when a side is weighted: 1 in, 2 out, 3 both. Unweighted sides use the default 1/3. */
  readonly weightedMode?: number;
  readonly inWeight?: number;
  readonly outWeight?: number;
}

/** What a curve animates. Position channels are absolute values in the parent's space, y up. */
export type CurveAttribute =
  | "m_Color.a"
  | "m_fontColor.a"
  | "m_AnchoredPosition.x"
  | "m_AnchoredPosition.y"
  | "m_LocalPosition.x"
  | "m_LocalPosition.y"
  | "localEulerAnglesRaw.z"
  | "m_LocalScale.x"
  | "m_LocalScale.y"
  | "m_SizeDelta.y";

export interface Curve {
  /** The animated object's path below the animator's object: "" for the object itself. */
  readonly path: string;
  readonly attribute: CurveAttribute;
  /** The Unity component the curve was bound to (SpriteRenderer, RectTransform, Transform, MonoBehaviour for TMP). */
  readonly component: string;
  readonly keys: readonly Keyframe[];
}

/** A sprite swap curve (`m_Sprite`): the sprites are Unity asset GUIDs. Only `PillarsSwitch` has one, unused. */
export interface SpriteCurve {
  readonly path: string;
  readonly keys: readonly { readonly time: number; readonly sprite: string }[];
}

export interface ClipEvent {
  readonly time: number;
  readonly functionName: string;
}

export interface Clip {
  /** The original clip name, which can be non-ASCII (`SeaAnimTrês`). */
  readonly name: string;
  /** In seconds: `m_StopTime − m_StartTime`. */
  readonly length: number;
  /**
   * Whether the original looped it. Animator clips loop on `m_LoopTime`. Legacy clips (played by an `Animation`
   * component) ignore it and follow `m_WrapMode`, which is 0 (Default → once) for every clip here.
   */
  readonly loop: boolean;
  readonly legacy: boolean;
  /** The controllers that use the clip (Assets/Graphics/Animators). Empty for the legacy clips. */
  readonly controllers: readonly string[];
  readonly curves: readonly Curve[];
  readonly sprites: readonly SpriteCurve[];
  readonly events: readonly ClipEvent[];
  /** Imported for completeness, never played (`PillarsSwitch`). */
  readonly unused?: true;
}
