#!/usr/bin/env node
// Imports the After the Waves Crash animation clips from a local checkout of the Unity project into
// src/assets/anims.ts (docs/after-the-waves-crash/m4-plan.md, deliverable 1). No dependencies. Written by Claude Code.
//
// Usage: npm run anims -- <path to after-the-waves-crash checkout> [--check]
//   (or node scripts/import-anims.mjs <checkout> [--check]). Reruns overwrite the output in place; `--check` writes
//   nothing and exits 1 when the committed file differs from what the checkout gives.
//
// Reads every Assets/Graphics/Animations/*.anim, the controllers in Assets/Graphics/Animators (which clip each one
// plays) and Assets/Scenes/Main.unity (the animated objects and their parent chains). Per clip it keeps the length,
// loop flag, the runtime curves (m_FloatCurves, and m_PositionCurves / m_EulerCurves / m_ScaleCurves split into their
// x/y/z channels; the m_EditorCurves duplicate them and are only used to check them and to read per-channel tangent
// modes), the sprite swaps and the events. Dropped: ChangeText (no visible effect, 01 quirk 9) and the channels a 2D
// port can't show (position z, euler x/y, scale z), which are checked to be constant first.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnityYaml } from "./unity-yaml.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/assets/anims.ts");
const DROPPED_CLIPS = new Set(["ChangeText"]);
const UNUSED_CLIPS = new Set(["PillarsSwitch"]);
const COMPONENTS = { 4: "Transform", 114: "MonoBehaviour", 212: "SpriteRenderer", 224: "RectTransform" };
const CLAMP = "2"; // Unity's internal curve wrap: 0 ping-pong, 1 repeat, 2 clamp.
const WRAP_ONCE = new Set([0, 1, 8]); // WrapMode Default, Once, ClampForever: a legacy clip plays once.
const WRAP_LOOP = 2;
const SPRITE_RENDERER = 212;
const PLAYFIELD_HALF = 250; // The 500×500 canvas, centre origin and y up, onto the playfield, top-left and y down.
const VECTOR_CURVES = {
  m_PositionCurves: { attribute: "m_LocalPosition", keep: ["x", "y"], drop: ["z"] },
  m_EulerCurves: { attribute: "localEulerAnglesRaw", keep: ["z"], drop: ["x", "y"] },
  m_ScaleCurves: { attribute: "m_LocalScale", keep: ["x", "y"], drop: ["z"] },
};

const fail = (message) => {
  throw new Error(message);
};

const num = (text) => {
  const value = Number(text);

  return Number.isNaN(value) ? fail(`not a number: ${JSON.stringify(text)}`) : value;
};

// ASCII lowerCamel ids: SeaAnimTrês → seaAnimTres, TMPFadeIn → tmpFadeIn.
export const clipId = (name) => {
  const ascii = name.normalize("NFD").replace(/[^A-Za-z0-9]/g, "");
  const leading = /^[A-Z]+(?=[A-Z][a-z]|$)|^[A-Z]/.exec(ascii)?.[0] ?? "";

  return leading.toLowerCase() + ascii.slice(leading.length);
};

const readYaml = (path) => parseUnityYaml(readFileSync(path, "utf8"));
const guidOf = (path) => /guid: ([0-9a-f]+)/.exec(readFileSync(`${path}.meta`, "utf8"))?.[1] ?? fail(`no guid: ${path}`);

// --- Clips ----------------------------------------------------------------------------------------------------------

const checkClamped = (curve, where) => {
  if (curve.m_PreInfinity !== CLAMP || curve.m_PostInfinity !== CLAMP) {
    fail(`${where}: only clamped curves are supported (pre ${curve.m_PreInfinity}, post ${curve.m_PostInfinity})`);
  }
};

const readKey = (raw, axis) => {
  const pick = (field) => num(axis === undefined ? raw[field] : raw[field][axis]);
  const key = {
    time: num(raw.time),
    value: pick("value"),
    inSlope: pick("inSlope"),
    outSlope: pick("outSlope"),
    tangentMode: num(raw.tangentMode),
  };
  const weightedMode = num(raw.weightedMode ?? "0");

  return weightedMode === 0 ? key : { ...key, weightedMode, inWeight: pick("inWeight"), outWeight: pick("outWeight") };
};

const editorCurveKey = (path, attribute) => `${path}\u0000${attribute}`;

const readEditorCurves = (clip) => {
  const curves = new Map();

  for (const entry of clip.m_EditorCurves) {
    curves.set(editorCurveKey(entry.path, entry.attribute), {
      component: COMPONENTS[entry.classID] ?? fail(`unknown classID ${entry.classID}`),
      keys: entry.curve.m_Curve.map((raw) => readKey(raw)),
    });
  }

  return curves;
};

