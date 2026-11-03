"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { V3 } from "../geometry";
import { GLOW, MEP } from "../materials";
import { box, merge } from "./air/parts";
import { FLANGE, fraction, grow, planRun, type DuctSize, type FlangeSpec, type Piece, type Plan } from "./air/plan";

export { extendEnd, trimStart, type DuctSize } from "./air/plan";

/**
 * RectDuct — rectangular sheet-metal duct along orthogonal polylines, the way
 * AAM's shop builds it: straight sections joined by TDC flanges every ~1.5 m,
 * square elbows at the corners, BIM edge linework. Rectangular only — the shop
 * makes no round or spiral duct (round drops are drawn separately, as installed work).
 *
 * Every run extrudes from its first point as build() goes 0..1 — segment by
 * segment, the active one growing along its axis — with a glowing frame
 * (GLOW.spark) riding the open end and fading out when the run is done.
 *
 * All runs in one RectDuct share three draw calls (solid, heads, linework), so
 * group runs by material. Geometry is planned once; frames only rewrite the
 * instances of runs whose build value changed. The same machinery lays the
 * insulation wrap: a sleeve material, tape bands as the "flanges", no linework.
 */

export type DuctRun = {
  /** orthogonal polyline: every segment runs along x, y or z */
  path: readonly V3[];
  /** [w, h] — vertical segments: w along x, h along z; horizontal: h tall, w across the run */
  size: DuctSize;
  /** 0..1, read every frame: how far the run has extruded from its first point */
  build: () => number;
};

type RunPlan = Plan & { offset: number; build: () => number };

/** The extrusion head: a glowing frame hugging the duct's open end. */
const HEAD = { depth: 0.05, proud: 0.075, bar: 0.08, fadeIn: 0.03, fadeOut: 0.06 } as const;
/** Floats per box of linework: 12 edges x 2 vertices x xyz. */
const EDGE_FLOATS = 72;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Unit frame in the XY plane, depth along z. */
const HEAD_FRAME = merge([
  box(1, HEAD.bar, 1, 0, 0.5 - HEAD.bar / 2, 0),
  box(1, HEAD.bar, 1, 0, -0.5 + HEAD.bar / 2, 0),
  box(HEAD.bar, 1 - 2 * HEAD.bar, 1, -0.5 + HEAD.bar / 2, 0, 0),
  box(HEAD.bar, 1 - 2 * HEAD.bar, 1, 0.5 - HEAD.bar / 2, 0, 0),
]);
/** Turns the frame's normal (z) onto growth axis x / y / z ... */
const HEAD_Q = [
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  new THREE.Quaternion(),
] as const;
/** ...after which the frame's local x / y span these world axes. */
const HEAD_UV = [
  [2, 1],
  [0, 2],
  [0, 1],
] as const;

/** The 24 vertices of a unit cube's 12 edges, centred on the origin. */
const UNIT_EDGES = (() => {
  const out: number[] = [];
  for (let ax = 0; ax < 3; ax++) {
    const u = (ax + 1) % 3;
    const v = (ax + 2) % 3;
    for (const su of [-0.5, 0.5]) {
      for (const sv of [-0.5, 0.5]) {
        const p = [0, 0, 0];
        p[u] = su;
        p[v] = sv;
        p[ax] = -0.5;
        out.push(...p);
        p[ax] = 0.5;
        out.push(...p);
      }
    }
  }
  return new Float32Array(out);
})();

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const C = [0, 0, 0];
const Z = [0, 0, 0];

function writeBox(mesh: THREE.InstancedMesh, edges: Float32Array, i: number, p: Piece, f: number) {
  const o = i * EDGE_FLOATS;
  if (f <= 0) {
    mesh.setMatrixAt(i, ZERO);
    edges.fill(0, o, o + EDGE_FLOATS);
    return;
  }
  grow(p, f, C, Z);
  mesh.setMatrixAt(i, M.makeScale(Z[0], Z[1], Z[2]).setPosition(C[0], C[1], C[2]));
  for (let j = 0; j < EDGE_FLOATS; j += 3) {
    edges[o + j] = C[0] + UNIT_EDGES[j] * Z[0];
    edges[o + j + 1] = C[1] + UNIT_EDGES[j + 1] * Z[1];
    edges[o + j + 2] = C[2] + UNIT_EDGES[j + 2] * Z[2];
  }
}

