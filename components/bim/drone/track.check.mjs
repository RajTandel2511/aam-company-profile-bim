// Self-check for the scroll drone track. Run: node components/bim/drone/track.check.mjs
// Flies the track at fine steps against the live timeline and asserts the camera hits every key on time; never
// enters ductwork (hangers, VAV boxes, dampers and wrap allowed for), equipment, VRF pieces or a crane's lift
// column; keeps clear of the columns and the core; stays outside the building until the X-ray / section box are on;
// crosses slabs only on the VRF riser drop; frames each card element right of centre on a wide screen while turning
// gently; and ends on a top-down plan.
import assert from "node:assert/strict";
import { register } from "node:module";
import * as THREE from "three";
import { KEYS, monotone, sampleTrack } from "./track.ts";
import * as G from "../geometry.ts";

// timeline.ts imports "@/lib/timing": resolve the "@/" alias to the project root under plain Node
const ROOT = new URL("../../../", import.meta.url).href;
register(`data:text/javascript,export async function resolve(s,c,n){return n(s.startsWith("@/")?${JSON.stringify(ROOT)}+s.slice(2)+".ts":s,c)}`);
const { CHAPTERS, STORY } = await import("../timeline.ts");

const box = (x0, x1, y0, y1, z0, z1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
const grow = (b, m) => box(b.x0 - m, b.x1 + m, b.y0 - m, b.y1 + m, b.z0 - m, b.z1 + m);
/** Distance from p to a box (negative inside). */
function dist(p, b) {
  const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1);
  const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
  const dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
  const out = Math.hypot(dx, dy, dz);
  if (out > 0) return out;
  return -Math.min(p.x - b.x0, b.x1 - p.x, p.y - b.y0, b.y1 - p.y, p.z - b.z0, b.z1 - p.z);
}
/** A duct / pipe run as boxes, one per orthogonal segment ([w, h] like geometry.DUCT). */
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
const sub = (w, a, b) => [w[0] + (w[1] - w[0]) * a, w[0] + (w[1] - w[0]) * b];
const range = (id) => CHAPTERS.find((c) => c.id === id).range;

/* ------------------------------------------------------------ obstacles -- */

const FLOORS = [0, 1, 2, 3];
const { RTU, RTU_BASE, OA, EXHAUST, CONTROLS, ROOF_Y, SUPPLY, VRF, SPLIT, ROOF_FANS } = G;
const H = STORY.hvac;
const V = STORY.vrf;
const X = STORY.exhaust;
/** Everything solid, each present over story [from, to]. */
const SOLID = [];
const add = (boxes, from = 0, to = 1) => boxes.forEach((b) => SOLID.push({ b, from, to }));