const isConstant = (keys) => keys.every((key) => key.value === keys[0].value && key.inSlope === 0 && key.outSlope === 0);

// The vector curves' keys share one tangentMode; the matching editor curve has each channel's own.
const withEditorModes = (keys, editor) => keys.map((key) => {
  const match = editor?.keys.find((candidate) => candidate.time === key.time);

  return match === undefined ? key : { ...key, tangentMode: match.tangentMode };
});

const readCurves = (clip, name) => {
  const editor = readEditorCurves(clip);
  const curves = [];

  for (const entry of clip.m_FloatCurves) {
    checkClamped(entry.curve, `${name} ${entry.attribute}`);

    const keys = entry.curve.m_Curve.map((raw) => readKey(raw));
    const component = COMPONENTS[entry.classID] ?? fail(`${name}: unknown classID ${entry.classID}`);

    curves.push({ path: entry.path, attribute: entry.attribute, component, keys });
  }

  for (const [field, { attribute, keep, drop }] of Object.entries(VECTOR_CURVES)) {
    for (const entry of clip[field]) {
      checkClamped(entry.curve, `${name} ${field}`);

      for (const axis of drop) {
        if (!isConstant(entry.curve.m_Curve.map((raw) => readKey(raw, axis)))) {
          fail(`${name}: ${attribute}.${axis} moves, and a 2D port can't show it`);
        }
      }

      for (const axis of keep) {
        const channel = `${attribute}.${axis}`;
        const match = editor.get(editorCurveKey(entry.path, channel));
        const keys = withEditorModes(entry.curve.m_Curve.map((raw) => readKey(raw, axis)), match);

        curves.push({ path: entry.path, attribute: channel, component: match?.component ?? "Transform", keys });
      }
    }
  }

  if (clip.m_RotationCurves.length > 0 || clip.m_CompressedRotationCurves.length > 0) {
    fail(`${name}: quaternion rotation curves are not supported`);
  }

  return curves.sort((a, b) => a.path.localeCompare(b.path) || a.attribute.localeCompare(b.attribute));
};

// Every editor curve must agree with a runtime channel at each of its keys: then dropping them loses nothing.
const checkAgainstEditorCurves = (clip, name, curves) => {
  for (const [id, { keys }] of readEditorCurves(clip)) {
    const [path, attribute] = id.split("\u0000");
    const runtime = curves.find((curve) => curve.path === path && curve.attribute === attribute);

    if (runtime === undefined) {
      if (!isConstant(keys)) {
        fail(`${name}: editor curve ${attribute} has no runtime channel`);
      }

      continue;
    }

    for (const key of keys) {
      const match = runtime.keys.find((candidate) => candidate.time === key.time);

      if (match === undefined || Math.abs(match.value - key.value) > 1e-4) {
        fail(`${name}: editor curve ${attribute} disagrees with the runtime curve at ${key.time}`);
      }
    }
  }
};

const readSprites = (clip) => clip.m_PPtrCurves.map((entry) => {
  if (entry.attribute !== "m_Sprite") {
    fail(`unsupported object curve ${entry.attribute}`);
  }

  return { path: entry.path, keys: entry.curve.map((key) => ({ time: num(key.time), sprite: key.value.guid })) };
});

const readEvents = (clip, name) => (Array.isArray(clip.m_Events) ? clip.m_Events : []).map((event) => {
  if (event.data !== "" || num(event.floatParameter) !== 0 || num(event.intParameter) !== 0) {
    fail(`${name}: event ${event.functionName} has a parameter, which the import drops`);
  }

  return { time: num(event.time), functionName: event.functionName };
}).sort((a, b) => a.time - b.time);

const readLoop = (clip, settings, name, legacy) => {
  if (!legacy) {
    return settings.m_LoopTime === "1";
  }

  const wrap = num(clip.m_WrapMode);

  return wrap === WRAP_LOOP || (WRAP_ONCE.has(wrap) ? false : fail(`${name}: unsupported legacy wrap mode ${wrap}`));
};

const readClip = (path, controllers) => {
  const clip = readYaml(path)[0].body.AnimationClip;
  const name = clip.m_Name;
  const settings = clip.m_AnimationClipSettings;
  const legacy = clip.m_Legacy === "1";
  const curves = readCurves(clip, name);
  const keyTimes = curves.flatMap((curve) => curve.keys.map((key) => key.time));
  const length = settings.m_StopTime === undefined ?
    Math.max(0, ...keyTimes) :
    num(settings.m_StopTime) - num(settings.m_StartTime);

  checkAgainstEditorCurves(clip, name, curves);

  return {
    id: clipId(name),
    clip: {
      name,
      length,
      loop: readLoop(clip, settings, name, legacy),
      legacy,
      controllers,
      curves,
      sprites: readSprites(clip),
      events: readEvents(clip, name),
      ...(UNUSED_CLIPS.has(name) ? { unused: true } : {}),
    },
  };
};

