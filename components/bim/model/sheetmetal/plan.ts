/**
 * Chapter 01 · Architectural sheet metal — the install plan.
 *
 * Pure data, no THREE: every element's final placement plus the story window it
 * installs in. SheetMetal.tsx turns this into instance matrices each frame, so the
 * chapter is a pure function of bim.story — scrub back and it un-installs exactly.
 * Metres · +X east · +Y up · +Z south. Illustrative typical building, not to scale.
 */
import { easeOutBack, easeOutCubic, seg } from "@/lib/timing";
import { CANOPY, CLAD_X, END_WALL, LEVELS, PARAPET, PENTHOUSE, ROOF_Y, SLAB, type V3 } from "../../geometry";
import { STORY, stagger, type Window } from "../../timeline";

const SM = STORY.sheetmetal;
const linear = (p: number) => p;

/** The fraction [a, b] of window w. */
const sub = (w: Window, a: number, b: number): Window => [w[0] + (w[1] - w[0]) * a, w[0] + (w[1] - w[0]) * b];

/** Parapet inner faces (roof side): east / west and north / south. */
const IN_X = END_WALL.inner;
const IN_Z = SLAB.z - PARAPET.t;

/* ---------------------------------------------------------------- records -- */

/** A box part: final centre / size / euler rotation, and how it builds inside its window. */
export type BoxRec = {
  c: V3;
  s: V3;
  r: V3;
  w: Window;
  /** grow along local axis 0 | 1 | 2 from its min end (dir 1) or max end (dir -1); -1 = scale up from the centre */
  axis: -1 | 0 | 1 | 2;
  dir: 1 | -1;
  ease: (p: number) => number;
};
/** One length of a perimeter run (coping, counter-flashing); profile origin on the parapet inner face. */
export type SegRec = { x: number; z: number; rotY: number; len: number; w: Window };
export type PanelRec = { x: number; y: number; z: number; h: number; rotY: number; out: 1 | -1; w: Window };
/** A placement spark riding a work front along `path` across window `w`. */
export type SparkRec = { w: Window; path: V3[] };

export const BOXES: BoxRec[] = []; // ARCH.sheetMetal
export const SHADE: BoxRec[] = []; // ARCH.sheetMetalShade
export const SPARKS: SparkRec[] = [];
const edgeRecs: { t: number; a: V3; b: V3 }[] = [];

const NO_ROT: V3 = [0, 0, 0];
function grow(list: BoxRec[], c: V3, s: V3, w: Window, axis: 0 | 1 | 2, dir: 1 | -1 = 1, ease = easeOutCubic, r = NO_ROT) {
  list.push({ c, s, r, w, axis, dir, ease });
}
function pop(list: BoxRec[], c: V3, s: V3, w: Window) {
  list.push({ c, s, r: NO_ROT, w, axis: -1, dir: 1, ease: easeOutBack });
}
/** BIM linework: a line that appears once its element has landed (story t). */
function line(t: number, a: V3, b: V3) {
  edgeRecs.push({ t, a, b });
}

/* ------------------------------------------------------- metal wall panels -- */

const COLS = 34;
const HALF = COLS / 2;
/** Horizontal panel joints on the floor lines; the top tier runs up under the coping. */
const TIER_Y = [0.03, LEVELS[1].y, LEVELS[2].y, LEVELS[3].y, PARAPET.top - 0.02] as const;
const TIERS = TIER_Y.length - 1;
const JOINT = 0.03;
/** Panel start keys are squeezed into this much of the window (each install takes PANEL_DUR) so every panel
 *  locks before the north drain assembly comes down the face. */
const PANEL_SPAN = 0.72;
const PANEL_DUR = 0.1;

/** Ribbed panel section: the pan sits just off the bare wall, major-rib tops land on CLAD_X. */
export const PANEL = {
  w: (2 * SLAB.z) / COLS,
  back: END_WALL.outer + 0.005,
  pan: 0.015,
  rib: CLAD_X - END_WALL.outer - 0.005 - 0.015,
} as const;