// ductwork: TDC flanges + insulation wrap stand proud; mains also carry fire / volume dampers and takeoffs;
// every horizontal run is hung on rods, so the gap up to the slab above it counts as solid
const PROUD = { duct: 0.11, main: 0.2 };
add(run(G.supplyTrunk, G.DUCT.supplyTrunk).map((b) => grow(b, PROUD.main)));
add(run(G.returnTrunk, G.DUCT.returnTrunk).map((b) => grow(b, PROUD.main)));
add(run(G.exhaustRiser, G.DUCT.exhaustRiser).map((b) => grow(b, PROUD.duct)));
for (const i of FLOORS) {
  const slab = G.ceilingTop(i);
  const hung = (boxes, m) => boxes.map((b) => ({ ...grow(b, m), y1: slab }));
  add(hung(run(G.supplyMain(i), G.DUCT.supplyMain), PROUD.main));
  add(hung(run(G.returnMain(i), G.DUCT.returnMain), PROUD.main));
  add(hung(G.supplyLaterals(i).flatMap((p) => run([p[0], [p[1][0], p[1][1], p[1][2] + 0.3]], G.DUCT.supplyLateral)), PROUD.duct));
  add(hung(run(G.exhaustBranch(i), G.DUCT.exhaustBranch), PROUD.duct));
  // terminals: round drops + flex down to each diffuser, grille necks
  add(G.diffusers(i).map(([x, y, z]) => box(x - 0.4, x + 0.4, y - 0.05, G.supplyY(i), z - 0.4, z + 0.4)));
  add(G.returnGrilles(i).map(([x, y, z]) => box(x - 0.66, x + 0.66, y - 0.05, G.returnY(i), z - 0.36, z + 0.36)));
  add(G.exhaustGrilles(i).map(([x, y, z]) => box(x - 0.3, x + 0.3, y - 0.05, G.exhaustY(i), z - 0.3, z + 0.3)));
  // a VAV box at the head of every lateral (inlet collar, controls enclosure), hung from the slab
  add(SUPPLY.lateralsX.map((x) => box(x - 0.6, x + 0.75, G.supplyY(i) - 0.4, slab, SUPPLY.mainZ + 0.4, SUPPLY.mainZ + 2.3)));
}
add([
  box(RTU.cx - RTU.w / 2, RTU.cx + RTU.w / 2, ROOF_Y, RTU_BASE + RTU.h + 0.25, RTU.cz - RTU.d / 2, RTU.cz + RTU.d / 2),
  box(OA.x, OA.x + OA.depth, OA.y - OA.height / 2, OA.y + OA.height / 2, OA.z - OA.width / 2, OA.z + OA.width / 2),
  box(EXHAUST.riserX - 0.95, EXHAUST.riserX + 0.95, ROOF_Y, ROOF_Y + EXHAUST.fanCurb + EXHAUST.fanH, EXHAUST.riserZ - 0.95, EXHAUST.riserZ + 0.95),
  box(CONTROLS.panel.x - 0.15, CONTROLS.panel.x + 0.15, CONTROLS.panel.y - 0.6, CONTROLS.panel.y + 0.6, CONTROLS.panel.z - 0.4, CONTROLS.panel.z + 0.4),
]);
add(ROOF_FANS.map((f) => box(f.x - f.r - 0.15, f.x + f.r + 0.15, ROOF_Y, ROOF_Y + f.curb + f.h + 0.1, f.z - f.r - 0.15, f.z + f.r + 0.15)), range("exhaust")[0]);
add([...G.sensorRoutes, G.rtuRoute, G.fanRoute].flatMap((p) => run(p, [0.2, 0.2])), range("controls")[0]);

// VRF: modules on rails, insulated pairs (on sleepers across the roof), riser, BS boxes hung from the slab,
// cassettes up into the plenum, the wall split, its line set and condenser
const VRF_ON = range("vrf")[0];
const PAIR = [0.26, 0.26];
const { wall: SW, condenser: SC } = SPLIT;
add(VRF.modulesX.map((x) => box(x - VRF.w / 2 - 0.1, x + VRF.w / 2 + 0.1, ROOF_Y, ROOF_Y + VRF.rail + VRF.h + 0.3, VRF.z - VRF.d / 2 - 0.15, VRF.z + VRF.d / 2 + 0.15)), VRF_ON);
add([box(VRF.modulesX[0] - VRF.w / 2 - 0.3, VRF.modulesX[2] + VRF.w / 2 + 0.3, ROOF_Y, ROOF_Y + VRF.rail + 0.05, VRF.z - VRF.d / 2 - 0.25, VRF.z + VRF.d / 2 + 0.25)], VRF_ON);
add(run(G.vrfRoofRun, PAIR).map((b) => ({ ...grow(b, 0.05), y0: ROOF_Y })), VRF_ON);
add([...run(G.vrfRiser, PAIR), ...FLOORS.flatMap((i) => G.vrfBranches(i).flatMap((p) => run(p, PAIR))), ...run(G.splitLineSet, PAIR)].map((b) => grow(b, 0.05)), VRF_ON);
const bsBox = (i) => {
  const [x, y, z] = G.vrfBoxAt(i);
  const { w, h, d } = VRF.box;
  return grow(box(x - w / 2, x + w / 2, y - h / 2, G.ceilingTop(i), z - d / 2, z + d / 2), 0.08);
};
const cassette = ([x, y, z]) => {
  const f = VRF.cassette.face / 2;
  return grow(box(x - f, x + f, y - 0.03, y + VRF.cassette.h, z - f, z + f), 0.05);
};
add(FLOORS.map(bsBox), VRF_ON);
add(FLOORS.flatMap((i) => VRF.cassettes.map((_, k) => cassette(G.cassetteAt(i, k)))), VRF_ON);
add([
  grow(box(SW.x - SW.d / 2, SW.x + SW.d / 2, SW.y - SW.h / 2, SW.y + SW.h / 2, SW.z - SW.w / 2, SW.z + SW.w / 2), 0.08),
  grow(box(SC.x - SC.w / 2, SC.x + SC.w / 2, ROOF_Y, ROOF_Y + SC.stand + SC.h, SC.z - SC.d / 2, SC.z + SC.d / 2), 0.1),
], VRF_ON);

