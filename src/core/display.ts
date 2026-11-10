// Sharp-bilinear display of the playfield (M1 plan, deliverable 3). The playfield is off-stage: every frame it is drawn
// at an integer scale k into a render texture, with nearest sampling from the art, and a sprite on the stage shows
// that texture once, linearly filtered, at the square's snapped size. Pixels stay square and never shimmer.
import { Matrix, RenderTexture, Sprite, type Container, type RenderOptions, type Renderer } from "pixi.js";
import { PLAYFIELD_SIZE, type Layout } from "./layout.ts";
import { renderTextureScale } from "./render-scale.ts";

export class PlayfieldDisplay {
  /** Shows the render texture on the stage, at the layout's square in CSS px. */
  readonly sprite: Sprite;

  private readonly renderer: Renderer;
  private readonly texture: RenderTexture;
  private readonly transform = new Matrix();
  // Reused every frame. The clear colour is already an RGBA array (opaque black, like the page around the square), so
  // Pixi doesn't convert it per frame. `transform` replaces the playfield's own transform for each draw only: Pixi
  // copies it into the render group and restores the old one afterwards.
  private readonly options: RenderOptions;
  private k = 1;

  /** `playfield` must not be on the stage: Pixi would draw it a second time, unscaled. */
  constructor(renderer: Renderer, playfield: Container) {
    this.renderer = renderer;
    // `dynamic`: the sprite listens to the texture's updates, so it follows the source when `resize` changes k.
    this.texture = RenderTexture.create({
      width: PLAYFIELD_SIZE,
      height: PLAYFIELD_SIZE,
      resolution: 1,
      scaleMode: "linear",
      dynamic: true,
      label: "playfield",
    });
    this.sprite = new Sprite({ texture: this.texture, label: "playfield-display" });
    this.options = {
      container: playfield,
      target: this.texture,
      transform: this.transform,
      clear: true,
      clearColor: [0, 0, 0, 1],
    };
  }

  /** The integer scale k the playfield is drawn at. */
  get renderScale(): number {
    return this.k;
  }

  get renderTexture(): RenderTexture {
    return this.texture;
  }

  /**
   * Follows a new layout: resizes the render texture when k changes, and moves the sprite onto the square. The texture
   * is resized in place, not recreated: a new one per change would leave Pixi's per-target bookkeeping behind. Call
   * `render` afterwards, before the stage is drawn, or a resized texture shows one frame of nothing.
   */
  resize(layout: Layout): void {
    const k = renderTextureScale(layout.sideDevicePx);

    if (k !== this.k) {
      this.k = k;
      this.texture.source.resize(PLAYFIELD_SIZE * k, PLAYFIELD_SIZE * k, 1);
      this.transform.set(k, 0, 0, k, 0, 0);
    }

    // The square is already snapped to device pixels, so the browser never resamples it a second time. Set after any
    // resize: the sprite's scale is relative to the texture's size.
    this.sprite.position.set(layout.square.x, layout.square.y);
    this.sprite.width = layout.square.width;
    this.sprite.height = layout.square.height;
  }

  /** Draws the playfield into the render texture, cleared first. Call it every frame, before Pixi draws the stage. */
  render(): void {
    this.renderer.render(this.options);
  }

  /** Frees the render texture and its GPU memory, and the sprite. The playfield itself is left to its owner. */
  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}
