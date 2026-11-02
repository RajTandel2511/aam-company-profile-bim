// Self-check for the scroll drone track. Run: node components/bim/drone/track.check.mjs
// Flies the track at fine steps and asserts the camera hits every key on time, never
// enters ductwork or equipment, keeps clear of the columns, and stays outside the
// building until the X-ray / section box are on (story 0.3).
import assert from "node:assert/strict";
import * as THREE from "three";
import { KEYS, monotone, sampleTrack } from "./track.ts";
import * as G from "../geometry.ts";

const box = (x0, x1, y0, y1, z0, z1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
/** Distance from p to a box (negative inside). */
function dist(p, b) {
  const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1);
  const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
  const dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
  const out = Math.hypot(dx, dy, dz);
  if (out > 0) return out;
  return -Math.min(p.x - b.x0, b.x1 - p.x, p.y - b.y0, b.y1 - p.y, p.z - b.z0, b.z1 - p.z);
}
/** A duct run as boxes, one per orthogonal segment ([w, h] like geometry.DUCT). */
function run(path, [w, h]) {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const vertical = a[1] !== b[1];
    const alongX = a[0] !== b[0];
    const hx = vertical ? w / 2 : alongX ? 0 : w / 2;
    const hy = vertical ? 0 : h / 2;
    const hz = vertical ? h / 2 : alongX ? w / 2 : 0;
    out.push(box(a[0] - hx, b[0] + hx, a[1] - hy, b[1] + hy, a[2] - hz, b[2] + hz));
  }
  return out;
}

const floors = [0, 1, 2, 3];
const FLANGE = 0.06; // TDC flanges stand proud of the duct
const grow = (b, m) => box(b.x0 - m, b.x1 + m, b.y0 - m, b.y1 + m, b.z0 - m, b.z1 + m);
const MEP = [
  ...run(G.supplyTrunk, G.DUCT.supplyTrunk),
  ...run(G.returnTrunk, G.DUCT.returnTrunk),
  ...floors.flatMap((i) => run(G.supplyMain(i), G.DUCT.supplyMain)),
  ...floors.flatMap((i) => G.supplyLaterals(i).flatMap((p) => run([p[0], [p[1][0], p[1][1], p[1][2] + 0.3]], G.DUCT.supplyLateral))),
  ...floors.flatMap((i) => run(G.returnMain(i), G.DUCT.returnMain)),
  ...floors.flatMap((i) => G.diffusers(i).map(([x, y, z]) => box(x - 0.3, x + 0.3, y - 0.05, G.supplyY(i), z - 0.3, z + 0.3))),
  ...floors.flatMap((i) => G.returnGrilles(i).map(([x, y, z]) => box(x - 0.6, x + 0.6, y - 0.05, G.returnY(i), z - 0.3, z + 0.3))),
  ...run(G.exhaustRiser, G.DUCT.exhaustRiser),
  ...floors.flatMap((i) => run(G.exhaustBranch(i), G.DUCT.exhaustBranch)),
].map((b) => grow(b, FLANGE));
const { RTU, RTU_BASE, OA, EXHAUST, CONTROLS, ROOF_Y } = G;
const EQUIPMENT = [
  box(RTU.cx - RTU.w / 2, RTU.cx + RTU.w / 2, ROOF_Y, RTU_BASE + RTU.h + 0.25, RTU.cz - RTU.d / 2, RTU.cz + RTU.d / 2),
  box(OA.x, OA.x + OA.depth, OA.y - OA.height / 2, OA.y + OA.height / 2, OA.z - OA.width / 2, OA.z + OA.width / 2),
  box(EXHAUST.riserX - 0.95, EXHAUST.riserX + 0.95, ROOF_Y, ROOF_Y + EXHAUST.fanCurb + EXHAUST.fanH, EXHAUST.riserZ - 0.95, EXHAUST.riserZ + 0.95),
  box(CONTROLS.panel.x - 0.15, CONTROLS.panel.x + 0.15, CONTROLS.panel.y - 0.6, CONTROLS.panel.y + 0.6, CONTROLS.panel.z - 0.4, CONTROLS.panel.z + 0.4),
];
const COLUMNS = G.GRID_X.flatMap((x) => G.GRID_Z.map((z) => box(x - G.COLUMN / 2, x + G.COLUMN / 2, 0, ROOF_Y, z - G.COLUMN / 2, z + G.COLUMN / 2)));
/** Solid until the X-ray window: the whole envelope (parapet and cladding included), the penthouse and the canopy. */
const SHELL = [
  box(-G.CLAD_X - 0.05, G.CLAD_X + 0.05, -0.1, G.PARAPET.top + 0.1, -G.CURTAIN_Z - 0.05, G.CURTAIN_Z + 0.05),
  box(G.PENTHOUSE.x0, G.PENTHOUSE.x1, ROOF_Y, G.PENTHOUSE.top, G.PENTHOUSE.z0, G.PENTHOUSE.z1),
  box(G.CANOPY.x0, G.CANOPY.x1, G.CANOPY.y - 0.4, G.CANOPY.y + 0.45, G.CANOPY.z0, G.CANOPY.z1),
];
const XRAY_ON = 0.3; // STORY.xray / STORY.section end
const CLEAR = { mep: 0.12, column: 0.3, shell: 0.5, ground: 0.6 };

