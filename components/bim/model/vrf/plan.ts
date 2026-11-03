/**
 * Pure planning for the VRF chapter — no THREE, no React — so the self-check
 * runs under plain Node: `node components/bim/model/vrf/plan.check.mjs`.
 *
 * Every refrigerant line, fitting, support and box becomes a piece with its own
 * story window: a pipe extrudes segment by segment (each segment's window is
 * when its run's front passes it), joints appear as the front turns a corner,
 * fittings, clamps and supports pop as the front reaches them, boxes grow in.
 * So the whole system is a pure function of bim.story. Sizes are illustrative.
 *
 * Heat recovery: three pipes (liquid, discharge, suction) from the modules to
 * each floor's branch selector box, then a two-pipe pair (liquid, gas) from the
 * box to each cassette. Pipes in a bundle keep a fixed lane to the left of
 * travel, so turns nest and no two lines ever cross (plan.check proves it).
 */
import { CORE, LEVELS, ROOF_Y, SPLIT, VRF, cassetteAt, ceilingTop, splitLineSet, vrfBoxAt, vrfY, type V3 } from "../../geometry";
import type { Window } from "../../timeline";
import { CASSETTES, FLOOR_IDS, H, W, cassetteWin, sub } from "./schedule";

export type Mat = "cu" | "ins" | "shade" | "eq";
export type Axis = 0 | 1 | 2;
export type Grow = "pop" | "down" | "up";

/** A pipe length extruding from `a` along +/- axis over its window. */
export type Cyl = { a: V3; axis: Axis; dir: number; len: number; r: number; mat: Mat; w: Window };
/** A fitting, clamp, sleeve or ID band: a short cylinder that pops on over its window. */
export type Ring = { c: V3; axis: Axis; r: number; len: number; mat: Mat; w: Window };
/** A corner joint: appears whole the moment the pipe front reaches it. */
export type Ball = { c: V3; r: number; mat: Mat; w: Window };
/** pop: scales in about its centre; down / up: grows from its top / bottom face. */
export type Box = { c: V3; s: V3; mat: Mat; grow: Grow; edge: boolean; w: Window };
/** One pipe: an axis-aligned polyline built eased over w (the riser: linearly). */
export type Run = { pts: V3[]; r: number; mat: Mat; w: Window; linear: boolean; joinStart: boolean };
/** A refrigerant flow path for the light streaks, live once `ready` (story) has passed. */
export type Stream = { pts: V3[]; ready: number };
export type CassetteSpot = { c: V3; w: Window };

export type VrfPlan = {
  runs: Run[];
  cyls: Cyl[];
  /** per run: its cylinders are cyls[first .. first + count) — the glowing head rides the growing one */
  heads: { first: number; count: number; r: number }[];
  balls: Ball[];
  rings: Ring[];
  boxes: Box[];
  /** main liquid path, modules -> riser foot, and the suction path back (kit Pulses) */
  liquid: V3[];
  gas: V3[];
  streams: Stream[];
  cassettes: CassetteSpot[];
};

/* ----------------------------------------------------------- constants -- */

type Line = { r: number; mat: Mat; q: number };
/** The 3-pipe main: outer radius (insulation included) and lane offset to the left of travel. */
export const MAIN: readonly Line[] = [
  { r: 0.016, mat: "cu", q: 0.085 }, // liquid — bare copper, the header's south lane (faces the camera)
  { r: 0.026, mat: "ins", q: 0 }, // discharge (high-pressure gas) — the third pipe of heat recovery
  { r: 0.034, mat: "ins", q: -0.085 }, // suction gas
];
export const PAIR: readonly Line[] = [
  { r: 0.012, mat: "cu", q: -0.03 }, // liquid
  { r: 0.026, mat: "ins", q: 0.03 }, // gas
];
const LINE_SET: readonly Line[] = [
  { r: 0.011, mat: "cu", q: -0.0275 },
  { r: 0.024, mat: "ins", q: 0.0275 },
];

