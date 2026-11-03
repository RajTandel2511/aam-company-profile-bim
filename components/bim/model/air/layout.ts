/**
 * Pure layout and schedule for the HVAC coordination model: the connector
 * pieces, VAV boxes, round drops, trapeze hangers and insulation wrap that
 * Hvac.tsx draws, and the card anchors (anchors.ts) that point at them. No
 * THREE, no React — `node components/bim/model/air/layout.check.mjs` runs it.
 *
 * Positions route off geometry.ts; every window nests inside STORY.hvac
 * (timeline.ts). Sizes are illustrative presentation values, not a design.
 */
import {
  DUCT,
  FLOORS,
  RETURN,
  ROOF_FANS,
  SHAFT,
  SUPPLY,
  ceilingLine,
  ceilingTop,
  returnMain,
  returnY,
  supplyMain,
  supplyY,
  type V3,
} from "../../geometry";
import { STORY, stagger, type Window } from "../../timeline";
import { trimStart, type DuctSize } from "./plan";

const H = STORY.hvac;

/* ---------------------------------------------------------------- time -- */

export const FLOOR_INDEX = Array.from({ length: FLOORS }, (_, i) => i);
/** Sub-window [a, b] (fractions) of window w. */
export const sub = (w: Window, a: number, b: number): Window => [w[0] + (w[1] - w[0]) * a, w[0] + (w[1] - w[0]) * b];
const span = (a: number, d: number): Window => [a, a + d];
/** Floors build top-down, following the trunks down the shaft. */
export const order = (i: number) => FLOORS - 1 - i;
const byFloor = (w: Window) => FLOOR_INDEX.map((i) => stagger(w, order(i), FLOORS));
export const W_SUPPLY = byFloor(H.supply);
export const W_RET = byFloor(H.ret);
export const W_TERM = byFloor(H.terminals);
const W_FIT = byFloor(H.fittings);
const W_WRAP = byFloor(H.wrap);

/** Story value at which ease(story, w) — in-out cubic — reaches u: when a run's extrusion front passes a point. */
export function passAt(w: Window, u: number): number {
  const v = Math.min(1, Math.max(0, u));
  const p = v < 0.5 ? Math.cbrt(v / 4) : 1 - Math.cbrt(2 * (1 - v)) / 2;
  return w[0] + p * (w[1] - w[0]);
}

export function pathLength(pts: readonly V3[]): number {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
  return L;
}

/* --------------------------------------------------------- supply mains -- */

export const MAIN_H = DUCT.supplyMain[1];
/** Width of each main section: full to the first lateral, reduced after each of the first two. */
export const MAIN_W = [DUCT.supplyMain[0], 0.75, 0.6] as const;
/** Concentric transitions just downstream of laterals 0 and 1 (along +x). */
export const TRANSITIONS = [0, 1].map((k) => {
  const x0 = SUPPLY.lateralsX[k] + 0.6;
  return { x0, x1: x0 + 0.45, from: MAIN_W[k], to: MAIN_W[k + 1] };
});
export const mainWidthAt = (x: number) => (x < TRANSITIONS[0].x0 ? MAIN_W[0] : x < TRANSITIONS[1].x0 ? MAIN_W[1] : MAIN_W[2]);

const MAIN_Z0 = SUPPLY.trunkZ + DUCT.supplyTrunk[1] / 2;
/** Floor i's whole main, from the trunk's face (as RectDuct draws it). */
export const mainPath = (i: number) => trimStart(supplyMain(i), DUCT.supplyTrunk[1] / 2);
export const MAIN_LEN = pathLength(mainPath(0));
/** Distance along the main to z on its south run out of the shaft, or to x on its east run. */
export const alongMainZ = (z: number) => z - MAIN_Z0;
export const alongMain = (x: number) => alongMainZ(SUPPLY.mainZ) + (x - SUPPLY.trunkX);

export type MainPart = { path: V3[]; size: DuctSize; from: number; to: number };
/** The main split at the transitions: three runs that extrude as one front (the gaps take the transitions). */
export function mainParts(i: number): MainPart[] {
  const y = supplyY(i);
  const z = SUPPLY.mainZ;
  const [t1, t2] = TRANSITIONS;
  const p = mainPath(i);
  return [
    { path: [p[0], p[1], [t1.x0, y, z]], size: [MAIN_W[0], MAIN_H], from: 0, to: alongMain(t1.x0) },
    { path: [[t1.x1, y, z], [t2.x0, y, z]], size: [MAIN_W[1], MAIN_H], from: alongMain(t1.x1), to: alongMain(t2.x0) },
    { path: [[t2.x1, y, z], [SUPPLY.mainEndX, y, z]], size: [MAIN_W[2], MAIN_H], from: alongMain(t2.x1), to: MAIN_LEN },
  ];
}

