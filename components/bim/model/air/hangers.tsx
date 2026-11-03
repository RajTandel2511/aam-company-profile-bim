"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeOutCubic, seg } from "@/lib/timing";
import { MEP } from "../../materials";
import { bim } from "../../store";
import { win } from "../../timeline";
import { HANGERS, TRAPEZE } from "./layout";
import { useParts } from "./parts";

/**
 * Trapeze hangers under the supply mains and laterals and the return mains:
 * two threaded rods drop from the slab soffit, then the strut channel goes on
 * beneath — just ahead of the duct front (layout.ts HANGERS). Two instanced
 * draw calls, equipment shade so they stay subtle. Pure function of bim.story.
 */

function hangerParts() {
  return {
    /** unit rod hanging from its origin down to y = -1 */
    rod: new THREE.CylinderGeometry(TRAPEZE.rodR, TRAPEZE.rodR, 1, 6).translate(0, -0.5, 0),
    strut: new THREE.BoxGeometry(1, 1, 1),
  };
}

const M = new THREE.Matrix4();

export function Hangers() {
  const g = useParts(hangerParts);
  const rods = useRef<THREE.InstancedMesh>(null);
  const struts = useRef<THREE.InstancedMesh>(null);
  const last = useRef(NaN);

  useFrame(() => {
    const r = rods.current;
    const s = struts.current;
    if (!r || !s || bim.story === last.current) return;
    last.current = bim.story;
    let shown = false;
    for (let i = 0; i < HANGERS.length; i++) {
      const h = HANGERS[i];
      const t = win(bim.story, h.window);
      if (t > 0) shown = true;
      // rods first, down from the soffit (through the strut, a nut's length below it)...
      const drop = t > 0 ? Math.max(1e-3, easeOutCubic(seg(t, 0, 0.7))) : 0;
      const len = h.top - (h.c[1] - TRAPEZE.strut - TRAPEZE.nut);
      for (let side = 0; side < 2; side++) {
        const off = (side ? 0.5 : -0.5) * h.span;
        const x = h.c[0] + (h.across === 0 ? off : 0);
        const z = h.c[2] + (h.across === 2 ? off : 0);
        r.setMatrixAt(2 * i + side, M.makeScale(drop > 0 ? 1 : 0, len * drop, drop > 0 ? 1 : 0).setPosition(x, h.top, z));
      }
      // ...then the strut channel across their feet
      const k = easeOutCubic(seg(t, 0.55, 1));
      const across = (h.span + 2 * TRAPEZE.overhang) * k;
      const q = k > 0 ? TRAPEZE.strut : 0;
      M.makeScale(h.across === 0 ? across : q, q, h.across === 2 ? across : q).setPosition(h.c[0], h.c[1] - TRAPEZE.strut / 2, h.c[2]);
      s.setMatrixAt(i, M);
    }
    r.visible = shown;
    s.visible = shown;
    r.instanceMatrix.needsUpdate = true;
    s.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={rods} args={[g.rod, MEP.equipmentShade, HANGERS.length * 2]} frustumCulled={false} visible={false} />
      <instancedMesh ref={struts} args={[g.strut, MEP.equipmentShade, HANGERS.length]} frustumCulled={false} visible={false} />
    </group>
  );
}