/** Roof membrane top (Structure's MEMBRANE_T) — supports and frames stand on it. */
export const ROOF_TOP = ROOF_Y + 0.06;
export const UNIT_BASE = ROOF_Y + VRF.rail;
/** Service stubs leave each module's front face (south) low down... */
export const FRONT_Z = VRF.z + VRF.d / 2;
export const STUB_Y = UNIT_BASE + 0.18;
export const stubX = (m: number, j: number) => VRF.modulesX[m] - 0.45 + 0.1 * j;
/** ...and drop into a header that runs in front of the row on sleepers. */
const HEADER_Z = FRONT_Z + 0.32;

const BOX = VRF.box;
const BOX_W = BOX.x - BOX.w / 2;
/** the 3-pipe feed enters the box's west face a touch above centre; pairs leave the south / north faces below it */
const feedY = (i: number) => vrfBoxAt(i)[1] + 0.03;
const portY = (i: number) => vrfBoxAt(i)[1] - 0.05;

/** Cassette build: face panel at the ceiling line, body above, four louvred slots and a centre grille below. */
export const CASSETTE = { panelT: 0.03, body: 0.7, slot: 0.3, slotLen: 0.52, slotW: 0.075, rod: 0.3 } as const;
const BODY_HALF = CASSETTE.body / 2;

/**
 * Box -> cassette routes: the box face the pair leaves (+1 south / -1 north), its lane
 * east of the box centre, and its turn line relative to the cassette. The west-most
 * south lane turns first so it passes north of cassette 1 and enters cassette 0 from
 * the north; the rest enter the near side face.
 */
const ROUTE = [
  { face: 1, lane: -0.17, turn: -0.65 },
  { face: 1, lane: 0, turn: -0.15 },
  { face: 1, lane: 0.17, turn: -0.15 },
  { face: -1, lane: -0.1, turn: 0.15 },
  { face: -1, lane: 0.1, turn: 0.15 },
] as const;

/** Split line set: up the core face, west over the core roof, into the condenser's side valves. */
const COND = SPLIT.condenser;
export const VALVE = { x: COND.x + COND.w / 2, y: ROOF_TOP + COND.stand + 0.1, z: COND.z + 0.02 } as const;

/** Story span of a fitting popping on. */
const POP = (H.piping[1] - H.piping[0]) * 0.06;

/* ------------------------------------------------------------ polylines -- */

const EPS = 1e-6;

export function axisOf(a: V3, b: V3): Axis {
  if (Math.abs(b[0] - a[0]) > EPS) return 0;
  if (Math.abs(b[1] - a[1]) > EPS) return 1;
  return 2;
}
const segLen = (a: V3, b: V3) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]);
export const pathLength = (pts: readonly V3[]) => pts.reduce((L, p, k) => (k ? L + segLen(pts[k - 1], p) : 0), 0);
const add = (p: V3, o: readonly number[]): V3 => [p[0] + o[0], p[1] + o[1], p[2] + o[2]];

/**
 * One line of a bundle: the centre polyline moved q to the left of travel
 * (left = up x direction, in plan). A vertical takes its x offset from whichever
 * horizontal neighbour carries one and its z offset likewise — a riser between a
 * north run and an east run sits on the diagonal, so both turns nest.
 */
export function offsetPath(pts: readonly V3[], q: number): V3[] {
  const n = pts.length;
  const offs: number[][] = [];
  for (let k = 0; k < n - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    offs.push(axisOf(a, b) === 1 ? [NaN, 0, NaN] : [Math.sign(b[2] - a[2]) * q, 0, -Math.sign(b[0] - a[0]) * q]);
  }
  const flat = (o: number[] | undefined) => o !== undefined && !Number.isNaN(o[0]);
  offs.forEach((o, k) => {
    if (flat(o)) return;
    const near = [offs[k - 1], offs[k + 1]].filter(flat);
    const pick = (c: number) => near.find((m) => m[c] !== 0)?.[c] ?? 0;
    offs[k] = [pick(0), 0, pick(2)];
  });
  return pts.map((p, k) => {
    if (k === 0) return add(p, offs[0]);
    if (k === n - 1) return add(p, offs[n - 2]);
    const A = offs[k - 1];
    const B = offs[k];
    const aAx = axisOf(pts[k - 1], p);
    const bAx = axisOf(p, pts[k + 1]);
    return add(
      p,
      [0, 1, 2].map((c) => (c === aAx ? B[c] : c === bAx ? A[c] : A[c])),
    );
  });
}