// --- Controllers and the scene --------------------------------------------------------------------------------------

/** Controller name → the clip GUIDs its states play, and the reverse. */
const readControllers = (assets) => {
  const dir = join(assets, "Graphics/Animators");
  const byGuid = new Map();

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".controller")).sort()) {
    const path = join(dir, file);
    const motions = readYaml(path)
      .map((doc) => doc.body.AnimatorState?.m_Motion?.guid)
      .filter((guid) => guid !== undefined);

    byGuid.set(guidOf(path), { name: basename(file, ".controller"), clips: [...new Set(motions)] });
  }

  return byGuid;
};

const typeOf = (doc) => Object.keys(doc.body)[0];
const fieldsOf = (doc) => doc.body[typeOf(doc)];
const point = (raw) => ({ x: num(raw.x), y: num(raw.y) });
// Rounded to 1e-4 px: the sums carry float noise (−9 − 258.00006 + ...), the scene's own values have fewer digits.
const round = (value) => Math.round(value * 1e4) / 1e4;
const toPlayfield = ({ x, y }) => ({ x: round(PLAYFIELD_HALF + x), y: round(PLAYFIELD_HALF - y) });

/**
 * Every object below the Canvas, with its pivot and rect in canvas units (centre origin, y up). A RectTransform sits
 * at its anchors' point in the parent's rect (interpolated by its pivot) plus m_AnchoredPosition; a plain Transform at
 * the parent's pivot plus m_LocalPosition. Only valid while no ancestor scales or rotates, which `targetOf` checks.
 */
const readSceneObjects = (docs) => {
  const byId = new Map(docs.map((doc) => [doc.fileId, doc]));
  const objects = new Map();
  const canvas = docs.find((doc) => doc.classId === 223) ?? fail("Main.unity has no Canvas");
  const canvasTransform = fieldsOf(byId.get(fieldsOf(canvas).m_GameObject.fileID)).m_Component
    .map(({ component }) => byId.get(component.fileID))
    .find((doc) => doc?.classId === 224);

  const visit = (doc, parent, path) => {
    const transform = fieldsOf(doc);
    const gameObject = fieldsOf(byId.get(transform.m_GameObject.fileID));
    const name = gameObject.m_Name;
    const childPath = path === null ? "" : path === "" ? name : `${path}/${name}`;
    let pivot = { x: 0, y: 0 };
    let rect = { min: { x: -PLAYFIELD_HALF, y: -PLAYFIELD_HALF }, size: { x: 500, y: 500 } };
    let anchorOrigin;

    if (parent !== null && doc.classId === 224) {
      const [aMin, aMax, sizeDelta, ownPivot] = ["m_AnchorMin", "m_AnchorMax", "m_SizeDelta", "m_Pivot"]
        .map((field) => point(transform[field]));
      const low = { x: parent.rect.min.x + aMin.x * parent.rect.size.x, y: parent.rect.min.y + aMin.y * parent.rect.size.y };
      const high = { x: parent.rect.min.x + aMax.x * parent.rect.size.x, y: parent.rect.min.y + aMax.y * parent.rect.size.y };
      const anchored = point(transform.m_AnchoredPosition);
      const size = { x: high.x - low.x + sizeDelta.x, y: high.y - low.y + sizeDelta.y };

      anchorOrigin = { x: low.x + (high.x - low.x) * ownPivot.x, y: low.y + (high.y - low.y) * ownPivot.y };
      pivot = { x: anchorOrigin.x + anchored.x, y: anchorOrigin.y + anchored.y };
      rect = { min: { x: pivot.x - ownPivot.x * size.x, y: pivot.y - ownPivot.y * size.y }, size };
    } else if (parent !== null) {
      const local = point(transform.m_LocalPosition);

      pivot = { x: parent.pivot.x + local.x, y: parent.pivot.y + local.y };
      rect = { min: pivot, size: { x: 0, y: 0 } };
    }

    const scale = point(transform.m_LocalScale);
    const rotated = num(transform.m_LocalRotation.z) !== 0;
    const object = {
      path: childPath,
      parent,
      pivot,
      rect,
      anchorOrigin,
      scaled: scale.x !== 1 || scale.y !== 1 || rotated,
      components: gameObject.m_Component.map(({ component }) => byId.get(component.fileID)).filter(Boolean),
      children: [],
    };

    objects.set(childPath, object);
    parent?.children.push(object);

    for (const child of transform.m_Children) {
      const childDoc = byId.get(child.fileID);

      // Prefab instances are stripped stubs here: the arrows and the text manager are not in the scene's tree.
      if (childDoc !== undefined && fieldsOf(childDoc).m_GameObject !== undefined) {
        visit(childDoc, object, childPath);
      }
    }
  };

  visit(canvasTransform, null, null);

  return objects;
};

