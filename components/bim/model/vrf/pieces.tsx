"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeOutBack, easeOutCubic } from "@/lib/timing";
import { GLOW, MEP } from "../../materials";
import { bim } from "../../store";
import type { Window } from "../../timeline";
import type { Box, Cyl, Mat, Ring, VrfPlan } from "./plan";

/**
 * Draws every planned piece of the VRF chapter — pipe lengths, corner joints,
 * fittings, clamps, ID bands, supports, boxes, cassette parts — as instanced
 * meshes: one draw call per (shape, material), one for the glowing extrusion
 * heads and one for the BIM linework. Pieces are pure functions of bim.story,
 * so instances are only rewritten on frames where the story moved.
 */

const MAT: Record<Mat, THREE.Material> = { cu: MEP.refrigerant, ins: MEP.insulation, shade: MEP.equipmentShade, eq: MEP.equipment };
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const BALL = new THREE.SphereGeometry(1, 12, 8);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** the 12 edges of a unit cube, 24 vertices */
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX).getAttribute("position").array as Float32Array;
const EDGE_FLOATS = UNIT_EDGES.length;
/** the unit cylinder stands on +Y; these lay it along x / y / z */
const AXIS_Q = [
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)),
  new THREE.Quaternion(),
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)),
] as const;
/** glowing head on a growing line: radius relative to the pipe, plus a floor so thin lines still spark */
const HEAD = { k: 1.7, min: 0.012 } as const;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const S = new THREE.Vector3();

/** Local 0..1 progress through w; a zero-length window is a step. */
const prog = (p: number, w: Window) => (w[1] > w[0] ? Math.min(1, Math.max(0, (p - w[0]) / (w[1] - w[0]))) : p >= w[0] ? 1 : 0);

function writeCyl(mesh: THREE.InstancedMesh, i: number, c: Cyl, f: number) {
  if (f <= 0) return mesh.setMatrixAt(i, ZERO);
  const len = c.len * f;
  P.set(c.a[0], c.a[1], c.a[2]).setComponent(c.axis, c.a[c.axis] + (c.dir * len) / 2);
  mesh.setMatrixAt(i, M.compose(P, AXIS_Q[c.axis], S.set(c.r, len, c.r)));
}

function writeRing(mesh: THREE.InstancedMesh, i: number, r: Ring, f: number) {
  if (f <= 0) return mesh.setMatrixAt(i, ZERO);
  const k = easeOutBack(f);
  mesh.setMatrixAt(i, M.compose(P.set(r.c[0], r.c[1], r.c[2]), AXIS_Q[r.axis], S.set(r.r * k, r.len * k, r.r * k)));
}

/** Box b at progress f: centre into P, size into S. */
function sizeBox(b: Box, f: number) {
  P.set(b.c[0], b.c[1], b.c[2]);
  S.set(b.s[0], b.s[1], b.s[2]);
  if (b.grow === "pop") return S.multiplyScalar(easeOutBack(f));
  const h = b.s[1] * easeOutCubic(f);
  P.y = b.grow === "down" ? b.c[1] + b.s[1] / 2 - h / 2 : b.c[1] - b.s[1] / 2 + h / 2;
  S.y = h;
  return S;
}

function writeEdges(edges: Float32Array, o: number, f: number) {
  if (f <= 0) return edges.fill(0, o, o + EDGE_FLOATS);
  for (let j = 0; j < EDGE_FLOATS; j += 3) {
    edges[o + j] = P.x + UNIT_EDGES[j] * S.x;
    edges[o + j + 1] = P.y + UNIT_EDGES[j + 1] * S.y;
    edges[o + j + 2] = P.z + UNIT_EDGES[j + 2] * S.z;
  }
}

/** One instanced draw call: a shape in a material, and which pieces it carries. */
type Layer = { geo: THREE.BufferGeometry; mat: THREE.Material; count: number; start: number };