/** Distance along the polyline to a point on it. */
export function distAlong(pts: readonly V3[], p: V3): number {
  let d = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const ax = axisOf(a, b);
    const on = [0, 1, 2].every((c) => c === ax || Math.abs(p[c] - a[c]) < EPS);
    if (on && p[ax] >= Math.min(a[ax], b[ax]) - EPS && p[ax] <= Math.max(a[ax], b[ax]) + EPS) return d + Math.abs(p[ax] - a[ax]);
    d += segLen(a, b);
  }
  throw new Error(`distAlong: [${p.join(", ")}] is not on the path`);
}

const invEase = (y: number) => (y < 0.5 ? Math.cbrt(y / 4) : 1 - Math.cbrt(2 * (1 - y)) / 2);
/** Story value at which a run's front reaches distance d along it (eased in-out like timeline.ease, or linear). */
export function arrival(run: Run, d: number): number {
  const f = Math.min(1, Math.max(0, d / pathLength(run.pts)));
  return run.w[0] + (run.w[1] - run.w[0]) * (run.linear ? f : invEase(f));
}
const arrivalAt = (run: Run, p: V3) => arrival(run, distAlong(run.pts, p));

/* ---------------------------------------------------------------- routes -- */

/** Main line j as three runs: module stubs, the roof run (header west, north on sleepers), the riser. */
function mainLine(j: number) {
  const { q } = MAIN[j];
  const stubs = VRF.modulesX.map((_, m): V3[] => {
    const x = stubX(m, j);
    return [
      [x, STUB_Y, FRONT_Z],
      [x, STUB_Y, HEADER_Z + q],
      [x, VRF.roofY, HEADER_Z + q],
    ];
  });
  // offset as one line through the L1 feed, so the riser takes its diagonal from both turns
  const path = offsetPath(
    [
      [stubX(2, j), VRF.roofY, HEADER_Z],
      [VRF.riserX, VRF.roofY, HEADER_Z],
      [VRF.riserX, VRF.roofY, VRF.riserZ],
      [VRF.riserX, feedY(0), VRF.riserZ],
      [BOX_W, feedY(0), VRF.riserZ],
    ],
    q,
  );
  return { stubs, roof: path.slice(0, 3), riser: path.slice(2, 4) };
}

/** Riser tee on floor i -> the branch selector box's west face. */
function feedLine(i: number, j: number): V3[] {
  const { q } = MAIN[j];
  return [
    [VRF.riserX - q, feedY(i), VRF.riserZ - q],
    [BOX_W, feedY(i), VRF.riserZ - q],
  ];
}

/** Centre of the pair box -> cassette k on floor i: out of the box face, drop to the branch level, run, enter the unit. */
export function branchCentre(i: number, k: number): V3[] {
  const r = ROUTE[k];
  const [cx, , cz] = cassetteAt(i, k);
  const y = vrfY(i);
  const face = BOX.z + (r.face * BOX.d) / 2;
  const out = face + 0.1 * r.face;
  const x = BOX.x + r.lane;
  const turn = cz + r.turn;
  const pts: V3[] = [
    [x, portY(i), face],
    [x, portY(i), out],
    [x, y, out],
    [x, y, turn],
  ];
  if (Math.abs(turn - cz) < BODY_HALF) pts.push([cx - Math.sign(cx - x) * BODY_HALF, y, turn]);
  else pts.push([cx, y, turn], [cx, y, cz - Math.sign(cz - turn) * BODY_HALF]);
  return pts;
}

