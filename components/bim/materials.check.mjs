// Self-check for the visual styles in materials.ts — run: node components/bim/materials.check.mjs  (Node >= 22.18 strips the types)
import assert from "node:assert/strict";
import { register } from "node:module";

// materials.ts imports "@/lib/..." (tsconfig alias): map it to the repo root for this run
const ROOT = new URL("../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export const resolve = (s, c, next) => next(s.startsWith("@/") ? ${JSON.stringify(ROOT)} + s.slice(2) + ".ts" : s, c);`,
    ),
);
const { ARCH, MEP, applyXray, copyFinish } = await import("./materials.ts");
const { setViewer } = await import("../../lib/viewer-state.ts");

const FILLS = ["concrete", "concreteShade", "roof", "glass", "mullion", "sheetMetal", "sheetMetalShade"];
const versions = () => FILLS.map((k) => ARCH[k].version).concat(MEP.supply.version, ARCH.edge.version);
const before = versions();

// holo (default): faint fills that never write depth, sheet metal still solid metal, linework past 1 for bloom
applyXray(0);
assert.ok(ARCH.concrete.visible && ARCH.concrete.opacity < 0.5 && !ARCH.concrete.depthWrite);
assert.ok(ARCH.sheetMetal.opacity > 0.9 && ARCH.sheetMetal.depthWrite);
assert.ok(ARCH.edge.color.g > 1);

// shaded: the solid realistic model; wire: fills gone and never occluding (mullions stay as lines), MEP solid
setViewer({ style: "shaded" });
applyXray(0);
for (const k of FILLS) if (k !== "glass") assert.ok(ARCH[k].opacity === 1 && ARCH[k].depthWrite, k);
setViewer({ style: "wire" });
applyXray(0);
for (const k of FILLS) if (k !== "mullion") assert.ok(!ARCH[k].visible && !ARCH[k].depthWrite, k);
assert.ok(MEP.supply.visible && !MEP.supply.transparent);

// X-ray ghosts the architecture in every style, and nothing ghosted writes depth
for (const style of ["holo", "shaded", "wire"]) {
  setViewer({ style });
  applyXray(0);
  const solid = FILLS.map((k) => ARCH[k].opacity);
  applyXray(1);
  FILLS.forEach((k, i) => assert.ok(ARCH[k].opacity <= solid[i] && !ARCH[k].depthWrite, `${style} ${k}`));
}
// MEP glows harder in holo than shaded
setViewer({ style: "shaded" });
applyXray(0);
const shadedGlow = MEP.supply.emissiveIntensity;
setViewer({ style: "holo" });
applyXray(0);
assert.ok(MEP.supply.emissiveIntensity > shadedGlow);

// switching never asks for a shader recompile (no material.version bump)
assert.deepEqual(versions(), before);

// a part's private copy (Envelope's glass fade) can follow a repaint
const fade = ARCH.glass.clone();
setViewer({ style: "shaded" });
applyXray(0);
copyFinish(fade, ARCH.glass);
assert.ok(fade.color.equals(ARCH.glass.color) && fade.metalness === ARCH.glass.metalness);

console.log("materials.check: ok");
