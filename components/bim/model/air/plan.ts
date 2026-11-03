/**
 * Pure planning for RectDuct — no THREE, no React, no runtime imports, so the
 * self-check runs under plain Node: `node components/bim/model/air/plan.check.mjs`.
 *
 * A run's orthogonal polyline becomes axis-aligned boxes the way the shop
 * builds rectangular duct: straight bodies, square elbows at the corners and
 * TDC flanges at the joints. Each box carries the span of path distance over
 * which it extrudes, so the whole run is a pure function of one 0..1 value.
 */
import type { V3 } from "../../geometry";

/** [w, h]. Vertical segments are w along x by h along z; horizontal ones h tall by w across the run. */
export type DuctSize = readonly [w: number, h: number];

export type Piece = {
  /** full-size box centre and size, [x, y, z] */
  c: number[];
  s: number[];
  /** growth axis (0 x, 1 y, 2 z) and direction (+1 / -1) */
  axis: number;
  dir: number;
  /** path distance over which the box extrudes; a flange (from === to) appears whole */
  from: number;
  to: number;
  /** bodies and elbows carry the extrusion head; flanges do not */
  head: boolean;
};

export type Plan = { pieces: Piece[]; total: number };

export type FlangeSpec = {
  step: number;
  depth: number;
  proud: number;
  /** at a body start (parent duct or elbow) a touch prouder, so meeting flanges never share a face */
  proudStart: number;
  /** no flange closer than this to an open end */
  endClear: number;
  /** bodies shorter than this (necks) carry none */
  minBody: number;
};

/** TDC flange frames: a joint every ~1.5 m section, standing proud of the duct. */
export const FLANGE: FlangeSpec = { step: 1.5, depth: 0.07, proud: 0.045, proudStart: 0.057, endClear: 0.3, minBody: 1.0 };

const EPS = 1e-6;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Section extents [x, y, z] of a segment running along `axis` (0 along the axis itself). */
function section(axis: number, [w, h]: DuctSize): number[] {
  if (axis === 1) return [w, 0, h];
  if (axis === 0) return [0, h, w];
  return [w, h, 0];
}

type Seg = { a: V3; axis: number; dir: number; len: number; sec: number[] };

function segments(path: readonly V3[], size: DuctSize): Seg[] {
  if (path.length < 2) throw new Error("RectDuct: a run needs at least two points");
  return path.slice(1).map((b, k): Seg => {
    const a = path[k];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const axis = d.findIndex((v) => Math.abs(v) > EPS);
    if (axis < 0 || d.some((v, i) => i !== axis && Math.abs(v) > EPS)) {
      throw new Error(`RectDuct: segment ${k} is not axis-aligned`);
    }
    return { a, axis, dir: Math.sign(d[axis]), len: Math.abs(d[axis]), sec: section(axis, size) };
  });
}

/** Bodies and elbows in path order, then the flanges (or any banding laid out like them). `total` is the centreline length. */
export function planRun(path: readonly V3[], size: DuctSize, spec: FlangeSpec = FLANGE): Plan {
  const segs = segments(path, size);
  const last = segs.length - 1;
  // A square elbow spans the incoming section along the outgoing axis and vice versa.
  const elbows = segs.slice(1).map((B, k) => {
    const A = segs[k];
    return [0, 1, 2].map((ax) => (ax === A.axis ? B.sec[ax] : A.sec[ax]));
  });
  const pieces: Piece[] = [];
  const flanges: Piece[] = [];
  let run = 0;
  segs.forEach((g, k) => {
    const inStart = k > 0 ? elbows[k - 1][g.axis] / 2 : 0;
    const inEnd = k < last ? elbows[k][g.axis] / 2 : 0;
    const len = g.len - inStart - inEnd;
    const start = g.a[g.axis] + g.dir * inStart;
    const from = run + inStart;

    const c = [...g.a];
    const s = [...g.sec];
    c[g.axis] = start + (g.dir * len) / 2;
    s[g.axis] = len;
    pieces.push({ c, s, axis: g.axis, dir: g.dir, from, to: from + len, head: true });

    if (len >= spec.minBody) {
      const flange = (d: number, proud: number) => {
        const fc = [...g.a];
        fc[g.axis] = start + g.dir * d;
        const fs = g.sec.map((v) => v + 2 * proud);
        fs[g.axis] = spec.depth;
        flanges.push({ c: fc, s: fs, axis: g.axis, dir: g.dir, from: from + d, to: from + d, head: false });
      };
      const clear = k < last ? spec.step / 2 : spec.endClear;
      for (let d = 0; d <= len - clear; d += spec.step) flange(d, d === 0 ? spec.proudStart : spec.proud);
      if (k < last) flange(len, spec.proud);
    }

    if (k < last) {
      const e = elbows[k];
      const out = e[segs[k + 1].axis] / 2;
      pieces.push({ c: [...path[k + 1]], s: [...e], axis: g.axis, dir: g.dir, from: from + len, to: from + len + inEnd + out, head: true });
    }
    run += g.len;
  });
  return { pieces: [...pieces, ...flanges], total: run };
}

/** How far piece `p` has extruded (0..1) when the run's front is `d` metres along its path. */
export function fraction(p: Piece, d: number): number {
  if (p.to > p.from) return clamp01((d - p.from) / (p.to - p.from));
  return d >= p.from ? 1 : 0;
}

/** Writes the box of `p` extruded to fraction f — grown from its start face — into c and s. No allocation. */
export function grow(p: Piece, f: number, c: number[], s: number[]): void {
  for (let k = 0; k < 3; k++) {
    c[k] = p.c[k];
    s[k] = p.s[k];
  }
  const a = p.axis;
  const len = p.s[a] * f;
  c[a] = p.c[a] - (p.dir * p.s[a]) / 2 + (p.dir * len) / 2;
  s[a] = len;
}

/** `a` moved `d` metres toward `b`. */
function shift(a: V3, b: V3, d: number): V3 {
  const k = d / Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** The path with its first point moved `d` m along the first segment — trims a run back to its parent duct's face (negative d extends it). */
export function trimStart(path: readonly V3[], d: number): V3[] {
  return [shift(path[0], path[1], d), ...path.slice(1)];
}

/** The path with its last point moved `d` m further along the last segment (negative d shortens it). */
export function extendEnd(path: readonly V3[], d: number): V3[] {
  const n = path.length;
  return [...path.slice(0, -1), shift(path[n - 1], path[n - 2], -d)];
}