const splitCentre: V3[] = [
  splitLineSet[0],
  splitLineSet[1],
  [VALVE.x + 0.125, splitLineSet[1][1], splitLineSet[1][2]],
  [VALVE.x + 0.125, splitLineSet[1][1], VALVE.z],
  [VALVE.x + 0.125, VALVE.y, VALVE.z],
  [VALVE.x, VALVE.y, VALVE.z],
];

/* ------------------------------------------------------------- planning -- */

type Ctx = { runs: Run[]; rings: Ring[]; boxes: Box[]; streams: Stream[] };
type Spec = { axis: 0 | 2; at: number; from: number; to: number };

const v3 = (axis: number, along: number, other: number, y: number): V3 =>
  axis === 0 ? [along, y, other] : [other, y, along];

/** Pipes of `ids` crossing the plane axis = at (other plan coordinate within [from, to]) at elevation y. */
function crossings(ctx: Ctx, ids: readonly number[], s: Spec, y: number) {
  const o = s.axis === 0 ? 2 : 0;
  const hits: { p: V3; run: Run }[] = [];
  for (const id of ids) {
    const run = ctx.runs[id];
    for (let k = 1; k < run.pts.length; k++) {
      const a = run.pts[k - 1];
      const b = run.pts[k];
      if (axisOf(a, b) !== s.axis || Math.abs(a[1] - y) > EPS || a[o] < s.from || a[o] > s.to) continue;
      if (s.at <= Math.min(a[s.axis], b[s.axis]) + 0.1 || s.at >= Math.max(a[s.axis], b[s.axis]) - 0.1) continue;
      hits.push({ p: v3(s.axis, s.at, a[o], y), run });
    }
  }
  if (!hits.length) throw new Error(`support at ${s.axis ? "z" : "x"} = ${s.at} carries no pipe`);
  return hits;
}

/**
 * A support under the pipes crossing a plane: a strut channel with a clamp on every
 * pipe, hung from the slab soffit on two rods (trapeze) or set on a block on the
 * roof (sleeper). It goes in just before the first pipe reaches it.
 */
function addSupport(ctx: Ctx, ids: readonly number[], s: Spec, y: number, soffit: number | null) {
  const hits = crossings(ctx, ids, s, y);
  const o = s.axis === 0 ? 2 : 0;
  const lo = Math.min(...hits.map((h) => h.p[o])) - 0.08;
  const hi = Math.max(...hits.map((h) => h.p[o])) + 0.08;
  const top = y - Math.max(...hits.map((h) => h.run.r));
  const bottom = top - 0.04;
  const t = Math.min(...hits.map((h) => arrivalAt(h.run, h.p)));
  const at = (along: number, other: number, yy: number) => v3(s.axis, along, other, yy);
  const size = (along: number, other: number, sy: number): V3 => (s.axis === 0 ? [along, sy, other] : [other, sy, along]);
  ctx.boxes.push({ c: at(s.at, (lo + hi) / 2, top - 0.02), s: size(0.045, hi - lo, 0.04), mat: "eq", grow: "pop", edge: true, w: [t - 2 * POP, t - 0.5 * POP] });
  if (soffit !== null) {
    for (const e of [lo + 0.03, hi - 0.03]) {
      ctx.boxes.push({ c: at(s.at, e, (soffit + bottom) / 2), s: [0.012, soffit - bottom, 0.012], mat: "shade", grow: "down", edge: false, w: [t - 3.5 * POP, t - 1.5 * POP] });
    }
  } else {
    ctx.boxes.push({ c: at(s.at, (lo + hi) / 2, (ROOF_TOP + bottom) / 2), s: size(0.16, hi - lo - 0.04, bottom - ROOF_TOP), mat: "shade", grow: "up", edge: true, w: [t - 3.5 * POP, t - 1.5 * POP] });
  }
  for (const h of hits) {
    const ta = arrivalAt(h.run, h.p);
    ctx.rings.push({ c: h.p, axis: s.axis, r: h.run.r + 0.008, len: 0.03, mat: "shade", w: [ta, ta + POP] });
  }
}