export const PANELS: PanelRec[] = [];
for (const out of [1, -1] as const) {
  for (let t = 0; t < TIERS; t++) {
    for (let c = 0; c < COLS; c++) {
      const bay = c < HALF ? 0 : 1; // south bay (nearest the camera) first, then north
      const j = c - bay * HALF;
      // inside each bay a diagonal wave: bottom-to-top, south-to-north
      const key = 0.5 * bay + 0.5 * (0.55 * (t / (TIERS - 1)) + 0.45 * (j / (HALF - 1)));
      const a = PANEL_SPAN * key;
      const p: PanelRec = {
        x: out * PANEL.back,
        y: TIER_Y[t] + JOINT / 2,
        z: SLAB.z - (c + 0.5) * PANEL.w,
        h: TIER_Y[t + 1] - TIER_Y[t] - JOINT,
        rotY: (out * Math.PI) / 2,
        out,
        w: sub(SM.panels, a, a + PANEL_DUR),
      };
      PANELS.push(p);
      // linework: the lap rib and the panel's head joint
      const xr = out * (CLAD_X + 0.004);
      const zr = p.z + out * (PANEL.w / 2 - 0.0425);
      line(p.w[1], [xr, p.y, zr], [xr, p.y + p.h, zr]);
      const xp = out * (PANEL.back + PANEL.pan + 0.004);
      line(p.w[1], [xp, p.y + p.h, p.z - PANEL.w / 2], [xp, p.y + p.h, p.z + PANEL.w / 2]);
    }
  }
}

// corner trims wrap each end wall's vertical corners, climbing with their bay
for (const out of [1, -1] as const) {
  for (const zs of [1, -1] as const) {
    const half = 0.5 * PANEL_SPAN;
    const w = zs > 0 ? sub(SM.panels, 0, half + PANEL_DUR) : sub(SM.panels, half, PANEL_SPAN + PANEL_DUR);
    grow(BOXES, [out * (END_WALL.outer + 0.085), PARAPET.top / 2, zs * (SLAB.z + 0.06)], [0.17, PARAPET.top, 0.22], w, 1, 1, linear);
    const x = out * (END_WALL.outer + 0.173);
    const z = zs * (SLAB.z + 0.173);
    line(w[1], [x, 0, z], [x, PARAPET.top, z]);
  }
}

/* ------------------------------------------------ coping + counter-flashing -- */

type Side = { rotY: number; alongZ: boolean; fixed: number; from: number; to: number };

/** Loop E (south->north), N (east->west), W (north->south), S (west->east); local +Z faces outward. */
const loop = (halfZ: number, halfX: number): Side[] => [
  { rotY: Math.PI / 2, alongZ: true, fixed: IN_X, from: halfZ, to: -halfZ },
  { rotY: Math.PI, alongZ: false, fixed: -IN_Z, from: halfX, to: -halfX },
  { rotY: -Math.PI / 2, alongZ: true, fixed: -IN_X, from: -halfZ, to: halfZ },
  { rotY: 0, alongZ: false, fixed: IN_Z, from: -halfX, to: halfX },
];

/**
 * Lay a run in ~`target` m lengths: two crews leave the south-east corner in opposite directions and meet at the north-west.
 * ponytail: corner lengths overlap instead of mitring — invisible at 15 m+; add mitred corner pieces if a shot ever gets closer.
 */
function perimeterRun(sides: readonly Side[], target: number, w: Window, dur: number): SegRec[] {
  const total = sides.reduce((L, s) => L + Math.abs(s.to - s.from), 0);
  const segs: SegRec[] = [];
  let arc = 0;
  for (const s of sides) {
    const L = Math.abs(s.to - s.from);
    const n = Math.max(1, Math.round(L / target));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const at = arc + f * L;
      const a = (Math.min(at, total - at) / (total / 2)) * (1 - dur);
      const along = s.from + f * (s.to - s.from);
      segs.push({ x: s.alongZ ? s.fixed : along, z: s.alongZ ? along : s.fixed, rotY: s.rotY, len: L / n, w: sub(w, a, a + dur) });
    }
    arc += L;
  }
  return segs;
}