// while a unit is being set, the column above it holds the unit itself, the slings and the crane cable; fans just drop in
const lift = (x, z, hx, hz, top = 90) => box(x - hx, x + hx, ROOF_Y, top, z - hz, z + hz);
add([lift(RTU.cx, RTU.cz, RTU.w / 2, RTU.d / 2)], ...H.rtu);
add([...VRF.modulesX.map((x) => lift(x, VRF.z, VRF.w / 2 + 0.3, VRF.d / 2 + 0.3)), lift(SC.x, SC.z, SC.w / 2 + 0.3, SC.d / 2 + 0.3)], ...V.units);
add([lift(EXHAUST.riserX, EXHAUST.riserZ, 0.95, 0.95, ROOF_Y + EXHAUST.fanCurb + 6 + EXHAUST.fanH)], ...X.fan);
add(ROOF_FANS.map((f) => lift(f.x, f.z, f.r + 0.15, f.r + 0.15, ROOF_Y + 8)), ...X.fans);

const COLUMNS = G.GRID_X.flatMap((x) => G.GRID_Z.map((z) => box(x - G.COLUMN / 2, x + G.COLUMN / 2, 0, ROOF_Y, z - G.COLUMN / 2, z + G.COLUMN / 2)));
const CORE = box(G.CORE.x0, G.CORE.x1, 0, ROOF_Y, G.CORE.z0, G.CORE.z1);
/** Solid until the X-ray is on: the whole envelope (parapet and cladding included), the penthouse and the canopy. */
const SHELL = [
  box(-G.CLAD_X - 0.05, G.CLAD_X + 0.05, -0.1, G.PARAPET.top + 0.1, -G.CURTAIN_Z - 0.05, G.CURTAIN_Z + 0.05),
  box(G.PENTHOUSE.x0, G.PENTHOUSE.x1, ROOF_Y, G.PENTHOUSE.top, G.PENTHOUSE.z0, G.PENTHOUSE.z1),
  box(G.CANOPY.x0, G.CANOPY.x1, G.CANOPY.y - 0.4, G.CANOPY.y + 0.45, G.CANOPY.z0, G.CANOPY.z1),
];
const XRAY_ON = STORY.xray[1];
const CLEAR = { mep: 0.12, structure: 0.3, shell: 0.5, ground: 0.6 };
/** The only place the camera may pass through slabs (X-rayed): following the refrigerant riser down. */
const SLAB_OK = [V.piping[0], V.boxes[1]];

/* -------------------------------------------------------------- framing -- */

/** Wide-screen framing as CameraRig sets it: 16:9, the target pushed right by the view offset, the lens widened inside. */
const WIDE = { aspect: 16 / 9, lens: 30, inside: 20, offset: 0.16, shell: { x: 16.6, top: 17.8, z: 10.6, fade: 3.5 } };
/** Max view turn, degrees per 0.01 of story: anywhere (no whip-pans), and while a card element is held in shot. */
const TURN = { any: 40, card: 20 };
/** Where in each maintenance stop window the camera holds its equipment (fractions; the hops fill the rest). */
const PM_HOLD = [
  [0.18, 0.77],
  [0.28, 0.64],
  [0.55, 0.9],
];
/**
 * Card elements and the story spans the camera holds each in shot — on screen, right of centre (the story panel is
 * on the left), turning gently. Spans are set against the timeline windows they belong to, so they move with it;
 * the element cards should be timed into these spans.
 */