function addRun(ctx: Ctx, pts: V3[], line: Line, w: Window, linear = false, joinStart = false): number {
  ctx.runs.push({ pts, r: line.r, mat: line.mat, w, linear, joinStart });
  return ctx.runs.length - 1;
}
const pop = (t: number): Window => [t, t + POP];
/** A fitting at the end of a run, set back `back` m along its last segment, popping on over w. */
function endRing(ctx: Ctx, pts: readonly V3[], start: boolean, back: number, r: number, len: number, w: Window) {
  const [a, b] = start ? [pts[0], pts[1]] : [pts[pts.length - 1], pts[pts.length - 2]];
  const ax = axisOf(a, b);
  const c: [number, number, number] = [a[0], a[1], a[2]];
  c[ax] += Math.sign(b[ax] - a[ax]) * back;
  ctx.rings.push({ c, axis: ax, r, len, mat: "cu", w });
}

/** Modules -> roof -> riser -> every floor's box: runs, stubs, tees, clamps, the roof portal, sleepers. */
function planMain(ctx: Ctx) {
  const lines = MAIN.map((_, j) => mainLine(j));
  const roofIds: number[] = [];
  const risers: Run[] = [];
  lines.forEach((L, j) => {
    const line = MAIN[j];
    L.stubs.forEach((s) => {
      addRun(ctx, s, line, W.stubs);
      ctx.rings.push({ c: [s[0][0], s[0][1], s[0][2] + 0.012], axis: 2, r: line.r * 1.45, len: 0.03, mat: "cu", w: pop(W.stubs[0]) });
    });
    roofIds.push(addRun(ctx, L.roof, line, W.roof, false, true));
    const roof = ctx.runs[roofIds[j]];
    const riser = ctx.runs[addRun(ctx, L.riser, line, W.riser, true, true)];
    risers.push(riser);
    // modules 1 and 2 tee into the header (module 3's stubs turn into it)
    for (const s of L.stubs.slice(0, 2)) {
      const at = s[s.length - 1];
      ctx.rings.push({ c: at, axis: 0, r: line.r * 1.5, len: 0.12, mat: "cu", w: pop(Math.max(arrivalAt(roof, at), W.stubs[1])) });
    }
    // riser clamps on every floor slab, then each floor's refnet tee and feed to its box
    for (let i = 1; i < LEVELS.length - 1; i++) {
      const at: V3 = [VRF.riserX - line.q, LEVELS[i].y + 0.06, VRF.riserZ - line.q];
      ctx.rings.push({ c: at, axis: 1, r: line.r + 0.012, len: 0.05, mat: "shade", w: pop(arrivalAt(riser, at)) });
    }
    for (const i of FLOOR_IDS) {
      const pts = feedLine(i, j);
      const t = arrivalAt(riser, pts[0]);
      addRun(ctx, pts, line, [t, t + W.feedSpan], false, i === 0);
      if (i > 0) ctx.rings.push({ c: pts[0], axis: 1, r: line.r * 1.5, len: 0.13, mat: "cu", w: pop(t) });
      endRing(ctx, pts, false, 0.012, line.r * 1.4, 0.025, sub(W.boxes[i], 0.6, 1));
      if (j === 0) ctx.streams.push({ pts, ready: t + W.feedSpan });
      if (j === 2) ctx.streams.push({ pts: [...pts].reverse(), ready: t + W.feedSpan });
    }
  });

  // floor plates where the riser passes each slab
  const [rx, , rz] = risers[0].pts[0];
  for (let i = 1; i < LEVELS.length - 1; i++) {
    const t = arrivalAt(risers[0], [rx, LEVELS[i].y, rz]);
    ctx.boxes.push({ c: [VRF.riserX, LEVELS[i].y + 0.01, VRF.riserZ], s: [0.36, 0.02, 0.36], mat: "shade", grow: "pop", edge: true, w: [t - POP, t] });
  }
  // roof penetration: a pipe portal with a cap over the riser head
  ctx.boxes.push({ c: [VRF.riserX, ROOF_TOP + 0.21, VRF.riserZ], s: [0.5, 0.42, 0.5], mat: "shade", grow: "up", edge: true, w: sub(W.roof, 0, 0.25) });
  ctx.boxes.push({ c: [VRF.riserX, ROOF_TOP + 0.445, VRF.riserZ], s: [0.6, 0.05, 0.6], mat: "eq", grow: "pop", edge: true, w: sub(W.roof, 0.15, 0.35) });
  // sleepers under the header and the north run
  for (const at of [4.2, 2.45, 1.3]) addSupport(ctx, roofIds, { axis: 0, at, from: HEADER_Z - 0.2, to: HEADER_Z + 0.2 }, VRF.roofY, null);
  for (const at of [4.7, 3.2, 1.7, 0.2]) addSupport(ctx, roofIds, { axis: 2, at, from: VRF.riserX - 0.2, to: VRF.riserX + 0.2 }, VRF.roofY, null);

  const full = (j: number) => [...lines[j].stubs[2], ...lines[j].roof.slice(1), ...lines[j].riser.slice(1)];
  return { liquid: full(0), gas: full(2).reverse() };
}

