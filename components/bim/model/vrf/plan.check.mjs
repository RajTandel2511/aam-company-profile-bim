// Self-check for the VRF planner. Run: node components/bim/model/vrf/plan.check.mjs  (Node >= 22.18 strips the types)
// Proves: every line is orthogonal and builds in order inside the chapter, no two refrigerant
// lines clash (bar their designed tees), and nothing runs through the ducts, grilles, columns,
// controls, roof equipment, the shaft or the cassettes / boxes it does not connect to.
import assert from "node:assert/strict";
import { register } from "node:module";

// plan.ts imports extensionless relatives and "@/lib/..." (tsconfig alias): map both to .ts files for this run
const ROOT = new URL("../../../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export const resolve = (s, c, next) => next(s.startsWith("@/") ? ${JSON.stringify(ROOT)} + s.slice(2) + ".ts" : s.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(s) ? s + ".ts" : s, c);`,
    ),
);
const G = await import("../../geometry.ts");
const { CHAPTERS } = await import("../../timeline.ts");
const { planVrf, offsetPath, axisOf, CASSETTE, VALVE } = await import("./plan.ts");
const { VRF_ANCHORS } = await import("./anchors.ts");

const plan = planVrf();
const [C0, C1] = CHAPTERS.find((c) => c.id === "vrf").range;
const EPS = 1e-6;

/* ---- windows: inside the chapter, ordered, every run's segments tile its window ---- */
const pieces = [...plan.cyls, ...plan.rings, ...plan.balls, ...plan.boxes];
for (const p of pieces) {
  assert.ok(p.w[0] <= p.w[1] + EPS, `window reversed: ${p.w}`);
  assert.ok(p.w[0] >= C0 - EPS && p.w[1] <= C1 + EPS, `window ${p.w.map((v) => v.toFixed(4))} outside the vrf chapter`);
}
plan.heads.forEach(({ first, count }, r) => {
  const run = plan.runs[r];
  assert.ok(Math.abs(plan.cyls[first].w[0] - run.w[0]) < EPS && Math.abs(plan.cyls[first + count - 1].w[1] - run.w[1]) < EPS, `run ${r} spans its window`);
  for (let k = 1; k < count; k++) assert.ok(Math.abs(plan.cyls[first + k].w[0] - plan.cyls[first + k - 1].w[1]) < EPS, `run ${r} segment ${k} hands over`);
});
for (const a of VRF_ANCHORS) assert.ok(a.window[0] < a.window[1] && a.window[0] >= C0 && a.window[1] <= C1 + EPS, `anchor ${a.id} window`);

/* ---- offsets: bundles stay orthogonal and turns nest ---- */
const bend = [[0, 0, 0], [0, 0, 4], [-3, 0, 4], [-3, -2, 4], [-3, -2, 1], [2, -2, 1]];
for (const q of [-0.1, 0, 0.1]) {
  const p = offsetPath(bend, q);
  for (let k = 1; k < p.length; k++) {
    const d = [0, 1, 2].filter((c) => Math.abs(p[k][c] - p[k - 1][c]) > EPS);
    assert.equal(d.length, 1, "offset segments stay axis-aligned");
  }
}
for (const run of plan.runs) {
  assert.ok(run.pts.length >= 2);
  for (let k = 1; k < run.pts.length; k++) {
    const d = [0, 1, 2].filter((c) => Math.abs(run.pts[k][c] - run.pts[k - 1][c]) > EPS);
    assert.equal(d.length, 1, `run segment not orthogonal / zero length: ${run.pts[k - 1]} -> ${run.pts[k]}`);
  }
}

/* ---- clash detection: axis-aligned segments as boxes ---- */
const segBox = (a, b, r) => {
  const ax = axisOf(a, b);
  return [0, 1, 2].map((c) => [Math.min(a[c], b[c]) - (c === ax ? 0 : r), Math.max(a[c], b[c]) + (c === ax ? 0 : r)]);
};
const gap = (A, B) => Math.hypot(...[0, 1, 2].map((c) => Math.max(0, B[c][0] - A[c][1], A[c][0] - B[c][1])));
const overlaps = (A, B) => [0, 1, 2].every((c) => A[c][0] < B[c][1] - EPS && B[c][0] < A[c][1] - EPS);
const segs = plan.runs.flatMap((run, id) => run.pts.slice(1).map((b, k) => ({ id, a: run.pts[k], b, r: run.r })));
const onSeg = (p, s) => {
  const ax = axisOf(s.a, s.b);
  return [0, 1, 2].every((c) => (c === ax ? p[c] >= Math.min(s.a[c], s.b[c]) - EPS && p[c] <= Math.max(s.a[c], s.b[c]) + EPS : Math.abs(p[c] - s.a[c]) < EPS));
};
const ends = (id) => [plan.runs[id].pts[0], plan.runs[id].pts[plan.runs[id].pts.length - 1]];