function writeHead(heads: THREE.InstancedMesh, r: number, p: Piece | null, f: number, fade: number) {
  if (!p || fade <= 0) {
    heads.setMatrixAt(r, ZERO);
    return;
  }
  grow(p, f, C, Z);
  const a = p.axis;
  const uv = HEAD_UV[a];
  P.set(C[0], C[1], C[2]).setComponent(a, C[a] + (p.dir * Z[a]) / 2);
  S.set((p.s[uv[0]] + 2 * HEAD.proud) * fade, (p.s[uv[1]] + 2 * HEAD.proud) * fade, HEAD.depth);
  heads.setMatrixAt(r, M.compose(P, HEAD_Q[a], S));
}

/** Rewrites run r's boxes, linework and head for build value b. */
function writeRun(plan: RunPlan, r: number, b: number, solid: THREE.InstancedMesh, heads: THREE.InstancedMesh, edges: Float32Array) {
  const front = b * plan.total;
  let head: Piece | null = null;
  let headF = 0;
  for (let k = 0; k < plan.pieces.length; k++) {
    const p = plan.pieces[k];
    const f = b > 0 ? fraction(p, front) : 0;
    writeBox(solid, edges, plan.offset + k, p, f);
    if (p.head && f > 0 && f < 1) {
      head = p;
      headF = f;
    }
  }
  writeHead(heads, r, head, headF, Math.min(1, b / HEAD.fadeIn, (1 - b) / HEAD.fadeOut));
}

type RectDuctProps = {
  runs: readonly DuctRun[];
  material: THREE.Material;
  /** joint banding along the runs (default: TDC flanges) */
  flange?: FlangeSpec;
  /** BIM edge linework (default on) */
  lines?: boolean;
};

export function RectDuct({ runs, material, flange = FLANGE, lines: withLines = true }: RectDuctProps) {
  const solid = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);

  const { plans, count, edges, last } = useMemo(() => {
    let offset = 0;
    const plans = runs.map((run): RunPlan => {
      const plan = { ...planRun(run.path, run.size, flange), offset, build: run.build };
      offset += plan.pieces.length;
      return plan;
    });
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.BufferAttribute(new Float32Array(offset * EDGE_FLOATS), 3).setUsage(THREE.DynamicDrawUsage));
    return { plans, count: offset, edges, last: new Float64Array(runs.length).fill(NaN) };
  }, [runs, flange]);
  useEffect(() => () => edges.dispose(), [edges]);

  useFrame(() => {
    const mesh = solid.current;
    const head = heads.current;
    const line = lines.current;
    if (!mesh || !head || (withLines && !line)) return;
    const pos = edges.attributes.position as THREE.BufferAttribute;
    let changed = false;
    for (let r = 0; r < plans.length; r++) {
      const b = Math.min(1, Math.max(0, plans[r].build()));
      if (b === last[r]) continue;
      last[r] = b;
      changed = true;
      writeRun(plans[r], r, b, mesh, head, pos.array as Float32Array);
    }
    if (!changed) return;
    let shown = false;
    let growing = false;
    for (let r = 0; r < last.length; r++) {
      if (last[r] > 0) shown = true;
      if (last[r] > 0 && last[r] < 1) growing = true;
    }
    mesh.visible = shown;
    head.visible = growing;
    mesh.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (line) {
      line.visible = shown;
      pos.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={solid} args={[UNIT_BOX, material, count]} frustumCulled={false} visible={false} />
      <instancedMesh ref={heads} args={[HEAD_FRAME, GLOW.spark, runs.length]} frustumCulled={false} visible={false} />
      {withLines && <lineSegments ref={lines} geometry={edges} material={MEP.edge} frustumCulled={false} visible={false} />}
    </group>
  );
}
