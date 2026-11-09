// Sharp-bilinear display of the playfield (M1 plan, deliverable 3). The playfield is off-stage: every frame it is drawn
// at an integer scale k into a render texture, with nearest sampling from the art, and a sprite on the stage shows
// that texture once, linearly filtered, at the square's snapped size. Pixels stay square and never shimmer.
import { Matrix, RenderTexture, Sprite, type Container, type Renderer } from "pixi.js";
import { PLAYFIELD_SIZE, type Layout } from "./layout.ts";
import { renderTextureScale } from "./render-scale.ts";

// What the render texture shows where the art leaves gaps. The page around the square is black too.
const CLEAR_COLOR = "#000000";

const createRenderTexture = (k: number) => RenderTexture.create({
  width: PLAYFIELD_SIZE * k,
  height: PLAYFIELD_SIZE * k,
  resolution: 1,
  scaleMode: "linear",
  label: `playfield ×${k}`,
});

export class PlayfieldDisplay {
  /** Shows the render texture on the stage, at the layout's square in CSS px. */
  readonly sprite: Sprite;

  private readonly renderer: Renderer;
  private readonly playfield: Container;
  private readonly transform = new Matrix();
  private texture: RenderTexture;
  private k = 0;

  /** `playfield` must not be on the stage: Pixi would draw it a second time, unscaled. */
  constructor(renderer: Renderer, playfield: Container) {
    this.renderer = renderer;
    this.playfield = playfield;
    this.texture = createRenderTexture(1);
    this.sprite = new Sprite({ texture: this.texture, label: "playfield-display" });
    this.setScale(1);
  }

  /** The integer scale the playfield is drawn at. */
  get scale(): number {
    return this.k;
  }

  get renderTexture(): RenderTexture {
    return this.texture;
  }

  /** Follows a new layout: recreates the render texture when k changes, and moves the sprite onto the square. */
  resize(layout: Layout): void {
    const k = renderTextureScale(layout.sideDevicePx);

    if (k !== this.k) {
      const old = this.texture;

      this.texture = createRenderTexture(k);
      this.sprite.texture = this.texture;
      // `true` also frees the GPU texture behind it; the sprite no longer references it.
      old.destroy(true);
      this.setScale(k);
    }

    // The square is already snapped to device pixels, so the browser never resamples the canvas a second time.
    this.sprite.position.set(layout.square.x, layout.square.y);
    this.sprite.width = layout.square.width;
    this.sprite.height = layout.square.height;
  }

  /**
   * Draws the playfield into the render texture, cleared first. Call it once per frame, after the game logic and
   * before Pixi renders the stage. `transform` replaces the playfield's own transform for this draw only: Pixi copies
   * it into the render group and restores the old one afterwards.
   */
  render(): void {
    this.renderer.render({
      container: this.playfield,
      target: this.texture,
      transform: this.transform,
      clear: true,
      clearColor: CLEAR_COLOR,
    });
  }

  private setScale(k: number) {
    this.k = k;
    this.transform.set(k, 0, 0, k, 0, 0);
  }
}