/** Trapeze planes on every floor: the south legs, the north legs, then the east-west legs. Clear of ducts and grilles. */
const TRAPEZES: readonly Spec[] = [
  ...[0.3, 3.0, 4.9].map((at): Spec => ({ axis: 2, at, from: BOX.x - 0.3, to: BOX.x + 0.3 })),
  ...[-2.7, -4.1, -6.6].map((at): Spec => ({ axis: 2, at, from: BOX.x - 0.3, to: BOX.x + 0.3 })),
  ...[0.3, -1.0, -3.3, -5.5].map((at): Spec => ({ axis: 0, at, from: 5.0, to: 5.6 })),
  ...[3.6, 6.6].map((at): Spec => ({ axis: 0, at, from: 5.6, to: 6.1 })),
  ...[0.4, -1.7, 2.9].map((at): Spec => ({ axis: 0, at, from: -8.1, to: -7.6 })),
];

/** Each floor: branch selector box on rods, the five pairs out to the cassettes, trapezes, cassettes. */
function planFloor(ctx: Ctx, i: number) {
  const [bx, by, bz] = vrfBoxAt(i);
  const top = ceilingTop(i);
  const boxIn = sub(W.boxes[i], 0.35, 1);
  ctx.boxes.push({ c: [bx, by, bz], s: [BOX.w, BOX.h, BOX.d], mat: "eq", grow: "pop", edge: true, w: boxIn });
  ctx.boxes.push({ c: [bx + BOX.w / 2 + 0.04, by, bz], s: [0.08, 0.18, 0.26], mat: "shade", grow: "pop", edge: true, w: boxIn });
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const h = top - (by + BOX.h / 2);
    ctx.boxes.push({ c: [bx + dx * 0.22, top - h / 2, bz + dz * 0.17], s: [0.014, h, 0.014], mat: "shade", grow: "down", edge: false, w: sub(W.boxes[i], 0, 0.45) });
  }

  const ids: number[] = [];
  for (let k = 0; k < CASSETTES; k++) {
    const centre = branchCentre(i, k);
    const cw = cassetteWin(i, k);
    PAIR.forEach((line, p) => {
      const pts = offsetPath(centre, line.q);
      ids.push(addRun(ctx, pts, line, W.pairs[i]));
      endRing(ctx, pts, true, 0.012, line.r * 1.4, 0.025, sub(W.boxes[i], 0.6, 1));
      endRing(ctx, pts, false, 0.015, line.r * 1.6, 0.03, sub(cw, 0.7, 1));
      ctx.streams.push({ pts: p === 0 ? pts : [...pts].reverse(), ready: W.pairs[i][1] });
    });
    planCassette(ctx, i, k, cw);
  }
  for (const s of TRAPEZES) addSupport(ctx, ids, s, vrfY(i), top);
}