const targetOf = (object) => {
  for (let ancestor = object.parent; ancestor?.parent; ancestor = ancestor.parent) {
    if (ancestor.scaled) {
      fail(`${object.path}: an ancestor scales or rotates, so its clips can't be converted by offsets`);
    }
  }

  // An object with no sprite of its own (Sky) moves the sprites below it: their offsets from its pivot.
  const hasSprite = (candidate) => candidate.components.some((component) => component.classId === SPRITE_RENDERER);
  const sprites = hasSprite(object) ? [] : object.children.filter(hasSprite).map((child) => ({
    name: child.path.slice(object.path.length + 1),
    offset: { x: round(child.pivot.x - object.pivot.x), y: round(object.pivot.y - child.pivot.y) },
  }));

  return {
    at: toPlayfield(object.pivot),
    ...(object.anchorOrigin === undefined ? {} : { anchorOrigin: toPlayfield(object.anchorOrigin) }),
    parentOrigin: toPlayfield(object.parent.pivot),
    ...(sprites.length === 0 ? {} : { sprites }),
  };
};

/** The scene objects the clips animate: each Animator's or Animation's object, or its child at a curve's path. */
const readTargets = (assets, controllers, clipsByGuid) => {
  const objects = readSceneObjects(readYaml(join(assets, "Scenes/Main.unity")));
  const targets = new Map();

  for (const object of objects.values()) {
    for (const component of object.components) {
      const fields = fieldsOf(component);
      const guids = component.classId === 95 ?
        controllers.get(fields.m_Controller.guid)?.clips ?? [] :
        component.classId === 111 ? fields.m_Animations.map((clip) => clip.guid) : [];

      for (const entry of guids.map((guid) => clipsByGuid.get(guid)).filter(Boolean)) {
        for (const path of new Set(entry.clip.curves.map((curve) => curve.path))) {
          const target = objects.get(path === "" ? object.path : `${object.path}/${path}`) ??
            fail(`${entry.clip.name}: no ${path} below ${object.path}`);
          const clips = targets.get(target.path)?.clips ?? [];

          targets.set(target.path, { ...targetOf(target), clips: [...new Set([...clips, entry.id])].sort() });
        }
      }
    }
  }

  return new Map([...targets].sort(([a], [b]) => a.localeCompare(b)));
};

// --- Output ---------------------------------------------------------------------------------------------------------

const fmt = (value) => (Object.is(value, -0) ? "0" : String(value));
const str = (value) => JSON.stringify(value);
const pointLiteral = ({ x, y }) => `{ x: ${fmt(x)}, y: ${fmt(y)} }`;

const keyLiteral = (key) => {
  const fields = ["time", "value", "inSlope", "outSlope", "tangentMode", "weightedMode", "inWeight", "outWeight"]
    .filter((field) => key[field] !== undefined)
    .map((field) => `${field}: ${fmt(key[field])}`);

  return `{ ${fields.join(", ")} }`;
};

const clipLiteral = (id, clip) => {
  const lines = [
    `  ${id}: {`,
    `    name: ${str(clip.name)},`,
    `    length: ${fmt(clip.length)},`,
    `    loop: ${clip.loop},`,
    `    legacy: ${clip.legacy},`,
    `    controllers: [${clip.controllers.map(str).join(", ")}],`,
  ];

  lines.push(clip.curves.length === 0 ? "    curves: []," : "    curves: [");

  for (const curve of clip.curves) {
    lines.push(
      `      { path: ${str(curve.path)}, attribute: ${str(curve.attribute)}, component: ${str(curve.component)}, keys: [`,
      ...curve.keys.map((key) => `        ${keyLiteral(key)},`),
      "      ] },",
    );
  }

  if (clip.curves.length > 0) {
    lines.push("    ],");
  }

  const sprites = clip.sprites.map((curve) =>
    `{ path: ${str(curve.path)}, keys: [${curve.keys.map((key) =>
      `{ time: ${fmt(key.time)}, sprite: ${str(key.sprite)} }`).join(", ")}] }`);
  const events = clip.events.map((event) => `{ time: ${fmt(event.time)}, functionName: ${str(event.functionName)} }`);

  lines.push(
    `    sprites: [${sprites.join(", ")}],`,
    events.length === 0 ? "    events: []," : `    events: [\n      ${events.join(",\n      ")},\n    ],`,
  );

  if (clip.unused) {
    lines.push("    unused: true,");
  }

  lines.push("  },");

  return lines.join("\n");
};