/** Work-front sparks, one per crew, riding the line where lengths have just landed. */
function crewSparks(w: Window, dur: number, inset: number, y: number) {
  const x = IN_X + inset;
  const z = IN_Z + inset;
  const front = sub(w, dur, 1);
  SPARKS.push({ w: front, path: [[x, y, z], [x, y, -z], [-x, y, -z]] });
  SPARKS.push({ w: front, path: [[x, y, z], [-x, y, z], [-x, y, -z]] });
}

/** Local (along, y, outward) on a run length -> world. */
function onSeg(g: SegRec, lx: number, y: number, lz: number): V3 {
  const c = Math.cos(g.rotY);
  const s = Math.sin(g.rotY);
  return [g.x + c * lx + s * lz, y, g.z - s * lx + c * lz];
}

/** Coping cap section — (outward from the parapet inner face, up from the parapet top): top plate + two drip legs. */
export const COPING_PROFILE = [[-0.05, -0.13], [-0.02, -0.13], [-0.02, 0], [0.44, 0], [0.44, -0.16], [0.47, -0.16], [0.47, 0.05], [-0.05, 0.05]] as const;
const COPE_DUR = 0.16;
export const COPING_Y = PARAPET.top;
export const COPING_SEGS = perimeterRun(loop(IN_Z + 0.47, IN_X - 0.05), 3, SM.coping, COPE_DUR);
crewSparks(SM.coping, COPE_DUR, 0.21, COPING_Y + 0.13);
for (const g of COPING_SEGS) {
  const h = g.len / 2;
  const top = COPING_Y + 0.053;
  line(g.w[1], onSeg(g, -h, top, 0.473), onSeg(g, h, top, 0.473));
  line(g.w[1], onSeg(g, -h, top, -0.053), onSeg(g, h, top, -0.053));
  line(g.w[1], onSeg(g, -h, COPING_Y - 0.163, 0.473), onSeg(g, h, COPING_Y - 0.163, 0.473));
  line(g.w[1], onSeg(g, -h, top, -0.053), onSeg(g, -h, top, 0.473));
}

/** Counter-flashing section — (from the parapet inner face, negative = roof side; up from the roof): let into a reglet, drip hem kicked out. */
export const FLASH_PROFILE = [[-0.045, 0.5], [-0.045, 0.278], [-0.094, 0.229], [-0.08, 0.215], [-0.025, 0.27], [-0.025, 0.47], [0.01, 0.47], [0.01, 0.5]] as const;
const FLASH_DUR = 0.16;
export const FLASH_Y = ROOF_Y;
export const FLASH_SEGS = perimeterRun(loop(IN_Z, IN_X), 3, SM.flashing, FLASH_DUR);
crewSparks(SM.flashing, FLASH_DUR, -0.07, FLASH_Y + 0.3);
for (const g of FLASH_SEGS) {
  const h = g.len / 2;
  line(g.w[1], onSeg(g, -h, FLASH_Y + 0.503, -0.048), onSeg(g, h, FLASH_Y + 0.503, -0.048)); // the reglet
  line(g.w[1], onSeg(g, -h, FLASH_Y + 0.229, -0.097), onSeg(g, h, FLASH_Y + 0.229, -0.097)); // drip hem
}

/* ------------------------------------- scuppers, conductor heads, downspouts -- */

const DS_X = CLAD_X + 0.1; // downspout centre, 4 cm proud of the rib tops
const DS_TOP = ROOF_Y - 0.7;
const DS_BOT = 0.36;