const FOCUS = [
  { label: "RTU-1 landing", w: [sub(H.rtu, 0.78, 1)[0], H.rtu[1]], at: G.SERVICE_STOPS[0].at },
  { label: "L3 fire damper", w: sub(H.fittings, 0.3, 0.92), at: [SUPPLY.trunkX, G.supplyY(2) + G.DUCT.supplyMain[1] / 2 + 0.08, G.SHAFT.z1] },
  { label: "L3 round drop", w: sub(H.round, 0.525, 1), at: [SUPPLY.lateralsX[0], G.supplyY(2) - 0.28, SUPPLY.diffusersZ[0]] },
  { label: "VRF modules", w: sub(V.units, 0.15, 0.93), at: [VRF.modulesX[1], ROOF_Y + 1.2, VRF.z] },
  { label: "L3 BS box", w: sub(V.boxes, 0.65, 0.81), at: G.vrfBoxAt(2) },
  { label: "L3 cassette", w: sub(V.indoor, 0.54, 0.63), at: G.cassetteAt(2, 1) },
  { label: "wall split", w: sub(V.split, 0.79, 1.13), at: [SW.x, SW.y, SW.z] },
  { label: "EF-1", w: sub(X.fan, 0.37, 1), at: G.SERVICE_STOPS[1].at },
  { label: "EF-2 / EF-3", w: [X.fans[1] + 0.0085, X.fans[1] + 0.0135], at: [(ROOF_FANS[0].x + ROOF_FANS[1].x) / 2, ROOF_Y + 0.6, ROOF_FANS[0].z] },
  { label: "OA hood", w: [X.oa[1] + 0.012, X.oa[1] + 0.0195], at: [OA.x + OA.depth / 2, OA.y, OA.z] },
  { label: "EMS-1 power-on", w: sub(STORY.controls.panel, 0.15, 1), at: G.SERVICE_STOPS[2].at },
  { label: "EMS-1 close", w: [STORY.controls.lines[1] - 0.0035, STORY.controls.lines[1] + 0.0035], at: G.SERVICE_STOPS[2].at },
  ...G.SERVICE_STOPS.map((s, k) => ({ label: `PM ${s.tag}`, w: sub(STORY.maintenance.stops[k], ...PM_HOLD[k]), at: s.at })),
];

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const upv = new THREE.Vector3();
const rel = new THREE.Vector3();
const smooth = (x, a, b) => (x <= a ? 0 : x >= b ? 1 : ((x - a) / (b - a)) ** 2 * (3 - 2 * (x - a) / (b - a)));
function lens(p) {
  const { x, top, z, fade } = WIDE.shell;
  const d = Math.hypot(Math.max(Math.abs(p.x) - x, 0), Math.max(p.y - top, -p.y, 0), Math.max(Math.abs(p.z) - z, 0));
  return WIDE.lens + WIDE.inside * (1 - smooth(d, 0, fade));
}
/** Where `at` lands on a wide screen ([x, y] 0..1 from the top-left), or null behind the camera. */
function onScreen(p, t, at) {
  fwd.subVectors(t, p).normalize();
  right.crossVectors(fwd, WORLD_UP).normalize();
  upv.crossVectors(right, fwd);
  rel.set(at[0], at[1], at[2]).sub(p);
  const depth = rel.dot(fwd);
  if (depth <= 0) return null;
  const k = Math.tan(THREE.MathUtils.degToRad(lens(p)) / 2);
  return [0.5 + WIDE.offset + (0.5 * rel.dot(right)) / (depth * k * WIDE.aspect), 0.5 - (0.5 * rel.dot(upv)) / (depth * k)];
}

