"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeOutBack, prng } from "@/lib/timing";
import { pointAlong, polyLength } from "../../kit";
import { COLORS, MEP } from "../../materials";
import { bim } from "../../store";
import type { Window } from "../../timeline";
import { Particles, fract, running } from "../air/parts";
import { CASSETTE, type CassetteSpot, type Stream } from "./plan";
import { H, sub } from "./schedule";

/**
 * Ambient life for the VRF chapter, all on bim.time (frozen by Pause motion,
 * off under reduced motion): refrigerant streaks on every floor branch, cool
 * air thrown from each cassette's four slots, and the cassette louvres swinging.
 */

const prog = (p: number, w: Window) => Math.min(1, Math.max(0, (p - w[0]) / (w[1] - w[0])));

/* ------------------------------------------------------------- streaks -- */

/** Same look as kit Pulses, but every floor branch in one draw call (kit Pulses is one per path). */
const STREAK = { gap: 1.1, speed: 1.6, size: 0.042, stretch: 3, fadeIn: 0.006 } as const;
const STREAK_GEO = new THREE.SphereGeometry(1, 10, 8);
const dummy = new THREE.Object3D();
const at = new THREE.Vector3();
const ahead = new THREE.Vector3();

export function Streams({ paths, material }: { paths: readonly Stream[]; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const setup = useMemo(() => {
    const per = bim.quality === "low" ? 2 : 1;
    let total = 0;
    const list = paths.map((s) => {
      const length = polyLength(s.pts);
      const n = Math.max(1, Math.round(length / (STREAK.gap * per)));
      const o = total;
      total += n;
      return { pts: s.pts, live: [s.ready, s.ready + STREAK.fadeIn] as Window, length, n, o };
    });
    return { list, total };
  }, [paths]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const run = bim.reduced ? 0 : running(H.run);
    mesh.visible = run > 0.001;
    if (!mesh.visible) return;
    for (let s = 0; s < setup.list.length; s++) {
      const { pts, live, length, n, o } = setup.list[s];
      const g = run * prog(bim.story, live);
      for (let i = 0; i < n; i++) {
        const d = (bim.time * STREAK.speed + (i * length) / n) % length;
        const u = d / length;
        pointAlong(pts, d, at);
        pointAlong(pts, Math.min(length, d + 0.05), ahead);
        dummy.position.copy(at);
        if (ahead.distanceToSquared(at) > 1e-8) dummy.lookAt(ahead); // +Z along the flow
        const k = STREAK.size * Math.max(0, Math.min(1, u / 0.06, (1 - u) / 0.08)) * g;
        dummy.scale.set(k, k, k * STREAK.stretch);
        dummy.updateMatrix();
        mesh.setMatrixAt(o + i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[STREAK_GEO, material, setup.total]} frustumCulled={false} visible={false} />;
}

/* --------------------------------------------------------------- throw -- */

/** Cool air: icy motes leaving each slot, spreading along the ceiling and sinking as they slow. */
const THROW = { perSlot: 2, period: 2.4, reach: 1.1, drop: 0.85, size: 0.03 } as const;
const ICE = new THREE.MeshBasicMaterial({
  color: new THREE.Color(COLORS.ice).multiplyScalar(1.6),
  toneMapped: false,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});
/** slot j of a cassette blows along (dx, dz) */
const SLOT_DIR = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const throwGate = () => running(H.run);

export function Throw({ cassettes }: { cassettes: readonly CassetteSpot[] }) {
  const per = 4 * (bim.quality === "low" ? 1 : THROW.perSlot);
  const place = useMemo(() => {
    const seed = Float32Array.from({ length: cassettes.length * per * 3 }, prng(0xca55e7));
    return (i: number, t: number, out: THREE.Vector3) => {
      const c = cassettes[(i / per) | 0];
      if (bim.story < c.w[1]) return 0; // blows once the unit is in
      const s = i * 3;
      const dir = SLOT_DIR[i % 4];
      const dx = dir[0];
      const dz = dir[1];
      const u = fract(t / (THROW.period * (0.8 + 0.4 * seed[s])) + seed[s + 1]);
      const along = (seed[s + 2] - 0.5) * CASSETTE.slotLen;
      const r = CASSETTE.slot + u * THROW.reach;
      out.set(c.c[0] + dx * r + dz * along, c.c[1] - 0.03 - THROW.drop * u * u, c.c[2] + dz * r + dx * along);
      return THROW.size * Math.sqrt(Math.sin(Math.PI * u));
    };
  }, [cassettes, per]);
  return <Particles count={cassettes.length * per} material={ICE} place={place} gate={throwGate} />;
}

/* ------------------------------------------------------------- louvres -- */

/** Cassette louvre blades: nearly shut until the system runs, then open and gently swinging. */
const BLADE = { len: CASSETTE.slotLen - 0.04, w: 0.055, t: 0.006, drop: 0.012, shut: 0.1, open: 0.55, swing: 0.2, rate: 0.7 } as const;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Q = new THREE.Quaternion();
const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const S = new THREE.Vector3();

export function Louvres({ cassettes }: { cassettes: readonly CassetteSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const wins = useMemo(() => cassettes.map((c) => sub(c.w, 0.35, 1)), [cassettes]);
  const last = useRef({ story: NaN, time: NaN });

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const on = bim.story >= H.run;
    const t = on && !bim.reduced ? bim.time : 0;
    if (bim.story === last.current.story && t === last.current.time) return;
    last.current.story = bim.story;
    last.current.time = t;
    let shown = false;
    for (let c = 0; c < cassettes.length; c++) {
      const face = cassettes[c].c;
      const v = prog(bim.story, wins[c]);
      const k = v > 0 ? easeOutBack(v) : 0;
      if (k > 0) shown = true;
      const angle = on ? BLADE.open + BLADE.swing * Math.sin(t * BLADE.rate + c * 0.9) : BLADE.shut;
      for (let j = 0; j < 4; j++) {
        const dx = SLOT_DIR[j][0];
        const dz = SLOT_DIR[j][1];
        // tip each blade's outer edge down: about z for the east / west slots, about x for south / north
        if (dx) Q.setFromAxisAngle(Z_AXIS, -dx * angle);
        else Q.setFromAxisAngle(X_AXIS, dz * angle);
        P.set(face[0] + dx * CASSETTE.slot, face[1] - BLADE.drop, face[2] + dz * CASSETTE.slot);
        if (dx) S.set(BLADE.w * k, BLADE.t * k, BLADE.len * k);
        else S.set(BLADE.len * k, BLADE.t * k, BLADE.w * k);
        mesh.setMatrixAt(c * 4 + j, M.compose(P, Q, S));
      }
    }
    mesh.visible = shown;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[UNIT_BOX, MEP.equipment, cassettes.length * 4]} frustumCulled={false} visible={false} />;
}
