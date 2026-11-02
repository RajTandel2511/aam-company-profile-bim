"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CURTAIN_Z, FLOORS, LEVELS, MULLION_STEP, SLAB, SLAB_T } from "../geometry";
import { ARCH, CLIP, GLOW, copyFinish } from "../materials";
import { bim } from "../store";
import { INTRO, arrive, ease, stagger, type Window } from "../timeline";
import { merge, setBox } from "./structure/build";

/**
 * Glass curtain walls on the north and south faces, installed floor by floor
 * from the bottom in INTRO.envelope: on each floor the mullions rise west to
 * east and the transoms run across behind a glowing head, then the glass fades
 * in — kept subtle so the floors read through it. A pure function of bim.intro.
 */

/** Bays of ~MULLION_STEP across the full width (16 bays of 2.04 m). */
const BAYS = Math.round((2 * SLAB.x) / MULLION_STEP);
const MULLION_X = Array.from({ length: BAYS + 1 }, (_, k) => -SLAB.x + (2 * SLAB.x * k) / BAYS);
/** Frame section, face width x depth — thick enough to read from 80 m. */
const FRAME = { w: 0.08, d: 0.16 } as const;
/** Frame centre-line, just outboard of the glass so the glass sits behind the caps. */
const FRAME_Z = CURTAIN_Z + 0.02;
/** Transom heights: the slab-edge band covers the slab edge; mid-storey rails and the sill are slim. */
const TRANSOM = { slab: SLAB_T + 0.06, mid: 0.08, sill: 0.12 } as const;
/** Glow head leading a transom as it runs across. */
const HEAD = 0.14;
const FACES = [-1, 1] as const; // north, south

const at = (w: Window, t: number) => w[0] + (w[1] - w[0]) * t;
/** Frames take the first 80% of the window and glass the last 80%, so on every floor the frame leads. */
const FRAME_WIN: Window = [INTRO.envelope[0], at(INTRO.envelope, 0.8)];
const GLASS_WIN: Window = [at(INTRO.envelope, 0.2), INTRO.envelope[1]];
const floorFrame = (f: number) => stagger(FRAME_WIN, f, FLOORS, 0.35);
const GLASS_WINS = Array.from({ length: FLOORS }, (_, f) => stagger(GLASS_WIN, f, FLOORS, 0.35));

type Mullion = { readonly x: number; readonly z: number; readonly y0: number; readonly h: number; readonly w: Window };
type Transom = { readonly y: number; readonly h: number; readonly z: number; readonly w: Window };

/** One mullion per bay line per face per floor, rising west -> east in the first 70% of the floor's window. */
const MULLIONS: readonly Mullion[] = Array.from({ length: FLOORS }, (_, f) => {
  const fw = floorFrame(f);
  const rise: Window = [fw[0], at(fw, 0.7)];
  const h = LEVELS[f + 1].y - LEVELS[f].y;
  return FACES.flatMap((s) =>
    MULLION_X.map((x, k) => ({ x, z: s * FRAME_Z, y0: LEVELS[f].y, h, w: stagger(rise, k, BAYS + 1, 0.9) })),
  );
}).flat();

/** Sill (L1 only), mid-storey rail and slab-edge band per floor, run bottom-up once the mullions stand. */
const TRANSOMS: readonly Transom[] = Array.from({ length: FLOORS }, (_, f) => {
  const fw = floorFrame(f);
  const run: Window = [at(fw, 0.35), fw[1]];
  const rows = [
    ...(f === 0 ? [{ y: TRANSOM.sill / 2, h: TRANSOM.sill }] : []),
    { y: (LEVELS[f].y + LEVELS[f + 1].y) / 2, h: TRANSOM.mid },
    { y: LEVELS[f + 1].y - SLAB_T / 2, h: TRANSOM.slab },
  ];
  return FACES.flatMap((s) => rows.map((r, j) => ({ ...r, z: s * FRAME_Z, w: stagger(run, j, rows.length, 0.5) })));
}).flat();

const RUN_X0 = -SLAB.x - FRAME.w / 2;
const RUN_LEN = 2 * SLAB.x + FRAME.w;

/** North + south glass for one floor, as one geometry. */
function glassFloor(f: number): THREE.BufferGeometry {
  const y0 = LEVELS[f].y;
  const y1 = LEVELS[f + 1].y;
  return merge(FACES.map((s) => new THREE.PlaneGeometry(2 * SLAB.x, y1 - y0).translate(0, (y0 + y1) / 2, s * CURTAIN_Z)));
}