function planCassette(ctx: Ctx, i: number, k: number, cw: Window) {
  const [cx, cl, cz] = cassetteAt(i, k);
  const C = CASSETTE;
  const bodyH = VRF.cassette.h - C.panelT;
  const rodH = ceilingTop(i) - (cl + VRF.cassette.h);
  const on = sub(cw, 0.35, 1);
  const part = (c: V3, s: V3, mat: Mat, edge = false) => ctx.boxes.push({ c, s, mat, grow: "pop", edge, w: on });
  part([cx, cl + C.panelT / 2, cz], [VRF.cassette.face, C.panelT, VRF.cassette.face], "eq", true);
  part([cx, cl + C.panelT + bodyH / 2, cz], [C.body, bodyH, C.body], "shade", true);
  for (const d of [-1, 1]) {
    part([cx, cl - 0.003, cz + d * C.slot], [C.slotLen, 0.006, C.slotW], "shade");
    part([cx + d * C.slot, cl - 0.003, cz], [C.slotW, 0.006, C.slotLen], "shade");
  }
  part([cx, cl - 0.003, cz], [0.34, 0.006, 0.34], "shade");
  for (const d of [-0.09, 0, 0.09]) part([cx, cl - 0.0075, cz + d], [0.32, 0.004, 0.018], "eq");
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.boxes.push({ c: [cx + dx * C.rod, ceilingTop(i) - rodH / 2, cz + dz * C.rod], s: [0.012, rodH, 0.012], mat: "shade", grow: "down", edge: false, w: sub(cw, 0, 0.45) });
  }
}

/** Steel rail frame under the modules: neoprene pads, two rails, end ties. */
function planRails(ctx: Ctx) {
  const x0 = VRF.modulesX[0] - VRF.w / 2 - 0.15;
  const x1 = VRF.modulesX[VRF.modulesX.length - 1] + VRF.w / 2 + 0.15;
  const railY = (ROOF_TOP + 0.04 + UNIT_BASE) / 2;
  const railH = UNIT_BASE - ROOF_TOP - 0.04;
  for (const dz of [-0.3, 0.3]) {
    for (let t = 0; t <= 3; t++) {
      const x = x0 + 0.2 + ((x1 - x0 - 0.4) * t) / 3;
      ctx.boxes.push({ c: [x, ROOF_TOP + 0.02, VRF.z + dz], s: [0.2, 0.04, 0.18], mat: "shade", grow: "up", edge: false, w: sub(W.rails, 0, 0.5) });
    }
    ctx.boxes.push({ c: [(x0 + x1) / 2, railY, VRF.z + dz], s: [x1 - x0, railH, 0.1], mat: "shade", grow: "up", edge: true, w: sub(W.rails, 0.2, 1) });
  }
  for (const x of [x0 + 0.05, x1 - 0.05]) {
    ctx.boxes.push({ c: [x, railY, VRF.z], s: [0.1, railH, 0.7], mat: "shade", grow: "up", edge: true, w: sub(W.rails, 0.4, 1) });
  }
}