export function Pieces({ plan }: { plan: VrfPlan }) {
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const heads = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const last = useRef(NaN);

  const setup = useMemo(() => {
    const layers: Layer[] = [];
    const keys = new Map<string, number>();
    /** layer index for a shape + material, and the next instance in it */
    const slot = (shape: string, geo: THREE.BufferGeometry, mat: Mat, w: Window) => {
      const key = `${shape}:${mat}`;
      if (!keys.has(key)) {
        keys.set(key, layers.length);
        layers.push({ geo, mat: MAT[mat], count: 0, start: Infinity });
      }
      const L = layers[keys.get(key) as number];
      L.start = Math.min(L.start, w[0]);
      return [keys.get(key) as number, L.count++] as const;
    };
    const cyl = plan.cyls.map((c) => slot("cyl", CYL, c.mat, c.w));
    const ring = plan.rings.map((r) => slot("cyl", CYL, r.mat, r.w));
    const ball = plan.balls.map((b) => slot("ball", BALL, b.mat, b.w));
    const box = plan.boxes.map((b) => slot("box", UNIT_BOX, b.mat, b.w));
    let edgeCount = 0;
    const edgeAt = plan.boxes.map((b) => (b.edge ? edgeCount++ * EDGE_FLOATS : -1));
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edgeCount * EDGE_FLOATS), 3).setUsage(THREE.DynamicDrawUsage));
    const cache = {
      cyl: new Float64Array(plan.cyls.length).fill(NaN),
      ring: new Float64Array(plan.rings.length).fill(NaN),
      ball: new Float64Array(plan.balls.length).fill(NaN),
      box: new Float64Array(plan.boxes.length).fill(NaN),
    };
    const edgeStart = Math.min(...plan.boxes.filter((b) => b.edge).map((b) => b.w[0]));
    return { layers, cyl, ring, ball, box, edges, edgeAt, edgeStart, cache, dirty: layers.map(() => false) };
  }, [plan]);
  useEffect(() => () => setup.edges.dispose(), [setup]);

  useFrame(() => {
    const p = bim.story;
    const head = heads.current;
    const line = lines.current;
    const m = meshes.current;
    if (p === last.current || !head || !line || m.length < setup.layers.length || m.includes(null)) return;
    last.current = p;
    const { cache, dirty } = setup;
    const pos = setup.edges.getAttribute("position") as THREE.BufferAttribute;
    const edges = pos.array as Float32Array;
    let edgesDirty = false;

    for (let i = 0; i < plan.cyls.length; i++) {
      const f = prog(p, plan.cyls[i].w);
      if (f === cache.cyl[i]) continue;
      cache.cyl[i] = f;
      const L = setup.cyl[i][0];
      const k = setup.cyl[i][1];
      writeCyl(m[L] as THREE.InstancedMesh, k, plan.cyls[i], f);
      dirty[L] = true;
    }
    for (let i = 0; i < plan.rings.length; i++) {
      const f = prog(p, plan.rings[i].w);
      if (f === cache.ring[i]) continue;
      cache.ring[i] = f;
      const L = setup.ring[i][0];
      const k = setup.ring[i][1];
      writeRing(m[L] as THREE.InstancedMesh, k, plan.rings[i], f);
      dirty[L] = true;
    }
    for (let i = 0; i < plan.balls.length; i++) {
      const b = plan.balls[i];
      const f = prog(p, b.w);
      if (f === cache.ball[i]) continue;
      cache.ball[i] = f;
      const L = setup.ball[i][0];
      const k = setup.ball[i][1];
      (m[L] as THREE.InstancedMesh).setMatrixAt(k, f > 0 ? M.makeScale(b.r, b.r, b.r).setPosition(b.c[0], b.c[1], b.c[2]) : ZERO);
      dirty[L] = true;
    }
    for (let i = 0; i < plan.boxes.length; i++) {
      const b = plan.boxes[i];
      const f = prog(p, b.w);
      if (f === cache.box[i]) continue;
      cache.box[i] = f;
      const L = setup.box[i][0];
      const k = setup.box[i][1];
      sizeBox(b, f);
      (m[L] as THREE.InstancedMesh).setMatrixAt(k, f > 0 ? M.makeScale(S.x, S.y, S.z).setPosition(P) : ZERO);
      dirty[L] = true;
      if (setup.edgeAt[i] < 0) continue;
      writeEdges(edges, setup.edgeAt[i], f);
      edgesDirty = true;
    }

    for (let k = 0; k < setup.layers.length; k++) {
      const mesh = m[k] as THREE.InstancedMesh;
      mesh.visible = p > setup.layers[k].start;
      if (!dirty[k]) continue;
      dirty[k] = false;
      mesh.instanceMatrix.needsUpdate = true;
    }
    line.visible = p > setup.edgeStart;
    if (edgesDirty) pos.needsUpdate = true;

    // the head rides the tip of whichever length of each run is growing
    let growing = false;
    for (let h = 0; h < plan.heads.length; h++) {
      const { first, count, r } = plan.heads[h];
      let tip = -1;
      for (let k = first; k < first + count; k++) if (cache.cyl[k] > 0 && cache.cyl[k] < 1) tip = k;
      if (tip < 0) {
        head.setMatrixAt(h, ZERO);
        continue;
      }
      growing = true;
      const c = plan.cyls[tip];
      P.set(c.a[0], c.a[1], c.a[2]).setComponent(c.axis, c.a[c.axis] + c.dir * c.len * cache.cyl[tip]);
      const s = Math.max(HEAD.min, r * HEAD.k);
      head.setMatrixAt(h, M.makeScale(s, s, s).setPosition(P));
    }
    head.visible = growing;
    head.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {setup.layers.map((L, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            meshes.current[k] = el;
          }}
          args={[L.geo, L.mat, L.count]}
          frustumCulled={false}
          visible={false}
        />
      ))}
      <instancedMesh ref={heads} args={[BALL, GLOW.spark, plan.heads.length]} frustumCulled={false} visible={false} />
      <lineSegments ref={lines} geometry={setup.edges} material={MEP.edge} frustumCulled={false} visible={false} />
    </group>
  );
}