/**
 * A floor's glass while it fades in. ARCH.glass is shared (X-ray drives its
 * opacity, the visual style its finish), so the fade runs on a copy that tracks
 * it — finish, visibility, opacity x fade, same section plane — and the mesh
 * switches back to ARCH.glass once fully in.
 */
function fadeMaterial(): THREE.MeshStandardMaterial {
  const m = ARCH.glass.clone();
  m.clippingPlanes = CLIP; // clone() copies the planes; point back at the shared, animated one
  return m;
}

/** Mullions rise, transoms run with a glow head at the leading end. No allocation; only when bim.intro moved. */
function placeFrame(frame: THREE.InstancedMesh, heads: THREE.InstancedMesh, p: number) {
  let i = 0;
  for (let j = 0; j < MULLIONS.length; j++, i++) {
    const m = MULLIONS[j];
    const g = arrive(p, m.w);
    setBox(frame, i, m.x, m.y0 + (m.h * g) / 2, m.z, FRAME.w, m.h * g, FRAME.d);
  }
  let lit = false;
  for (let j = 0; j < TRANSOMS.length; j++, i++) {
    const t = TRANSOMS[j];
    const k = ease(p, t.w);
    const len = RUN_LEN * k;
    setBox(frame, i, RUN_X0 + len / 2, t.y, t.z, len, t.h, FRAME.d);
    const on = k > 0 && k < 1;
    const s = on ? HEAD : 0;
    setBox(heads, j, RUN_X0 + len, t.y, t.z + (Math.sign(t.z) * FRAME.d) / 2, s, s, s);
    lit ||= on;
  }
  frame.visible = p > FRAME_WIN[0];
  frame.instanceMatrix.needsUpdate = true;
  heads.visible = lit;
  heads.instanceMatrix.needsUpdate = true;
}

export default function Envelope() {
  const assets = useMemo(
    () => ({
      unit: new THREE.BoxGeometry(1, 1, 1),
      glass: Array.from({ length: FLOORS }, (_, f) => glassFloor(f)),
      fades: Array.from({ length: FLOORS }, fadeMaterial),
    }),
    [],
  );
  useEffect(
    () => () => {
      assets.unit.dispose();
      for (const g of assets.glass) g.dispose();
      for (const m of assets.fades) m.dispose();
    },
    [assets],
  );

  const frame = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const panes = useRef<(THREE.Mesh | null)[]>([]);
  const last = useRef(Number.NaN);

  useFrame(() => {
    const p = bim.intro;
    const fr = frame.current;
    const hd = heads.current;
    if (!fr || !hd) return;
    // While a floor is mid-fade its copy tracks ARCH.glass every frame (X-ray may move it); otherwise only on change.
    const fading = p > GLASS_WIN[0] && p < GLASS_WIN[1];
    if (p === last.current && !fading) return;
    const moved = p !== last.current;
    last.current = p;

    if (moved) placeFrame(fr, hd, p);
    for (let f = 0; f < FLOORS; f++) {
      const pane = panes.current[f];
      if (!pane) continue;
      const k = ease(p, GLASS_WINS[f]);
      pane.visible = k > 0;
      if (k >= 1) {
        pane.material = ARCH.glass;
      } else {
        const fade = assets.fades[f];
        copyFinish(fade, ARCH.glass); // the style may repaint the glass mid-fade
        fade.visible = ARCH.glass.visible;
        fade.opacity = ARCH.glass.opacity * k;
        pane.material = fade;
      }
    }
  });

  return (
    <group name="envelope">
      <instancedMesh ref={frame} args={[assets.unit, ARCH.mullion, MULLIONS.length + TRANSOMS.length]} frustumCulled={false} />
      <instancedMesh ref={heads} args={[assets.unit, GLOW.spark, TRANSOMS.length]} frustumCulled={false} />
      {assets.glass.map((geometry, f) => (
        <mesh
          key={LEVELS[f].id}
          ref={(m) => {
            panes.current[f] = m;
          }}
          geometry={geometry}
          material={ARCH.glass}
          // after the concrete it sits in front of: all ARCH materials are transparent, so order decides blending
          renderOrder={1}
        />
      ))}
    </group>
  );
}