const CLEAR = 0.004;
let pairs = 0;
for (let i = 0; i < segs.length; i++) {
  for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i];
    const t = segs[j];
    if (s.id === t.id) continue;
    const g = gap(segBox(s.a, s.b, 0), segBox(t.a, t.b, 0));
    if (g >= s.r + t.r + CLEAR) continue;
    // designed junctions: a run's end sitting on the other line (tees, the riser head, the L1 elbow)
    const junction = ends(s.id).some((p) => onSeg(p, t) && (p === s.a || p === s.b || onSeg(p, s))) || ends(t.id).some((p) => onSeg(p, s) && onSeg(p, t));
    assert.ok(junction, `pipes clash (${g.toFixed(3)} m): run ${s.id} ${s.a}->${s.b} vs run ${t.id} ${t.a}->${t.b}`);
    pairs++;
  }
}

/* ---- the other trades and the building ---- */
const B = (x0, x1, y0, y1, z0, z1) => [[Math.min(x0, x1), Math.max(x0, x1)], [Math.min(y0, y1), Math.max(y0, y1)], [Math.min(z0, z1), Math.max(z0, z1)]];
const ductBoxes = (path, [w, h], grow = 0) =>
  path.slice(1).map((b, k) => {
    const a = path[k];
    const ax = axisOf(a, b);
    const half = ax === 1 ? [w / 2, 0, h / 2] : ax === 0 ? [0, h / 2, w / 2] : [w / 2, h / 2, 0];
    return [0, 1, 2].map((c) => [Math.min(a[c], b[c]) - half[c] - grow, Math.max(a[c], b[c]) + half[c] + grow]);
  });
const WRAP = 0.05; // the HVAC builder's insulation wrap / hanger trapezes around the supply side
const obstacles = [];
const ob = (name, list) => list.forEach((box) => obstacles.push({ name, box }));
for (let i = 0; i < G.FLOORS; i++) {
  ob(`supply main L${i + 1}`, ductBoxes(G.supplyMain(i), G.DUCT.supplyMain, WRAP));
  G.supplyLaterals(i).forEach((p) => ob(`supply lateral L${i + 1}`, ductBoxes(p, G.DUCT.supplyLateral, WRAP)));
  ob(`return main L${i + 1}`, ductBoxes(G.returnMain(i), G.DUCT.returnMain));
  ob(`exhaust branch L${i + 1}`, ductBoxes(G.exhaustBranch(i), G.DUCT.exhaustBranch));
  // diffusers and grilles: plate + boot + neck up to their duct (as one column per terminal)
  for (const [x, y, z] of G.diffusers(i)) ob("diffuser", [B(x - 0.3, x + 0.3, y, G.supplyY(i), z - 0.3, z + 0.3)]);
  for (const [x, y, z] of G.returnGrilles(i)) ob("return grille", [B(x - 0.6, x + 0.6, y, G.returnY(i), z - 0.3, z + 0.3)]);
  for (const [x, y, z] of G.exhaustGrilles(i)) ob("exhaust grille", [B(x - 0.23, x + 0.23, y, G.exhaustY(i), z - 0.23, z + 0.23)]);
  // controls: soffit runs and the drop down column C2
  ob("controls line", ductBoxes(G.sensorRoutes[i].slice(1), [0.04, 0.04]));
}
ob("supply trunk", ductBoxes(G.supplyTrunk, G.DUCT.supplyTrunk));
ob("return trunk", ductBoxes(G.returnTrunk, G.DUCT.returnTrunk));
ob("exhaust riser", ductBoxes(G.exhaustRiser, G.DUCT.exhaustRiser));
ob("controls roof", [...ductBoxes(G.rtuRoute.slice(1), [0.04, 0.04]), ...ductBoxes(G.fanRoute.slice(1), [0.04, 0.04])]);
for (const x of G.GRID_X) for (const z of G.GRID_Z) ob("column", [B(x - G.COLUMN / 2, x + G.COLUMN / 2, 0, G.ROOF_Y, z - G.COLUMN / 2, z + G.COLUMN / 2)]);
ob("shaft", [B(G.SHAFT.x0, G.SHAFT.x1, 0, G.ROOF_Y + 0.5, G.SHAFT.z0, G.SHAFT.z1)]);
ob("core", [B(G.CORE.x0, G.CORE.x1, 0, G.ROOF_Y, G.CORE.z0, G.CORE.z1)]);
ob("penthouse", [B(G.PENTHOUSE.x0, G.PENTHOUSE.x1, G.ROOF_Y, G.PENTHOUSE.top, G.PENTHOUSE.z0, G.PENTHOUSE.z1)]);
ob("RTU-1", [B(G.RTU.cx - G.RTU.w / 2, G.RTU.cx + G.RTU.w / 2, G.ROOF_Y, G.RTU_BASE + G.RTU.h + 0.3, G.RTU.cz - G.RTU.d / 2, G.RTU.cz + G.RTU.d / 2)]);
ob("OA hood + intake", [B(G.OA.intakeFromX, G.OA.x + G.OA.depth, G.OA.y - 1.2, G.OA.y + 1.2, G.OA.z - 1.4, G.OA.z + 1.4)]);
ob("EF-1", [B(G.EXHAUST.riserX - 1, G.EXHAUST.riserX + 1, G.ROOF_Y, G.ROOF_Y + 1.6, G.EXHAUST.riserZ - 1, G.EXHAUST.riserZ + 1)]);
for (const f of G.ROOF_FANS) ob(f.tag, [B(f.x - f.r - 0.1, f.x + f.r + 0.1, G.ROOF_Y, G.ROOF_Y + f.curb + f.h, f.z - f.r - 0.1, f.z + f.r + 0.1)]);
// own equipment the pipes only connect to: modules, cassettes, boxes, the wall unit and condenser
const U = G.VRF;
for (const x of U.modulesX) ob("VRF module", [B(x - U.w / 2, x + U.w / 2, G.ROOF_Y + U.rail, G.ROOF_Y + U.rail + U.h, U.z - U.d / 2, U.z + U.d / 2)]);
for (let i = 0; i < G.FLOORS; i++) {
  const [bx, by, bz] = G.vrfBoxAt(i);
  ob("BS box", [B(bx - U.box.w / 2, bx + U.box.w / 2, by - U.box.h / 2, by + U.box.h / 2, bz - U.box.d / 2, bz + U.box.d / 2)]);
  for (let k = 0; k < U.cassettes.length; k++) {
    const [cx, cl, cz] = G.cassetteAt(i, k);
    const h = CASSETTE.body / 2;
    ob("cassette", [B(cx - h, cx + h, cl, cl + U.cassette.h, cz - h, cz + h)]);
  }
}
const SW = G.SPLIT.wall;
ob("wall split", [B(SW.x - SW.d / 2, SW.x + SW.d / 2, SW.y - SW.h / 2, SW.y + SW.h / 2, SW.z - SW.w / 2, SW.z + SW.w / 2)]);
const SC = G.SPLIT.condenser;
ob("split condenser", [B(SC.x - SC.w / 2, SC.x + SC.w / 2, G.ROOF_Y + 0.06 + SC.stand, G.ROOF_Y + 0.06 + SC.stand + SC.h, SC.z - SC.d / 2, SC.z + SC.d / 2)]);

