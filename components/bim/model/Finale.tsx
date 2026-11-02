"use client";

import { useRef, type ElementRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { lerp, seg } from "@/lib/timing";
import { CLAD_X, CURTAIN_Z, SECTION_Z, type V3 } from "../geometry";
import { COLORS } from "../materials";
import { STORY, win } from "../timeline";
import { bim } from "../store";
import { BAND, bandY, glowGradient } from "./signals/fx";

/**
 * Finale — ALL SYSTEMS RUNNING. One elegant pass: a band of light rises from L1 to
 * clear the roof equipment, brightening every system it crosses (additive, so it lifts
 * whatever sits behind it; the maintenance badges relight as it passes), then calm.
 * Pure function of bim.story, own materials only — shared materials are never touched.
 */

/** clearance outside the envelope, m */
const OUT = 0.35;
const HALF_X = CLAD_X + OUT;
const NORTH_Z = -(CURTAIN_Z + OUT);
const SOUTH_Z = CURTAIN_Z + OUT;
/** the shell's brightest row, as a fraction of its height: a crisp leading edge over a soft trailing glow */
const LEAD = 0.875;
const SHELL_PEAK = 0.55;
const LASER_W = 2;

/** Open square tube, half-side 1, height 1, eight rows — lit by row (y runs -0.5..0.5). */
const SHELL = glowGradient(
  new THREE.CylinderGeometry(Math.SQRT2, Math.SQRT2, 1, 4, 8, true).rotateY(Math.PI / 4),
  (_x, y) => {
    const t = y + 0.5;
    return t <= LEAD ? (t / LEAD) ** 2 : 0;
  },
);
/** the BIM accent: the band reads as the model's own scan, apart from every trade colour */
const shellMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(COLORS.cyan).multiplyScalar(1.6),
  vertexColors: true,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
  fog: false,
});
/** the leading edge as a closed loop, scaled to the envelope each frame */
const LOOP: V3[] = [
  [-1, 0, -1],
  [1, 0, -1],
  [1, 0, 1],
  [-1, 0, 1],
  [-1, 0, -1],
];
const LASER = new THREE.Color(COLORS.cyan).multiplyScalar(2.4);

export default function Finale() {
  const band = useRef<THREE.Group>(null);
  const laser = useRef<ElementRef<typeof Line>>(null);

  useFrame(() => {
    const g = band.current;
    if (!g) return;
    const u = win(bim.story, STORY.finale.running);
    const o = seg(u, 0, 0.08) * (1 - seg(u, 0.82, 1));
    g.visible = o > 0.001;
    if (!g.visible) return;
    // the south face rides the section box: on the cut while it is engaged
    const south = lerp(SOUTH_Z, SECTION_Z + 0.05, bim.cut);
    g.position.set(0, bandY(bim.story), (NORTH_Z + south) / 2);
    g.scale.set(HALF_X, 1, (south - NORTH_Z) / 2);
    shellMat.opacity = SHELL_PEAK * o;
    if (laser.current) laser.current.material.opacity = o;
  });

  return (
    <group ref={band} visible={false}>
      <mesh geometry={SHELL} material={shellMat} position-y={-(LEAD - 0.5) * BAND.h} scale-y={BAND.h} />
      <Line ref={laser} points={LOOP} color={LASER} lineWidth={LASER_W} toneMapped={false} transparent opacity={0} />
    </group>
  );
}