/* ------------------------------------------------------- connector pieces -- */

/** Fire dampers where the mains leave the shaft (supply south through SHAFT.z1, return north through SHAFT.z0). */
export const FD = { len: 0.45 } as const;
export const supplyFd = (i: number): V3 => [SUPPLY.trunkX, supplyY(i), SHAFT.z1];
export const returnFd = (i: number): V3 => [RETURN.trunkX, returnY(i), SHAFT.z0];

const RET_Z0 = RETURN.trunkZ - DUCT.returnTrunk[1] / 2;
export const returnPath = (i: number) => trimStart(returnMain(i), DUCT.returnTrunk[1] / 2);
export const RET_LEN = pathLength(returnPath(0));
const alongReturnZ = (z: number) => RET_Z0 - z;
export const alongReturn = (x: number) => alongReturnZ(RETURN.mainZ) + (x - RETURN.trunkX);

/** A fitting goes in once its floor's fitting window opens and the duct front has passed it. */
const fit = (i: number, lead: number, pass: number): Window => span(Math.max(W_FIT[i][0] + lead, pass + 0.0005), 0.005);
export const W_FD_SUPPLY = FLOOR_INDEX.map((i) => fit(i, 0, passAt(W_SUPPLY[i], (alongMainZ(SHAFT.z1) + FD.len) / MAIN_LEN)));
export const W_FD_RETURN = FLOOR_INDEX.map((i) => fit(i, 0, passAt(W_RET[i], (alongReturnZ(SHAFT.z0) + FD.len) / RET_LEN)));
/** Turning vanes in the main's square elbow (once the elbow is there). */
export const W_VANES = FLOOR_INDEX.map((i) => fit(i, 0.002, passAt(W_SUPPLY[i], (alongMainZ(SUPPLY.mainZ) + MAIN_W[0] / 2) / MAIN_LEN)));
export const W_TRANSITION = FLOOR_INDEX.map((i) =>
  TRANSITIONS.map((t, k) => fit(i, 0.004 + 0.002 * k, passAt(W_SUPPLY[i], alongMain(t.x1) / MAIN_LEN))),
);
/** Canvas flexible connectors on both trunks, just under the roof deck. */
export const W_CANVAS: Window = span(H.fittings[0], 0.006);
export const CANVAS = { top: ceilingTop(FLOORS - 1) - 0.04, h: 0.16 } as const;

/* -------------------------------------------------------- lateral heads -- */

/** 45° shoe takeoff on the main's south face: a flared rectangular stub on a mounting flange (local z out of the main). */
export const SHOE = { len: 0.25, flare: 0.2, w: 0.4, h: 0.32, plate: 0.08, plateW: 0.7, plateH: 0.4 } as const;
/** VAV terminal box: round inlet duct + collar, casing, reheat-coil section; the lateral runs on from the coil. */
export const VAV = { z0: 2.62, casing: [0.72, 0.46, 0.88], coil: [0.66, 0.42, 0.26], inletR: 0.15, collar: 0.06, inletLen: 0.42 } as const;
export const LAT_Z0 = VAV.z0 + VAV.casing[2] + VAV.coil[2];
const LAT_END = SUPPLY.lateralEndZ + 0.3;
export const LAT_LEN = LAT_END - LAT_Z0;
export const lateralPath = (i: number, x: number): V3[] => [
  [x, supplyY(i), LAT_Z0],
  [x, supplyY(i), LAT_END],
];
export const shoeAt = (i: number, x: number): V3 => [x, supplyY(i), SUPPLY.mainZ + mainWidthAt(x) / 2];
export const vavAt = (i: number, x: number): V3 => [x, supplyY(i), VAV.z0];

/** Floor by floor (top-down), lateral by lateral: the shoe goes on, the VAV box is lifted onto it, the lateral extrudes from the box. */
const HEAD = { t0: 0.306, floor: 0.0075, lateral: 0.0015 } as const;
const headBase = (i: number, j: number) => HEAD.t0 + HEAD.floor * order(i) + HEAD.lateral * j;
const perLateral = (f: (i: number, j: number) => Window) => FLOOR_INDEX.map((i) => SUPPLY.lateralsX.map((_, j) => f(i, j)));
export const W_SHOE = perLateral((i, j) => span(headBase(i, j), 0.004));
export const W_VAV = perLateral((i, j) => span(headBase(i, j) + 0.004, 0.007));
export const W_LATERAL = perLateral((i, j) => span(headBase(i, j) + 0.0095, 0.0085));

/* ---------------------------------------------------------- round drops -- */