const pos = new THREE.Vector3();
const tgt = new THREE.Vector3();

// 1. the timing is monotone and lands on every key exactly
const f = monotone([0, 0.2, 0.5, 1], [0, 0.1, 0.9, 1]);
for (let x = 0; x < 1; x += 0.01) assert.ok(f(x + 0.01) >= f(x) - 1e-12, "timing never runs backwards");
for (const [s, p, t] of KEYS) {
  sampleTrack(s, pos, tgt);
  assert.ok(pos.distanceTo(new THREE.Vector3(...p)) < 0.02, `camera on key ${s}: ${pos.toArray().map((v) => v.toFixed(2))}`);
  assert.ok(tgt.distanceTo(new THREE.Vector3(...t)) < 0.02, `target on key ${s}`);
}
for (let i = 1; i < KEYS.length; i++) assert.ok(KEYS[i][0] > KEYS[i - 1][0], `keys in story order at ${KEYS[i][0]}`);
assert.equal(KEYS[0][0], 0);
assert.equal(KEYS[KEYS.length - 1][0], 1);

// 2. fly it
const worst = { mep: [Infinity, 0], column: [Infinity, 0], shell: [Infinity, 0], ground: [Infinity, 0] };
const note = (k, d, s) => d < worst[k][0] && (worst[k] = [d, s]);
let slabCrossings = 0;
let lastY = null;
const STEPS = 20000;
for (let k = 0; k <= STEPS; k++) {
  const s = k / STEPS;
  sampleTrack(s, pos, tgt);
  note("ground", pos.y, s);
  for (const b of MEP.concat(EQUIPMENT)) note("mep", dist(pos, b), s);
  for (const b of COLUMNS) if (s >= XRAY_ON ? b.z1 < G.SECTION_Z : true) note("column", dist(pos, b), s);
  if (s < XRAY_ON) for (const b of SHELL) note("shell", dist(pos, b), s);
  // slabs crossed inside the footprint (allowed once X-rayed; counted so a change shows up)
  const inside = Math.abs(pos.x) < G.SLAB.x && Math.abs(pos.z) < G.SLAB.z && pos.z < G.SECTION_Z;
  if (inside && lastY !== null)
    for (const L of G.LEVELS.slice(1)) if ((lastY - L.y + G.SLAB_T) * (pos.y - L.y + G.SLAB_T) < 0 || (lastY - L.y) * (pos.y - L.y) < 0) slabCrossings++;
  lastY = pos.y;
}
const fmt = (k) => `${k} clearance ${worst[k][0].toFixed(3)} m at story ${worst[k][1].toFixed(4)}`;
assert.ok(worst.mep[0] >= CLEAR.mep, fmt("mep"));
assert.ok(worst.column[0] >= CLEAR.column, fmt("column"));
assert.ok(worst.shell[0] >= CLEAR.shell, fmt("shell"));
assert.ok(worst.ground[0] >= CLEAR.ground, fmt("ground"));

// 3. it ends on a top-down plan (camera within 6° of straight down)
sampleTrack(1, pos, tgt);
const down = tgt.clone().sub(pos).normalize();
assert.ok(-down.y > Math.cos(THREE.MathUtils.degToRad(6)), `plan view at the end (${(-down.y).toFixed(4)})`);

console.log(["drone track ok", fmt("mep"), fmt("column"), fmt("shell"), fmt("ground"), `slab faces crossed after X-ray: ${slabCrossings}`].join("\n  "));