/** The ductless split: line set up the core face to the roof and over to its condenser; straps, sleeve, roof boot, stand. */
function planSplit(ctx: Ctx) {
  const ids = LINE_SET.map((line, p) => {
    const pts = offsetPath(splitCentre, line.q);
    const id = addRun(ctx, pts, line, W.lineSet);
    const run = ctx.runs[id];
    endRing(ctx, pts, true, 0.012, line.r * 1.45, 0.025, pop(W.lineSet[0]));
    endRing(ctx, pts, false, 0.02, line.r * 1.7, 0.05, pop(W.lineSet[1]));
    // sleeve where the line set passes the L4 slab
    const sleeve: V3 = [pts[0][0], LEVELS[3].y + 0.02, pts[0][2]];
    ctx.rings.push({ c: sleeve, axis: 1, r: line.r + 0.012, len: 0.04, mat: "shade", w: pop(arrivalAt(run, sleeve)) });
    // liquid flows condenser -> wall unit, gas back
    ctx.streams.push({ pts: p === 0 ? [...pts].reverse() : pts, ready: W.lineSet[1] });
    return id;
  });
  const gas = ctx.runs[ids[1]];
  const [x, , z] = splitLineSet[0];
  const front = gas.pts[0][0] + gas.r;
  // wall straps up the core face, clear of the L4 slab
  for (const y of [LEVELS[2].y + 3.2, LEVELS[3].y + 0.6, LEVELS[3].y + 1.85, LEVELS[3].y + 3.1]) {
    const t = arrivalAt(gas, [gas.pts[0][0], y, gas.pts[0][2]]);
    ctx.boxes.push({ c: [(CORE.x1 + front) / 2, y, z], s: [front - CORE.x1, 0.035, 0.13], mat: "shade", grow: "pop", edge: true, w: [t - POP, t] });
  }
  const tb = arrivalAt(gas, [gas.pts[0][0], ROOF_TOP, gas.pts[0][2]]);
  ctx.boxes.push({ c: [x, ROOF_TOP + 0.08, z], s: [0.16, 0.16, 0.2], mat: "shade", grow: "up", edge: true, w: [tb - 2 * POP, tb - 0.5 * POP] });
  for (const at of [-12.6, -13.1]) addSupport(ctx, ids, { axis: 0, at, from: z - 0.15, to: z + 0.15 }, splitLineSet[1][1], null);
  for (const dx of [-1, 1]) {
    ctx.boxes.push({ c: [COND.x + dx * (COND.w / 2 - 0.08), ROOF_TOP + COND.stand / 2, COND.z], s: [0.06, COND.stand, COND.d + 0.1], mat: "shade", grow: "up", edge: true, w: sub(W.condenser, 0, 0.3) });
  }
}

/** Every piece of the chapter. Runs become cylinders (one per segment), corner joints and ID bands. */
export function planVrf(): VrfPlan {
  const ctx: Ctx = { runs: [], rings: [], boxes: [], streams: [] };
  planRails(ctx);
  const { liquid, gas } = planMain(ctx);
  for (const i of FLOOR_IDS) planFloor(ctx, i);
  planSplit(ctx);

  const cyls: Cyl[] = [];
  const balls: Ball[] = [];
  const heads: VrfPlan["heads"] = [];
  for (const run of ctx.runs) {
    const first = cyls.length;
    let d = 0;
    if (run.joinStart) balls.push({ c: run.pts[0], r: run.r, mat: run.mat, w: [run.w[0], run.w[0]] });
    for (let k = 1; k < run.pts.length; k++) {
      const a = run.pts[k - 1];
      const b = run.pts[k];
      const axis = axisOf(a, b);
      const len = segLen(a, b);
      const t1 = arrival(run, d + len);
      cyls.push({ a, axis, dir: Math.sign(b[axis] - a[axis]), len, r: run.r, mat: run.mat, w: [arrival(run, d), t1] });
      if (k < run.pts.length - 1) balls.push({ c: b, r: run.r, mat: run.mat, w: [t1, t1] });
      // insulated lines carry copper ID bands every 1.6 m along their longer lengths
      if (run.mat === "ins" && len > 1) {
        for (let u = 0.35; u <= len - 0.35; u += 1.6) {
          const c: [number, number, number] = [a[0], a[1], a[2]];
          c[axis] += Math.sign(b[axis] - a[axis]) * u;
          ctx.rings.push({ c, axis, r: run.r * 1.12, len: 0.045, mat: "cu", w: pop(arrival(run, d + u)) });
        }
      }
      d += len;
    }
    heads.push({ first, count: cyls.length - first, r: run.r });
  }

  const cassettes = FLOOR_IDS.flatMap((i) => VRF.cassettes.map((_, k): CassetteSpot => ({ c: cassetteAt(i, k), w: cassetteWin(i, k) })));
  return { runs: ctx.runs, cyls, heads, balls, rings: ctx.rings, boxes: ctx.boxes, liquid, gas, streams: ctx.streams, cassettes };
}