[6, -6].forEach((z0, n) => {
  const w = stagger(SM.gutters, n, 2, 0.35); // south drain first, then north
  const head = sub(w, 0.1, 0.24);
  const ds = sub(w, 0.24, 0.88);
  grow(BOXES, [(IN_X - 0.1 + CLAD_X + 0.2) / 2, ROOF_Y + 0.15, z0], [CLAD_X + 0.3 - IN_X, 0.2, 0.4], sub(w, 0, 0.14), 0); // scupper
  pop(SHADE, [CLAD_X + 0.008, ROOF_Y + 0.15, z0], [0.012, 0.42, 0.62], sub(w, 0.06, 0.16)); // scupper flange
  pop(BOXES, [CLAD_X + 0.2, ROOF_Y - 0.275, z0], [0.34, 0.55, 0.56], head); // conductor head
  pop(SHADE, [DS_X, ROOF_Y - 0.63, z0], [0.16, 0.16, 0.22], sub(w, 0.18, 0.26)); // outlet collar
  grow(BOXES, [DS_X, (DS_TOP + DS_BOT) / 2, z0], [0.12, DS_TOP - DS_BOT, 0.16], ds, 1, -1, linear); // extruded down
  for (const y of [14, 11, 8, 5, 2]) {
    const f = 0.24 + 0.64 * ((DS_TOP - y) / (DS_TOP - DS_BOT)); // when the extrusion head passes
    pop(SHADE, [DS_X - 0.005, y, z0], [0.17, 0.05, 0.2], sub(w, f, f + 0.04)); // strap
  }
  grow(BOXES, [DS_X + 0.14, DS_BOT - 0.14, z0], [0.12, 0.42, 0.16], sub(w, 0.86, 1), 1, -1, easeOutCubic, [0, 0, Math.PI / 4]); // kick-out
  SPARKS.push({ w: ds, path: [[DS_X + 0.1, DS_TOP, z0], [DS_X + 0.1, DS_BOT, z0]] });
  for (const dz of [-0.083, 0.083]) line(ds[1], [DS_X + 0.063, DS_BOT, z0 + dz], [DS_X + 0.063, DS_TOP, z0 + dz]);
  const xa = CLAD_X + 0.03;
  const xb = CLAD_X + 0.373;
  const yt = ROOF_Y + 0.003;
  line(head[1], [xb, yt, z0 - 0.283], [xb, yt, z0 + 0.283]);
  line(head[1], [xa, yt, z0 - 0.283], [xb, yt, z0 - 0.283]);
  line(head[1], [xa, yt, z0 + 0.283], [xb, yt, z0 + 0.283]);
});

/* ------------------------------------------------------------ entry canopy -- */

const C = CANOPY;
const ccx = (C.x0 + C.x1) / 2;
const ccz = (C.z0 + C.z1) / 2;
const span = C.x1 - C.x0;
const depth = C.z1 - C.z0;
const cw = SM.canopy;
const deckW = sub(cw, 0, 0.3);