const SHRINK = 0.003; // a pipe may end flush on a face, never enter
for (const s of segs) {
  const box = segBox(s.a, s.b, s.r);
  for (const o of obstacles) {
    const inner = o.box.map(([lo, hi]) => [lo + SHRINK, hi - SHRINK]);
    assert.ok(!overlaps(box, inner), `run ${s.id} ${s.a.map((v) => v.toFixed(3))} -> ${s.b.map((v) => v.toFixed(3))} runs into the ${o.name}`);
  }
}

// supports, rods, plates and boxes keep out of the other trades too (they may touch their own equipment)
const OWN = new Set(["VRF module", "BS box", "cassette", "wall split", "split condenser"]);
for (const b of plan.boxes) {
  const box = [0, 1, 2].map((c) => [b.c[c] - b.s[c] / 2, b.c[c] + b.s[c] / 2]);
  for (const o of obstacles) {
    if (OWN.has(o.name)) continue;
    const inner = o.box.map(([lo, hi]) => [lo + SHRINK, hi - SHRINK]);
    assert.ok(!overlaps(box, inner), `box at ${b.c.map((v) => v.toFixed(2))} (${b.s.map((v) => v.toFixed(2))}) runs into the ${o.name}`);
  }
}

/* ---- connections land where they should ---- */
for (let i = 0; i < G.FLOORS; i++) {
  for (let k = 0; k < U.cassettes.length; k++) {
    const [cx, , cz] = G.cassetteAt(i, k);
    const pairEnds = plan.runs.filter((r) => r.pts[0][1] < G.vrfBoxAt(i)[1] && Math.abs(r.pts[0][1] - G.vrfBoxAt(i)[1]) < 0.1).map((r) => r.pts[r.pts.length - 1]);
    const hit = pairEnds.filter(([x, , z]) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= CASSETTE.body / 2 + EPS && Math.max(Math.abs(x - cx), Math.abs(z - cz)) >= CASSETTE.body / 2 - EPS);
    assert.equal(hit.length, 2, `floor ${i + 1} cassette ${k}: a liquid + gas pair ends on its body face`);
  }
}
const valves = plan.runs.filter((r) => Math.abs(r.pts[r.pts.length - 1][0] - VALVE.x) < EPS);
assert.equal(valves.length, 2, "the line set lands on the condenser's side valves");

const by = (m) => (list) => list.filter((p) => p.mat === m).length;
console.log(
  `plan.check: ok — ${plan.runs.length} runs, ${plan.cyls.length} pipe lengths (${by("cu")(plan.cyls)} copper), ${plan.balls.length} joints, ` +
    `${plan.rings.length} fittings/clamps/bands, ${plan.boxes.length} boxes, ${plan.streams.length} flow paths; ${pairs} designed junctions`,
);
