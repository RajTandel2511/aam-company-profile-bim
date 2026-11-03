"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeOutBack, easeOutCubic, seg } from "@/lib/timing";
import type { V3 } from "../../geometry";
import { COLORS, MEP } from "../../materials";
import { bim } from "../../store";
import { win, type Window } from "../../timeline";

/**
 * Placed — one fixed piece (fitting, terminal box, damper...) repeated across
 * the building, each copy arriving inside its own story window. One instanced
 * draw call per material, plus optional BIM linework rewritten as items move.
 * Pure function of bim.story: work happens only on frames where it changed.
 * Flashes — the short glow that marks a piece landing, for every Placed set in
 * one draw call.
 */

export type Item = {
  at: V3;
  window: Window;
  /** XYZ Euler, radians */
  rot?: V3;
  /** per-item scale (one geometry serving near-identical sizes) */
  scale?: V3;
};
export type Part = { geometry: THREE.BufferGeometry; material: THREE.Material };
/** How an item arrives as t goes 0..1: adjusts its local offset and scale (identity on entry). */
export type Motion = (t: number, offset: THREE.Vector3, scale: THREE.Vector3) => void;

/** Grows in with a slight overshoot about its origin. */
export const pop: Motion = (t, _o, s) => {
  s.setScalar(t > 0 ? easeOutBack(t) : 0);
};
/** Lifted up into place from `by` metres below. */
export const rise =
  (by: number): Motion =>
  (t, o, s) => {
    o.y = -by * (1 - easeOutCubic(t));
    if (t <= 0) s.setScalar(0);
  };
/** Extends downward from its origin (geometry hangs below it). */
export const growDown: Motion = (t, _o, s) => {
  if (t <= 0) s.setScalar(0);
  else s.y = Math.max(1e-3, easeOutCubic(t));
};

type Base = { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 };
const ONE: V3 = [1, 1, 1];
const NONE: V3 = [0, 0, 0];
const baseOf = (it: Item): Base => ({
  p: new THREE.Vector3(...it.at),
  q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(it.rot ?? NONE))),
  s: new THREE.Vector3(...(it.scale ?? ONE)),
});

const M = new THREE.Matrix4();
const O = new THREE.Vector3();
const S = new THREE.Vector3();

type PlacedProps = {
  parts: readonly Part[];
  /** local LineSegments geometry; each item's copy is transformed with it */
  edges?: THREE.BufferGeometry;
  items: readonly Item[];
  motion: Motion;
};

export function Placed({ parts, edges, items, motion }: PlacedProps) {
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const lines = useRef<THREE.LineSegments>(null);
  const run = useMemo(() => {
    const local = edges ? (edges.getAttribute("position").array as Float32Array) : null;
    const world = local ? new THREE.BufferGeometry() : null;
    world?.setAttribute("position", new THREE.BufferAttribute(new Float32Array(local!.length * items.length), 3).setUsage(THREE.DynamicDrawUsage));
    return { bases: items.map(baseOf), local, world, ts: new Float64Array(items.length).fill(NaN), story: { last: NaN } };
  }, [items, edges]);
  useEffect(() => () => run.world?.dispose(), [run]);

  useFrame(() => {
    const story = bim.story;
    if (story === run.story.last) return;
    run.story.last = story;
    let changed = false;
    let shown = false;
    for (let i = 0; i < items.length; i++) {
      const t = win(story, items[i].window);
      if (t > 0) shown = true;
      if (t === run.ts[i]) continue;
      run.ts[i] = t;
      changed = true;
      const b = run.bases[i];
      O.set(0, 0, 0);
      S.set(1, 1, 1);
      motion(t, O, S);
      O.applyQuaternion(b.q).add(b.p);
      M.compose(O, b.q, S.multiply(b.s));
      for (const m of meshes.current) m?.setMatrixAt(i, M);
      if (run.local && run.world) writeEdges(run.local, run.world, i);
    }
    if (!changed) return;
    for (const m of meshes.current) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      m.visible = shown;
    }
    if (lines.current && run.world) {
      run.world.attributes.position.needsUpdate = true;
      lines.current.visible = shown;
    }
  });

  return (
    <>
      {parts.map((p, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            meshes.current[k] = el;
          }}
          args={[p.geometry, p.material, items.length]}
          frustumCulled={false}
          visible={false}
        />
      ))}
      {run.world && <lineSegments ref={lines} geometry={run.world} material={MEP.edge} frustumCulled={false} visible={false} />}
    </>
  );
}

/** Item i's copy of the local linework, through the matrix in M. No allocation. */
function writeEdges(local: Float32Array, world: THREE.BufferGeometry, i: number) {
  const out = world.attributes.position.array as Float32Array;
  const e = M.elements;
  const o = i * local.length;
  for (let j = 0; j < local.length; j += 3) {
    const x = local[j];
    const y = local[j + 1];
    const z = local[j + 2];
    out[o + j] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[o + j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[o + j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
}

/* -------------------------------------------------------------- flashes -- */

/** A landing glow: world box (centre, size) and the story mark it fires at. */
export type Flash = { c: V3; s: V3; at: number };

const corners = (b: THREE.Box3) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z));

/** One flash per item, around its placed bounds, firing as its window closes. */
export function flashesFor(parts: readonly Part[], items: readonly Item[]): Flash[] {
  const local = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    local.union(p.geometry.boundingBox as THREE.Box3);
  }
  return items.map((it) => {
    const b = baseOf(it);
    M.compose(b.p, b.q, b.s);
    const box = new THREE.Box3().setFromPoints(corners(local).map((v) => v.applyMatrix4(M)));
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    return { c: [c.x, c.y, c.z], s: [s.x, s.y, s.z], at: it.window[1] };
  });
}

/** Story span of a flash around its mark. */
const FLASH = { before: 0.001, after: 0.006, peak: 0.42, grow: 0.3 } as const;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Additive cyan glow: each instance's colour is its brightness (black = gone). */
export const glowAdd = (hex: string, boost: number) =>
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(boost),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
const flashMat = glowAdd(COLORS.ice, 2.4);
const C = new THREE.Color();

export function Flashes({ flashes }: { flashes: readonly Flash[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => new Float32Array(flashes.length * 3), [flashes]);
  const last = useRef(NaN);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || bim.story === last.current) return;
    last.current = bim.story;
    let lit = false;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      const u = seg(bim.story, f.at - FLASH.before, f.at + FLASH.after);
      const k = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
      if (k > 0) lit = true;
      const g = k > 0 ? 1.04 + FLASH.grow * u : 0;
      M.makeScale(f.s[0] * g + 0.06 * k, f.s[1] * g + 0.06 * k, f.s[2] * g + 0.06 * k).setPosition(f.c[0], f.c[1], f.c[2]);
      mesh.setMatrixAt(i, M);
      mesh.setColorAt(i, C.setScalar(k * FLASH.peak));
    }
    mesh.visible = lit;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[UNIT_BOX, flashMat, flashes.length]} frustumCulled={false} visible={false}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