/* ------------------------------------------------------------------ fly -- */

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
const worst = { mep: [Infinity, 0], structure: [Infinity, 0], shell: [Infinity, 0], ground: [Infinity, 0] };
const note = (k, d, s, b) => d < worst[k][0] && (worst[k] = [d, s, b]);
const crossings = [];
const shots = FOCUS.map(() => ({ x: [Infinity, -Infinity], y: [Infinity, -Infinity], turn: 0, lost: 0 }));
let turnMax = [0, 0];
const lastDir = new THREE.Vector3();
let lastY = null;
const STEPS = 20000;
for (let k = 0; k <= STEPS; k++) {
  const s = k / STEPS;
  sampleTrack(s, pos, tgt);
  note("ground", pos.y, s);
  for (const o of SOLID) if (s >= o.from && s <= o.to) note("mep", dist(pos, o.b), s, o.b);
  for (const b of COLUMNS) if (s < XRAY_ON || b.z1 < G.SECTION_Z) note("structure", dist(pos, b), s);
  note("structure", dist(pos, CORE), s);
  if (s < XRAY_ON) for (const b of SHELL) note("shell", dist(pos, b), s);
  // slab faces crossed inside the footprint (X-rayed and only on the riser drop)
  const inside = Math.abs(pos.x) < G.SLAB.x && Math.abs(pos.z) < G.SLAB.z && pos.z < G.SECTION_Z;
  if (inside && lastY !== null)
    for (const L of G.LEVELS.slice(1)) if ((lastY - L.y + G.SLAB_T) * (pos.y - L.y + G.SLAB_T) < 0 || (lastY - L.y) * (pos.y - L.y) < 0) crossings.push(s);
  lastY = pos.y;

  const dir = tgt.clone().sub(pos).normalize();
  const turn = k > 0 ? (THREE.MathUtils.radToDeg(dir.angleTo(lastDir)) * STEPS) / 100 : 0; // degrees per 0.01 story
  lastDir.copy(dir);
  if (turn > turnMax[0]) turnMax = [turn, s];
  FOCUS.forEach(({ w, at }, i) => {
    if (s < w[0] || s > w[1]) return;
    const shot = shots[i];
    const xy = onScreen(pos, tgt, at);
    if (!xy) return void shot.lost++;
    shot.x = [Math.min(shot.x[0], xy[0]), Math.max(shot.x[1], xy[0])];
    shot.y = [Math.min(shot.y[0], xy[1]), Math.max(shot.y[1], xy[1])];
    if (s > w[0]) shot.turn = Math.max(shot.turn, turn);
  });
}
const near = (b) => (b ? ` (box x ${b.x0.toFixed(2)}…${b.x1.toFixed(2)} y ${b.y0.toFixed(2)}…${b.y1.toFixed(2)} z ${b.z0.toFixed(2)}…${b.z1.toFixed(2)})` : "");
const fmt = (k) => `${k} clearance ${worst[k][0].toFixed(3)} m at story ${worst[k][1].toFixed(4)}${near(worst[k][2])}`;
const table = FOCUS.map(({ label, w }, i) => {
  const { x, y, turn } = shots[i];
  return `${label.padEnd(14)} ${w.map((v) => v.toFixed(4)).join("–")}  x ${x.map((v) => v.toFixed(2)).join("–")}  y ${y.map((v) => v.toFixed(2)).join("–")}  turn ≤ ${turn.toFixed(1)}°`;
});
console.log(["framing (wide screen; x 0 left … 1 right):", ...table].join("\n  "));
assert.ok(worst.mep[0] >= CLEAR.mep, fmt("mep"));
assert.ok(worst.structure[0] >= CLEAR.structure, fmt("structure"));
assert.ok(worst.shell[0] >= CLEAR.shell, fmt("shell"));
assert.ok(worst.ground[0] >= CLEAR.ground, fmt("ground"));
assert.ok(crossings.every((s) => s >= SLAB_OK[0] && s <= SLAB_OK[1]), `slabs crossed outside the riser drop at ${crossings.map((s) => s.toFixed(4))}`);
FOCUS.forEach(({ label }, i) => {
  const { x, y, turn, lost } = shots[i];
  assert.ok(!lost && x[0] >= 0.5 && x[1] <= 0.92 && y[0] >= 0.1 && y[1] <= 0.9, `${label} framed right of centre: ${table[i]}`);
  assert.ok(turn <= TURN.card, `${label}: no whip-pan under its card (${turn.toFixed(1)}° per 0.01)`);
});
assert.ok(turnMax[0] <= TURN.any, `whip-pan: ${turnMax[0].toFixed(1)}° per 0.01 story at ${turnMax[1].toFixed(4)}`);

// 3. it ends on a top-down plan (camera within 6° of straight down)
sampleTrack(1, pos, tgt);
const down = tgt.clone().sub(pos).normalize();
assert.ok(-down.y > Math.cos(THREE.MathUtils.degToRad(6)), `plan view at the end (${(-down.y).toFixed(4)})`);

console.log(
  [
    "drone track ok",
    fmt("mep"),
    fmt("structure"),
    fmt("shell"),
    fmt("ground"),
    `slab faces crossed (riser drop only): ${crossings.length}`,
    `fastest turn ${turnMax[0].toFixed(1)}° per 0.01 story at ${turnMax[1].toFixed(4)}`,
  ].join("\n  "),
);