/** Round spiral drop off the lateral's underside: spin-in collar, spiral section, corrugated flex (stacked top-down). */
export const DROP = { r: 0.14, rim: 0.18, spin: 0.05, spiral: 0.065 } as const;
/** Round-neck square diffuser: face plate, back pan, round neck (heights in m). */
export const DIFF = { plate: 0.03, pan: 0.05, panW: 0.5, neck: 0.04, neckR: 0.15 } as const;
export const lateralBottom = (i: number) => supplyY(i) - DUCT.supplyLateral[1] / 2;
/** The drop spans the lateral's underside to the diffuser's neck — the same on every floor. */
export const DROP_LEN = lateralBottom(0) - (ceilingLine(0) + DIFF.plate + DIFF.pan + DIFF.neck);

export type Drop = { top: V3; face: V3; floor: number; drop: Window; diffuser: Window };
/** One per diffusers(i) entry, in the same order (floor, lateral, z). */
export const DROPS: Drop[] = FLOOR_INDEX.flatMap((i) =>
  SUPPLY.lateralsX.flatMap((x, j) =>
    SUPPLY.diffusersZ.map((z): Drop => {
      const drop = span(passAt(W_LATERAL[i][j], (z + DROP.rim - LAT_Z0) / LAT_LEN) + 0.0005, 0.0035);
      return { top: [x, lateralBottom(i), z], face: [x, ceilingLine(i), z], floor: i, drop, diffuser: span(drop[1] - 0.0005, 0.0035) };
    }),
  ),
);

/* ---------------------------------------------------------- return side -- */

export const RETURN_NECK = [0.9, 0.4] as const;
/** Tee collar where each return grille's neck leaves the main's underside. */
export const COLLAR = { proud: 0.07, h: 0.07 } as const;
export type Collar = { at: V3; window: Window; neck: Window; grille: Window };
export const COLLARS: Collar[] = FLOOR_INDEX.flatMap((i) =>
  RETURN.grillesX.map((x): Collar => {
    const neck = sub(W_TERM[i], 0.5, 0.8);
    const grille = sub(W_TERM[i], 0.72, 1);
    const pass = passAt(W_RET[i], (alongReturn(x) + RETURN_NECK[0] / 2 + COLLAR.proud) / RET_LEN);
    const window = span(Math.max(neck[0] - 0.004, pass + 0.0005), 0.004);
    const n0 = Math.max(neck[0], window[1]);
    const n1 = Math.max(neck[1], n0 + 0.003);
    return {
      at: [x, returnY(i) - DUCT.returnMain[1] / 2, RETURN.mainZ],
      window,
      neck: [n0, n1],
      grille: [Math.max(grille[0], n0 + 0.002), Math.max(grille[1], n1)],
    };
  }),
);

/* ----------------------------------------------------------------- wrap -- */

/** Supply wrap: sleeve proud of the duct (clear of the flanges), tape bands a touch prouder every `step`. */
export const WRAP = { proud: 0.065, band: 0.005, step: 1.2, depth: 0.05 } as const;
const WRAP_GAP = 0.02;
const wrapSize = (s: DuctSize): DuctSize => [s[0] + 2 * WRAP.proud, s[1] + 2 * WRAP.proud];
/** Where the main's wrap starts: just past the fire damper sleeve. */
const WRAP_Z0 = SHAFT.z1 + FD.len / 2 + 0.025;

export type WrapPart = { path: V3[]; size: DuctSize; window: Window };
/**
 * One crew per floor: the wrap front runs the main (fittings stay bare) over the
 * first 3/4 of the floor's wrap window; each lateral is wrapped once the front passes it.
 */
export function wrapParts(i: number): WrapPart[] {
  const y = supplyY(i);
  const z = SUPPLY.mainZ;
  const [t1, t2] = TRANSITIONS;
  const ww = W_WRAP[i];
  const d0 = alongMainZ(WRAP_Z0);
  const d1 = MAIN_LEN + WRAP.proud;
  const run = sub(ww, 0, 0.75);
  const at = (d: number) => run[0] + ((d - d0) / (d1 - d0)) * (run[1] - run[0]);
  const main = (path: V3[], w: number, from: number, to: number): WrapPart => ({ path, size: wrapSize([w, MAIN_H]), window: [at(from), at(to)] });
  const xa = t1.x0 - WRAP_GAP;
  const xb = t1.x1 + WRAP_GAP;
  const xc = t2.x0 - WRAP_GAP;
  const xd = t2.x1 + WRAP_GAP;
  return [
    main([[SUPPLY.trunkX, y, WRAP_Z0], [SUPPLY.trunkX, y, z], [xa, y, z]], MAIN_W[0], d0, alongMain(xa)),
    main([[xb, y, z], [xc, y, z]], MAIN_W[1], alongMain(xb), alongMain(xc)),
    main([[xd, y, z], [SUPPLY.mainEndX + WRAP.proud, y, z]], MAIN_W[2], alongMain(xd), d1),
    ...SUPPLY.lateralsX.map((x): WrapPart => {
      const s = (at(alongMain(x)) - ww[0]) / (ww[1] - ww[0]);
      return {
        path: [[x, y, LAT_Z0 + WRAP_GAP], [x, y, LAT_END + WRAP.proud]],
        size: wrapSize(DUCT.supplyLateral),
        window: sub(ww, s, s + 0.25),
      };
    }),
  ];
}
/** The wrap front's position at the middle of floor i's main run, and when it passes (for the card anchor). */
export function wrapMid(i: number): { at: V3; t: number } {
  const d0 = alongMainZ(WRAP_Z0);
  const d1 = MAIN_LEN + WRAP.proud;
  const run = sub(W_WRAP[i], 0, 0.75);
  const x = SUPPLY.trunkX + ((d0 + d1) / 2 - alongMain(SUPPLY.trunkX));
  return { at: [x, supplyY(i) + MAIN_H / 2 + WRAP.proud, SUPPLY.mainZ], t: (run[0] + run[1]) / 2 };
}

