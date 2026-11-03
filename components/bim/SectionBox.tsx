"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { lerp } from "@/lib/timing";
import { SECTION_Z } from "./geometry";
import { Tag } from "./kit";
import { COLORS, sectionPlane } from "./materials";
import { bim } from "./store";
import { STORY } from "./timeline";

/** Box extents around the whole model; its south face is the section plane. */
const BOX = { x: 17.8, y0: -0.3, y1: 21.6, back: -11.8, open: 15 } as const;

/**
 * The BIM section box. As the story goes inside, the box's south face slides
 * from in front of the building to z = SECTION_Z and every ARCH material is
 * clipped there (sectionPlane), exposing the floors and the systems.
 */
export default function SectionBox() {
  const lines = useRef<THREE.LineSegments>(null);
  const face = useRef<THREE.Mesh>(null);
  const { edges, lineMat, faceMat } = useMemo(
    () => ({
      edges: new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      // cyan selection colour, lifted so the box reads bright while it moves
      lineMat: new THREE.LineBasicMaterial({
        color: new THREE.Color(COLORS.sectionBox).multiplyScalar(1.6),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
      faceMat: new THREE.MeshBasicMaterial({
        color: COLORS.sectionBox,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      edges.dispose();
      lineMat.dispose();
      faceMat.dispose();
    },
    [edges, lineMat, faceMat],
  );

  useFrame(() => {
    const c = bim.cut;
    sectionPlane.constant = c <= 0.0001 ? 1e4 : lerp(BOX.open + 1, SECTION_Z, c);
    const front = lerp(BOX.open, SECTION_Z, c);
    // bright while it moves, then a quiet outline
    const show = c <= 0.0001 ? 0 : c < 1 ? Math.min(1, c * 6) : 0.35;
    const l = lines.current;
    const f = face.current;
    if (!l || !f) return;
    l.visible = f.visible = show > 0;
    if (!l.visible) return;
    l.position.set(0, (BOX.y0 + BOX.y1) / 2, (front + BOX.back) / 2);
    l.scale.set(BOX.x * 2, BOX.y1 - BOX.y0, front - BOX.back);
    lineMat.opacity = 0.85 * show;
    f.position.set(0, (BOX.y0 + BOX.y1) / 2, front);
    f.scale.set(BOX.x * 2, BOX.y1 - BOX.y0, 1);
    faceMat.opacity = 0.05 * show;
  });

  return (
    <group>
      <lineSegments ref={lines} geometry={edges} material={lineMat} visible={false} />
      <mesh ref={face} material={faceMat} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <Tag
        position={[BOX.x, BOX.y1, SECTION_Z]}
        show={() => (bim.cut > 0.02 && bim.cut < 1 ? 1 : bim.cut >= 1 ? Math.max(0, 1 - (bim.story - STORY.section[1]) * 20) : 0)}
      >
        SECTION BOX · CUT A–A
      </Tag>
    </group>
  );
}
