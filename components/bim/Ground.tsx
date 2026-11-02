"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { useViewer } from "@/lib/viewer-state";
import { COLORS } from "./materials";
import { bim } from "./store";
import { INTRO, win } from "./timeline";

const PAD = { w: 52, d: 40 };

/**
 * The site: an infinite cyan drafting grid (1 m cells; 2 m sections land on
 * every column grid line) and a navy site pad that fades in with the 4D sequence.
 */
export default function Ground() {
  const pad = useRef<THREE.MeshStandardMaterial>(null);
  const { style } = useViewer();
  const invalidate = useThree((s) => s.invalidate);
  // reduced motion draws on demand: render one frame so a visual-style switch shows (applyXray repaints in it)
  useEffect(() => invalidate(), [style, invalidate]);
  useFrame(() => {
    if (pad.current) pad.current.opacity = win(bim.intro, INTRO.grid);
  });
  return (
    <group>
      <Grid
        position={[0, -0.02, 0]}
        args={[10, 10]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.6}
        cellColor={COLORS.gridCell}
        sectionSize={2}
        sectionThickness={1}
        sectionColor={COLORS.gridSection}
        fadeDistance={200}
        fadeStrength={1.7}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[PAD.w, PAD.d]} />
        <meshStandardMaterial ref={pad} color={COLORS.ground} roughness={1} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
