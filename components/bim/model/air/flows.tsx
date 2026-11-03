"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { V3 } from "../../geometry";
import { pointAlong, polyLength } from "../../kit";
import { bim } from "../../store";

/**
 * kit Pulses for many paths in one draw call: the same evenly spaced streaks,
 * stretched along their travel and faded at both ends, each path with its own
 * gate. Driven by bim.time (freezes with the Pause switch); off under reduced motion.
 */

export type Stream = { path: readonly V3[]; count: number; gate: () => number };

type Props = { streams: readonly Stream[]; speed: number; size: number; material: THREE.Material; stretch?: number };

const SPHERE = new THREE.SphereGeometry(1, 10, 8);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const dummy = new THREE.Object3D();
const at = new THREE.Vector3();
const ahead = new THREE.Vector3();

export function MultiPulses({ streams, speed, size, material, stretch = 3.2 }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const low = bim.quality === "low";
  const rows = useMemo(() => {
    let start = 0;
    return streams.map((s) => {
      const n = low ? Math.max(1, Math.ceil(s.count / 2)) : s.count;
      const row = { start, n, length: polyLength(s.path) };
      start += n;
      return row;
    });
  }, [streams, low]);
  const total = rows.length ? rows[rows.length - 1].start + rows[rows.length - 1].n : 0;

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let any = false;
    for (let k = 0; k < streams.length; k++) {
      const { start, n, length } = rows[k];
      const g = bim.reduced ? 0 : streams[k].gate();
      if (g <= 0.001) {
        for (let i = 0; i < n; i++) mesh.setMatrixAt(start + i, ZERO);
        continue;
      }
      any = true;
      const path = streams[k].path;
      for (let i = 0; i < n; i++) {
        const d = (bim.time * speed + (i * length) / n) % length;
        const u = d / length;
        const fade = Math.min(1, u / 0.06, (1 - u) / 0.08);
        pointAlong(path, d, at);
        pointAlong(path, Math.min(length, d + 0.05), ahead);
        dummy.position.copy(at);
        if (ahead.distanceToSquared(at) > 1e-8) dummy.lookAt(ahead);
        const s = size * Math.max(0, fade) * g;
        dummy.scale.set(s, s, s * stretch);
        dummy.updateMatrix();
        mesh.setMatrixAt(start + i, dummy.matrix);
      }
    }
    mesh.visible = any;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[SPHERE, material, total]} frustumCulled={false} visible={false} />;
}