const targetLiteral = (path, target) => [
  `  ${str(path)}: {`,
  `    clips: [${target.clips.map(str).join(", ")}],`,
  `    at: ${pointLiteral(target.at)},`,
  ...(target.anchorOrigin === undefined ? [] : [`    anchorOrigin: ${pointLiteral(target.anchorOrigin)},`]),
  `    parentOrigin: ${pointLiteral(target.parentOrigin)},`,
  ...(target.sprites === undefined ? [] : [
    "    sprites: [",
    ...target.sprites.map(({ name, offset }) => `      { name: ${str(name)}, offset: ${pointLiteral(offset)} },`),
    "    ],",
  ]),
  "  },",
].join("\n");

const render = (clips, targets) => `// GENERATED by scripts/import-anims.mjs from the original Unity project. Do not edit by hand.
// Regenerate: npm run anims -- <path to after-the-waves-crash checkout>
//
// CLIPS: Assets/Graphics/Animations/*.anim, keyed by an ASCII id (\`name\` keeps the original). Times in seconds,
// values in Unity units; position channels are absolute in the parent's space, y up. ChangeText is dropped (no
// visible effect); PillarsSwitch is kept, marked unused.
// TARGETS: the objects those clips animate in Assets/Scenes/Main.unity, by path below the Canvas, in playfield px:
// \`at\` is where Main.unity puts its pivot, \`anchorOrigin\` where an m_AnchoredPosition of (0, 0) would (RectTransforms
// only), and \`parentOrigin\` where an m_LocalPosition of (0, 0) would: playfield = origin + (x, −y). \`sprites\`: for
// an object with no sprite of its own (Sky), the sprites it carries, as offsets from its pivot (playfield px, y down).
/* eslint-disable max-len -- generated data, one key per line */
import type { Clip } from "../core/anim/clip.ts";
import type { Point } from "../core/layout.ts";

export const CLIPS = {
${clips.map(({ id, clip }) => clipLiteral(id, clip)).join("\n")}
} as const satisfies Readonly<Record<string, Clip>>;

export type ClipId = keyof typeof CLIPS;

export interface ClipTarget {
  readonly clips: readonly ClipId[];
  readonly at: Point;
  readonly anchorOrigin?: Point;
  readonly parentOrigin: Point;
  readonly sprites?: readonly { readonly name: string; readonly offset: Point }[];
}

export const TARGETS = {
${[...targets].map(([path, target]) => targetLiteral(path, target)).join("\n")}
} as const satisfies Readonly<Record<string, ClipTarget>>;
`;

export const importAnims = (checkout) => {
  const assets = join(checkout, "Assets");
  const animations = join(assets, "Graphics/Animations");
  const controllers = readControllers(assets);
  const clipsByGuid = new Map();

  for (const file of readdirSync(animations).filter((name) => name.endsWith(".anim"))) {
    const path = join(animations, file);
    const guid = guidOf(path);
    const users = [...controllers.values()].filter(({ clips }) => clips.includes(guid)).map(({ name }) => name).sort();
    const entry = readClip(path, users);

    if (!DROPPED_CLIPS.has(entry.clip.name)) {
      clipsByGuid.set(guid, entry);
    }
  }

  const clips = [...clipsByGuid.values()].sort((a, b) => a.id.localeCompare(b.id));

  if (new Set(clips.map(({ id }) => id)).size !== clips.length) {
    fail("two clips share an id");
  }

  return render(clips, readTargets(assets, controllers, clipsByGuid));
};

const main = (args) => {
  const check = args.includes("--check");
  const [checkout, ...rest] = args.filter((arg) => arg !== "--check");

  if (checkout === undefined || rest.length > 0) {
    console.error("usage: npm run anims -- <path to after-the-waves-crash checkout> [--check]");
    return 1;
  }

  const output = importAnims(checkout);

  if (!check) {
    writeFileSync(OUT, output);
    console.log(`wrote ${OUT}`);
    return 0;
  }

  let current = "";

  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    // Missing counts as out of date.
  }

  console.log(current === output ? "src/assets/anims.ts is up to date" : "src/assets/anims.ts is out of date");
  return current === output ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
