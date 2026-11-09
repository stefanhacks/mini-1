import "./style.css";
import { Application, Graphics } from "pixi.js";

const CIRCLE_RADIUS = 50;
const MAX_RESOLUTION = 2;

const app = new Application();

await app.init({
  resizeTo: window,
  background: "#1e1e1e",
  resolution: Math.min(window.devicePixelRatio, MAX_RESOLUTION),
  autoDensity: true,
});

document.body.appendChild(app.canvas);

const circle = new Graphics()
  .circle(0, 0, CIRCLE_RADIUS)
  .fill(0x00ff00);

app.stage.addChild(circle);

const recenter = (width: number, height: number) => {
  circle.position.set(width / 2, height / 2);
};

app.renderer.on("resize", recenter);

recenter(app.screen.width, app.screen.height);
