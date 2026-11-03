"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeOutBack, seg } from "@/lib/timing";
import type { V3 } from "../../geometry";
import { GLOW, MEP } from "../../materials";
import { bim } from "../../store";
import { CHAPTERS, type ChapterId } from "../../timeline";
import { box } from "./geo";

export { FLOOR_INDEX, sub } from "./layout";
export { box, cylinder, disc, merge, outline } from "./geo";

/**
 * Private kit for the air-side model parts (Hvac, Exhaust): see-through flow
 * materials and gates, static geometry merging, instanced ceiling terminals and
 * an instanced particle system. Client-only (creates THREE objects at import).
 */

/* --------------------------------------------------------------- timing -- */

export const chapterEnd = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)?.range[1] ?? 1;
export const fract = (v: number) => v - Math.floor(v);
export const smoothstep = (v: number) => v * v * (3 - 2 * v);
/** A part counts as finished over the last few percent of its build. */
export const done = (build: number) => seg(build, 0.92, 1);

/** Story span over which flows fade in from their chapter's run mark. */
const RUN_FADE = 0.012;
/** 0..1 from a chapter's run mark: ambient flows run from here to the end of the story. */
export const running = (mark: number) => seg(bim.story, mark, mark + RUN_FADE);
/** Story span over which a chapter tag fades in / out. */
const TAG_FADE = 0.008;
/** Tag opacity: in at `from`, out by `to`. */
export const tagShow = (from: number, to: number) => () =>
  Math.min(seg(bim.story, from, from + TAG_FADE), 1 - seg(bim.story, to - TAG_FADE, to));

/* ------------------------------------------------------------ materials -- */

/**
 * GLOW clones that draw through the duct walls: the air lives inside the ducts.
 * ponytail: GLOW is identical in every visual style, so the clones never re-sync;
 * if a style ever repaints GLOW, copy its colour into these in that repaint.
 */
function seeThrough(m: THREE.MeshBasicMaterial) {
  const c = m.clone();
  c.transparent = true;
  c.depthTest = false;
  c.depthWrite = false;
  return c;
}
export const FLOW = {
  supply: seeThrough(GLOW.supply),
  ret: seeThrough(GLOW.ret),
  exhaust: seeThrough(GLOW.exhaust),
} as const;
/** In-duct flows show only while the architecture is ghosted — they draw through walls. */
export const inDuct = () => Math.min(1, bim.xray * 1.25);

/* --------------------------------------------------- static geometry ----- */

/** Builds a part's static geometries once and disposes them on unmount. `make` must be module-level. */
export function useParts<T extends Record<string, THREE.BufferGeometry>>(make: () => T): T {
  const parts = useMemo(make, [make]);
  useEffect(
    () => () => {
      for (const g of Object.values(parts)) g.dispose();
    },
    [parts],
  );
  return parts;
}

/* ------------------------------------------------------------ particles -- */

const DOT = new THREE.IcosahedronGeometry(1, 1);
const M = new THREE.Matrix4();
const P = new THREE.Vector3();

type ParticlesProps = {
  count: number;
  material: THREE.Material;
  /** writes particle i's position at scene time t into `out`; returns its radius (0 hides it) */
  place: (i: number, t: number, out: THREE.Vector3) => number;
  /** 0..1 each frame — 0 hides the system */
  gate: () => number;
};

/** One instanced draw call of glowing motes, driven by bim.time; off under reduced motion. */
export function Particles({ count, material, place, gate }: ParticlesProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const g = bim.reduced ? 0 : gate();
    mesh.visible = g > 0.001;
    if (!mesh.visible) return;
    for (let i = 0; i < count; i++) {
      const r = place(i, bim.time, P) * g;
      mesh.setMatrixAt(i, M.makeScale(r, r, r).setPosition(P));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[DOT, material, count]} frustumCulled={false} visible={false} />;
}

/* ------------------------------------------------------------ terminals -- */

/** Face-plate thickness of ceiling diffusers and grilles. */
export const PLATE_T = 0.03;
/** Necks tuck this far into the duct above and the boot below, so no face is shared. */
const NECK_IN = 0.02;

/** A short vertical neck from a duct's underside down to a terminal's boot — it extrudes downward. */
export function neckPath(x: number, z: number, ductBottom: number, faceY: number, bootH: number): V3[] {
  return [
    [x, ductBottom + NECK_IN, z],
    [x, faceY + PLATE_T + bootH - NECK_IN, z],
  ];
}

type TerminalsProps = {
  /** face centres, at the ceiling line */
  at: readonly V3[];
  /** face plate, x by z */
  face: readonly [number, number];
  /** boot (plenum box) on the plate: x, height, z */
  boot: readonly [number, number, number];
  /** 0..1 each frame per terminal — it grows in with a slight overshoot */
  appear: (i: number) => number;
};

/**
 * Ceiling diffusers / grilles: a light face plate with a dark boot on top —
 * reads as the terminal from above and below. Two instanced draw calls.
 */
export function Terminals({ at, face, boot, appear }: TerminalsProps) {
  const plate = useRef<THREE.InstancedMesh>(null);
  const back = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(
    () => ({
      plate: box(face[0], PLATE_T, face[1], 0, PLATE_T / 2, 0),
      boot: box(boot[0], boot[1], boot[2], 0, PLATE_T + boot[1] / 2, 0),
    }),
    [face, boot],
  );
  useEffect(
    () => () => {
      geo.plate.dispose();
      geo.boot.dispose();
    },
    [geo],
  );
  const last = useMemo(() => new Float64Array(at.length).fill(NaN), [at]);

  useFrame(() => {
    const a = plate.current;
    const b = back.current;
    if (!a || !b) return;
    let changed = false;
    let shown = false;
    for (let i = 0; i < at.length; i++) {
      const v = appear(i);
      if (v > 0) shown = true;
      if (v === last[i]) continue;
      last[i] = v;
      changed = true;
      const k = v > 0 ? easeOutBack(v) : 0;
      const p = at[i];
      M.makeScale(k, k, k).setPosition(p[0], p[1], p[2]);
      a.setMatrixAt(i, M);
      b.setMatrixAt(i, M);
    }
    if (!changed) return;
    a.instanceMatrix.needsUpdate = true;
    b.instanceMatrix.needsUpdate = true;
    a.visible = shown;
    b.visible = shown;
  });

  return (
    <>
      <instancedMesh ref={plate} args={[geo.plate, MEP.equipment, at.length]} frustumCulled={false} visible={false} />
      <instancedMesh ref={back} args={[geo.boot, MEP.equipmentShade, at.length]} frustumCulled={false} visible={false} />
    </>
  );
}

/* ----------------------------------------------------------------- tags -- */

/** Tag swatch: a system dot (supply / return / exhaust) or a hollow equipment square. */
export function Swatch({ kind }: { kind: "supply" | "ret" | "exhaust" | "equipment" }) {
  const fill = { supply: "rounded-full bg-supply", ret: "rounded-full bg-return", exhaust: "rounded-full bg-exhaust", equipment: "border border-chalk/70" }[kind];
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 ${fill}`} />;
}