// the deck cantilevers out from the façade (metal soffit + fascia), hung on tie-back rods
grow(SHADE, [ccx, C.y - C.t / 2, ccz], [span, C.t, depth], deckW, 2);
for (const x of [C.x0 - 0.015, C.x1 + 0.015]) {
  grow(BOXES, [x, C.y - 0.1, ccz], [0.03, C.t + 0.09, depth], deckW, 2);
  const xo = x + Math.sign(x - ccx) * 0.018;
  line(deckW[1], [xo, C.y + 0.073, C.z0], [xo, C.y + 0.073, C.z1]);
}
line(deckW[1], [C.x0, C.y - C.t - 0.003, C.z1 + 0.003], [C.x1, C.y - C.t - 0.003, C.z1 + 0.003]);
for (const x of [C.x0 + 0.6, ccx, C.x1 - 0.6]) {
  const a: V3 = [x, C.y + 0.03, C.z1 - 0.15];
  const b: V3 = [x, LEVELS[1].y + 2.4, C.z0 + 0.03];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const c: V3 = [x, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  grow(SHADE, c, [0.05, Math.hypot(dy, dz), 0.05], sub(cw, 0.12, 0.34), 1, -1, easeOutCubic, [Math.atan2(dz, dy), 0, 0]);
}

// standing-seam roofing: seams run out from the façade (along z), panels laid west to east
const NP = 20;
const pw = span / NP;
const roofW = sub(cw, 0.22, 0.72);
for (let i = 0; i <= NP; i++) {
  const wi = stagger(roofW, Math.min(i, NP - 1), NP, 0.7);
  const x = C.x0 + i * pw;
  if (i < NP) grow(SHADE, [x + pw / 2, C.y + 0.015, ccz], [pw - 0.006, 0.02, depth], wi, 2);
  grow(BOXES, [x, C.y + 0.06, ccz], [0.04, 0.07, depth], wi, 2);
  line(wi[1], [x, C.y + 0.098, C.z0], [x, C.y + 0.098, C.z1]);
}

// front box gutter, run west to east, then two downspouts to grade
const gutW = sub(cw, 0.62, 0.82);
const gz = C.z1 + 0.14;
grow(BOXES, [ccx, C.y - 0.21, gz], [span, 0.02, 0.28], gutW, 0, 1, linear);
grow(BOXES, [ccx, C.y - 0.085, C.z1 + 0.27], [span, 0.27, 0.02], gutW, 0, 1, linear);
pop(BOXES, [C.x0, C.y - 0.085, gz], [0.02, 0.27, 0.28], sub(gutW, 0, 0.15));
pop(BOXES, [C.x1, C.y - 0.085, gz], [0.02, 0.27, 0.28], sub(gutW, 0.85, 1));
SPARKS.push({ w: gutW, path: [[C.x0, C.y - 0.08, C.z1 + 0.3], [C.x1, C.y - 0.08, C.z1 + 0.3]] });
line(gutW[1], [C.x0, C.y + 0.053, C.z1 + 0.283], [C.x1, C.y + 0.053, C.z1 + 0.283]);
line(gutW[1], [C.x0, C.y - 0.223, C.z1 + 0.283], [C.x1, C.y - 0.223, C.z1 + 0.283]);

const cdTop = C.y - 0.22;
const cdBot = 0.34;
const cdW = sub(cw, 0.8, 0.95);
for (const x of [C.x0 + 0.45, C.x1 - 0.45]) {
  grow(BOXES, [x, (cdTop + cdBot) / 2, gz], [0.1, cdTop - cdBot, 0.08], cdW, 1, -1, linear);
  grow(BOXES, [x, cdBot - 0.14, gz + 0.14], [0.1, 0.4, 0.08], sub(cw, 0.93, 1), 1, -1, easeOutCubic, [-Math.PI / 4, 0, 0]);
  SPARKS.push({ w: cdW, path: [[x, cdTop, gz + 0.07], [x, cdBot, gz + 0.07]] });
  for (const dx of [-0.053, 0.053]) line(cdW[1], [x + dx, cdBot, gz + 0.043], [x + dx, cdTop, gz + 0.043]);
}

/* ------------------------------------------- stair penthouse roof + cricket -- */

const P = PENTHOUSE;
const pcx = (P.x0 + P.x1) / 2;
const pcz = (P.z0 + P.z1) / 2;
const pwd = P.x1 - P.x0;
const pdp = P.z1 - P.z0;
const fasW = sub(cw, 0.1, 0.35);
const fy = P.top - 0.04;
grow(BOXES, [pcx, fy, P.z0 - 0.035], [pwd + 0.14, 0.22, 0.03], fasW, 0);
grow(BOXES, [pcx, fy, P.z1 + 0.035], [pwd + 0.14, 0.22, 0.03], fasW, 0);
grow(BOXES, [P.x0 - 0.035, fy, pcz], [0.03, 0.22, pdp + 0.14], fasW, 2, -1);
grow(BOXES, [P.x1 + 0.035, fy, pcz], [0.03, 0.22, pdp + 0.14], fasW, 2, -1);
{
  const yt = fy + 0.113;
  const [xa, xb, za, zb] = [P.x0 - 0.053, P.x1 + 0.053, P.z0 - 0.053, P.z1 + 0.053];
  line(fasW[1], [xa, yt, za], [xb, yt, za]);
  line(fasW[1], [xa, yt, zb], [xb, yt, zb]);
  line(fasW[1], [xa, yt, za], [xa, yt, zb]);
  line(fasW[1], [xb, yt, za], [xb, yt, zb]);
}

const NPP = 8;
const ppw = pwd / NPP;
const proofW = sub(cw, 0.3, 0.9);
for (let i = 0; i <= NPP; i++) {
  const wi = stagger(proofW, Math.min(i, NPP - 1), NPP, 0.6);
  const x = P.x0 + i * ppw;
  if (i < NPP) grow(SHADE, [x + ppw / 2, P.top + 0.015, pcz], [ppw - 0.006, 0.02, pdp + 0.1], wi, 2, -1);
  grow(BOXES, [x, P.top + 0.06, pcz], [0.04, 0.07, pdp + 0.1], wi, 2, -1);
  line(wi[1], [x, P.top + 0.098, P.z0 - 0.05], [x, P.top + 0.098, P.z1 + 0.05]);
}

/** Sheet-metal cricket (saddle) on the roof behind the penthouse: ridge runs north off its wall. */
export const CRICKET = { x0: P.x0, x1: P.x1, z: P.z0, y: ROOF_Y + 0.01, h: 0.45, run: 2.2, w: sub(cw, 0.75, 1) } as const;
{
  const xm = (CRICKET.x0 + CRICKET.x1) / 2;
  const y = CRICKET.y + 0.003;
  const tip: V3 = [xm, y, CRICKET.z - CRICKET.run];
  line(CRICKET.w[1], [xm, y + CRICKET.h, CRICKET.z - 0.003], tip);
  line(CRICKET.w[1], [CRICKET.x0, y, CRICKET.z - 0.003], tip);
  line(CRICKET.w[1], [CRICKET.x1, y, CRICKET.z - 0.003], tip);
}

/* ------------------------------------------------------------ glint + tags -- */

/** A light band sweeping west -> east over every sheet-metal surface; position is along dot(world, (1, 0.35, -0.45)) — see gfx.ts. */
export const GLINT = { w: SM.glint, from: -23.5, to: 29.5, peak: 1.4 } as const;

const nearest = (segs: SegRec[], x: number, z: number) =>
  segs.reduce((b, g) => (Math.hypot(g.x - x, g.z - z) < Math.hypot(b.x - x, b.z - z) ? g : b));

/** Short-lived BIM tags: in as their element installs, out ~0.05 of story later, all gone by TAG_END. */
export const TAG_END = STORY.sheetmetal.tagsOut;
export const TAGS: { label: string; at: V3; t: number }[] = [
  { label: "METAL WALL PANELS", at: [CLAD_X + 0.05, 3.4, 7.2], t: SM.panels[0] + 0.004 },
  { label: "COPING", at: [IN_X + 0.2, PARAPET.top + 0.1, IN_Z + 0.2], t: SM.coping[0] + 0.004 },
  // on the north parapet: its roof side faces the south-east camera
  { label: "COUNTER-FLASHING", at: [12, ROOF_Y + 0.5, -IN_Z + 0.05], t: nearest(FLASH_SEGS, 12, -IN_Z).w[0] },
  { label: "GUTTER + DOWNSPOUT", at: [CLAD_X + 0.4, ROOF_Y - 0.3, 6], t: SM.gutters[0] + 0.006 },
  { label: "STANDING-SEAM ROOF", at: [ccx, C.y + 0.1, ccz], t: roofW[0] + 0.004 },
];
export function tagOpacity(s: number, t: number): number {
  const end = Math.min(t + 0.05, TAG_END);
  return seg(s, t, t + 0.008) * (1 - seg(s, end - 0.01, end));
}

/* ---------------------------------------------------------------- linework -- */

edgeRecs.sort((p, q) => p.t - q.t);
/** All linework in one LineSegments buffer, ordered by landing time: draw the first N lines with times[N-1] <= story. */
export const EDGES = {
  pos: Float32Array.from(edgeRecs.flatMap((e) => [...e.a, ...e.b])),
  times: edgeRecs.map((e) => e.t),
};