/* -------------------------------------------------------------- hangers -- */

/** Trapeze: strut channel under the duct (clear of the wrap on supply, of the flanges on return), threaded rods to the soffit. */
export const TRAPEZE = { strut: 0.042, rodR: 0.008, rodOut: 0.04, overhang: 0.06, nut: 0.025 } as const;
const SUPPLY_DROP = WRAP.proud + WRAP.band + 0.005;
const RETURN_DROP = 0.06;
/** Stations, hand-placed clear of the fittings, the VRF crossing at x 1.9 / z 6.0 and the diffuser drops. */
const MAIN_HANGERS_X = [-8.1, -5.7, -3.3, -0.7, 2.6, 4.0, 6.4, 8.8, 11.0, 12.8];
const MAIN_HANGER_Z = 0.25;
const LATERAL_HANGERS_Z = [5.4, 6.6];
const RETURN_HANGERS_X = [-9.2, -6.8, -4.4, -2.0, 0.4, 2.0, 4.4, 6.8, 8.0];

/** c: strut top centre; across: axis the strut spans (0 x, 2 z); span: rod centres apart; top: soffit y. */
export type Hanger = { c: V3; across: 0 | 2; span: number; top: number; window: Window };
/** Rods and strut go up just ahead of the duct front, inside STORY.hvac.hangers. */
function ahead(pass: number): Window {
  const end = Math.min(pass - 0.001, H.hangers[1]);
  return [Math.max(H.hangers[0], end - 0.005), end];
}
export const HANGERS: Hanger[] = FLOOR_INDEX.flatMap((i): Hanger[] => {
  const top = ceilingTop(i);
  const sy = supplyY(i) - MAIN_H / 2 - SUPPLY_DROP;
  const rodSpan = (w: number, drop: number) => w + 2 * (drop - 0.005) + 2 * TRAPEZE.rodOut;
  const main = (u: number): Window => ahead(passAt(W_SUPPLY[i], u / MAIN_LEN));
  return [
    { c: [SUPPLY.trunkX, sy, MAIN_HANGER_Z], across: 0, span: rodSpan(MAIN_W[0], SUPPLY_DROP), top, window: main(alongMainZ(MAIN_HANGER_Z)) },
    ...MAIN_HANGERS_X.map((x): Hanger => ({
      c: [x, sy, SUPPLY.mainZ],
      across: 2,
      span: rodSpan(mainWidthAt(x), SUPPLY_DROP),
      top,
      window: main(alongMain(x)),
    })),
    ...SUPPLY.lateralsX.flatMap((x, j) =>
      LATERAL_HANGERS_Z.map((z): Hanger => ({
        c: [x, lateralBottom(i) - SUPPLY_DROP, z],
        across: 0,
        span: rodSpan(DUCT.supplyLateral[0], SUPPLY_DROP),
        top,
        window: ahead(passAt(W_LATERAL[i][j], (z - LAT_Z0) / LAT_LEN)),
      })),
    ),
    ...RETURN_HANGERS_X.map((x): Hanger => ({
      c: [x, returnY(i) - DUCT.returnMain[1] / 2 - RETURN_DROP, RETURN.mainZ],
      across: 2,
      span: DUCT.returnMain[0] + 2 * TRAPEZE.rodOut + 0.04,
      top,
      window: ahead(passAt(W_RET[i], alongReturn(x) / RET_LEN)),
    })),
  ];
});

/* ------------------------------------------------------- roof exhaust fans -- */

/** EF-2 then EF-3 drop onto their curbs inside STORY.exhaust.fans. */
export const W_ROOF_FANS: Window[] = ROOF_FANS.map((_, k) => stagger(STORY.exhaust.fans, k, ROOF_FANS.length));
