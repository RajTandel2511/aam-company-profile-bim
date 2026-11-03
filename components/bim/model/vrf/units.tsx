"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { easeInCubic, easeOutCubic, lerp, seg } from "@/lib/timing";
import { SPLIT, VRF } from "../../geometry";
import { MEP } from "../../materials";
import { bim } from "../../store";
import { arrive, win } from "../../timeline";
import { box, cylinder, disc, merge, outline, useParts } from "../air/parts";
import { ROOF_TOP, UNIT_BASE } from "./plan";
import { H, W, sub } from "./schedule";

/**
 * The VRF chapter's equipment: three heat-recovery condensing modules and the
 * split condenser craned onto the roof one after another (lowered on slings,
 * touching down with a hop, the rig climbing away), and the ductless wall unit
 * growing out of the core wall at L3. Fans spin and the louvre swings from the
 * run mark on bim.time (frozen by Pause motion, still under reduced motion).
 */

/** Crane lift: starts `drop` m above its seat, hops once on the slings, then the rig unhooks and climbs out. */
const CRANE = { drop: 9, bounce: 0.14, rise: 14, hook: 1.5, cable: 50 } as const;
/** Module cabinet roof: the fan bell's rim and guard stand above it, up to VRF.h. */
const CAB_TOP = VRF.h - 0.12;
const BASE = 0.07;
const FAN = { r: 0.46, spin: 6.5, condenserSpin: 9 } as const;
const COND = SPLIT.condenser;
const COND_BASE = ROOF_TOP + COND.stand;
/** the condenser's fan sits left of centre on its front face */
const COND_FAN: readonly [number, number] = [-0.1, COND.h / 2];
const WALL = SPLIT.wall;
const LOUVRE = { open: 0.55, swing: 0.18, rate: 0.8 } as const;

const lineGeo = (pts: number[]) => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
/** Fine horizontal louvre lines across a coil face, from a to b (x, z), every `step` between y0 and y1. */
function louvres(out: number[], y0: number, y1: number, step: number, a: readonly [number, number], b: readonly [number, number]) {
  for (let y = y0; y <= y1 + 1e-6; y += step) out.push(a[0], y, a[1], b[0], y, b[1]);
}

/** Slings from a hook above the unit to its top corners, and the crane cable. */
function rigParts(w: number, d: number, top: number) {
  const hookY = top + CRANE.hook;
  const pts: number[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(0, hookY, 0, sx * (w / 2 - 0.12), top, sz * (d / 2 - 0.1));
  pts.push(0, hookY, 0, 0, hookY + CRANE.cable, 0);
  return { rig: lineGeo(pts), hook: box(0.16, 0.24, 0.16, 0, hookY + 0.12, 0) };
}

/** One VRF module, origin at its base on the rails: cabinet, front service panels, dark coil faces on three sides, top fan. */
function moduleParts() {
  const { w, d, h } = VRF;
  const coil = { y0: 0.26, y1: 1.5 };
  const coilY = (coil.y0 + coil.y1) / 2;
  const coilH = coil.y1 - coil.y0;
  const cabinet = () => box(w, CAB_TOP - BASE, d, 0, BASE + (CAB_TOP - BASE) / 2, 0);
  const base = () => box(w + 0.02, BASE, d + 0.02, 0, BASE / 2, 0);
  const panels = () => [-1, 1].map((s) => box(0.56, 1.18, 0.012, s * 0.3, 0.92, d / 2 + 0.006));
  const lines: number[] = [];
  louvres(lines, coil.y0 + 0.03, coil.y1 - 0.03, 0.045, [-w / 2 + 0.08, -d / 2 - 0.009], [w / 2 - 0.08, -d / 2 - 0.009]);
  for (const s of [-1, 1]) louvres(lines, coil.y0 + 0.03, coil.y1 - 0.03, 0.045, [s * (w / 2 + 0.009), -d / 2 + 0.08], [s * (w / 2 + 0.009), d / 2 - 0.08]);
  const guardY = h - 0.004;
  return {
    body: merge([cabinet(), ...panels(), new THREE.TorusGeometry(FAN.r + 0.06, 0.04, 8, 48).rotateX(Math.PI / 2).translate(0, CAB_TOP + 0.04, 0)]),
    shade: merge([
      base(),
      box(w - 0.14, coilH, 0.008, 0, coilY, -d / 2 - 0.004),
      box(0.008, coilH, d - 0.14, -w / 2 - 0.004, coilY, 0),
      box(0.008, coilH, d - 0.14, w / 2 + 0.004, coilY, 0),
      ...[-1, 1].map((s) => box(0.03, 0.16, 0.025, s * 0.1, 0.95, d / 2 + 0.02)),
      box(0.16, 0.07, 0.006, 0.42, 1.38, d / 2 + 0.015), // nameplate
      disc(FAN.r + 0.02, 0, CAB_TOP + 0.003, 0), // dark throat under the blades
      ...[0.14, 0.26, 0.38, FAN.r + 0.04].map((r) => new THREE.TorusGeometry(r, 0.008, 5, 48).rotateX(Math.PI / 2).translate(0, guardY, 0)),
      ...[0, 1, 2, 3].map((k) => box(2 * (FAN.r + 0.04), 0.012, 0.014, 0, guardY, 0).rotateY((k * Math.PI) / 4)),
    ]),
    edges: merge([outline([cabinet(), base(), ...panels()]), lineGeo(lines)]),
    blades: merge([...[0, 1, 2, 3].map((k) => box(FAN.r - 0.06, 0.012, 0.14, 0.04 + (FAN.r - 0.06) / 2, 0, 0).rotateX(0.3).rotateY((k * Math.PI) / 2)), cylinder(0.08, 0.06)]),
    ...rigParts(w, d, CAB_TOP),
  };
}

/** The split's outdoor condenser, origin at its base on the stand: cabinet, front fan grille, coil lines on the back. */
function condenserParts() {
  const { w, d, h } = COND;
  const [fx, fy] = COND_FAN;
  const gz = d / 2 + 0.026;
  const body = () => box(w, h, d, 0, h / 2, 0);
  const lines: number[] = [];
  louvres(lines, 0.08, h - 0.08, 0.04, [-w / 2 + 0.05, -d / 2 - 0.004], [w / 2 - 0.05, -d / 2 - 0.004]);
  return {
    body: body(),
    shade: merge([
      new THREE.CircleGeometry(0.235, 32).translate(fx, fy, d / 2 + 0.003),
      ...[0.11, 0.22].map((r) => new THREE.TorusGeometry(r, 0.007, 5, 40).translate(fx, fy, gz)),
      ...[1, 3].map((k) => box(0.46, 0.012, 0.012).rotateZ((k * Math.PI) / 4).translate(fx, fy, gz)),
    ]),
    edges: merge([outline([body()]), lineGeo(lines)]),
    blades: merge([...[0, 1, 2].map((k) => box(0.17, 0.075, 0.008, 0.115, 0, 0).rotateX(0.25).rotateZ((k * Math.PI * 2) / 3)), cylinder(0.04, 0.03).rotateX(Math.PI / 2)]),
    ...rigParts(w, d, h),
  };
}

/** Wall unit, origin on the core wall face: a slim rounded cabinet with a dark outlet along its underside. */
function wallParts() {
  const { w, h, d } = WALL;
  return {
    body: new RoundedBoxGeometry(d, h, w, 3, 0.05).translate(d / 2, 0, 0),
    shade: merge([box(0.1, 0.006, w - 0.14, d - 0.075, -h / 2 - 0.002, 0), box(0.006, 0.01, w - 0.12, d + 0.001, h / 2 - 0.085, 0)]),
    louvre: box(0.085, 0.008, w - 0.16, 0.035, 0, 0),
  };
}

/** Lowers `unit` onto its seat at `base` as t goes 0..1, then the rig climbs away. */
function lift(unit: THREE.Group, rig: THREE.Group, base: number, t: number) {
  const p = seg(t, 0, 0.78);
  const q = seg(t, 0.78, 1);
  const y = base + CRANE.drop * (1 - easeOutCubic(p)) + CRANE.bounce * Math.abs(Math.sin(Math.PI * 2 * q)) * (1 - q) ** 2;
  unit.visible = t > 0;
  unit.position.y = y;
  rig.visible = t > 0 && t < 1;
  rig.position.y = y + CRANE.rise * easeInCubic(seg(t, 0.86, 1));
}

/** Lift windows: the three modules, then the condenser once its stand is up. */
const LIFTS = [...W.modules, sub(W.condenser, 0.15, 1)];
const SEATS = [UNIT_BASE, UNIT_BASE, UNIT_BASE, COND_BASE];

export function Units() {
  const mod = useParts(moduleParts);
  const cond = useParts(condenserParts);
  const wall = useParts(wallParts);
  const units = useRef<(THREE.Group | null)[]>([]);
  const rigs = useRef<(THREE.Group | null)[]>([]);
  const fans = useRef<(THREE.Mesh | null)[]>([]);
  const wallUnit = useRef<THREE.Group>(null);
  const louvre = useRef<THREE.Mesh>(null);
  const last = useRef(NaN);

  useFrame(() => {
    const on = bim.story >= H.run;
    const t = on && !bim.reduced ? bim.time : 0;
    for (let m = 0; m < 3; m++) {
      const f = fans.current[m];
      if (f) f.rotation.y = t * FAN.spin + m * 0.7;
    }
    const cf = fans.current[3];
    if (cf) cf.rotation.z = -t * FAN.condenserSpin;
    if (louvre.current) louvre.current.rotation.z = on ? -(LOUVRE.open + LOUVRE.swing * Math.sin(t * LOUVRE.rate)) : 0;

    if (bim.story === last.current) return;
    last.current = bim.story;
    for (let m = 0; m < LIFTS.length; m++) {
      const u = units.current[m];
      const r = rigs.current[m];
      if (u && r) lift(u, r, SEATS[m], win(bim.story, LIFTS[m]));
    }
    const g = wallUnit.current;
    if (g) {
      // grows out of the core wall
      const a = arrive(bim.story, W.wall);
      g.visible = a > 0.001;
      g.scale.set(Math.max(0.001, a), lerp(0.7, 1, a), lerp(0.7, 1, a));
    }
  });

  const unitAt = (m: number, x: number, z: number, parts: typeof mod | typeof cond, fan: [number, number, number]) => (
    <group key={m}>
      <group
        ref={(el) => {
          units.current[m] = el;
        }}
        position={[x, SEATS[m], z]}
        visible={false}
      >
        <mesh geometry={parts.body} material={MEP.equipment} />
        <mesh geometry={parts.shade} material={MEP.equipmentShade} />
        <lineSegments geometry={parts.edges} material={MEP.edge} />
        <mesh
          ref={(el) => {
            fans.current[m] = el;
          }}
          geometry={parts.blades}
          material={MEP.equipment}
          position={fan}
        />
      </group>
      <group
        ref={(el) => {
          rigs.current[m] = el;
        }}
        position={[x, SEATS[m], z]}
        visible={false}
      >
        <lineSegments geometry={parts.rig} material={MEP.edge} />
        <mesh geometry={parts.hook} material={MEP.equipmentShade} />
      </group>
    </group>
  );

  return (
    <group>
      {VRF.modulesX.map((x, m) => unitAt(m, x, VRF.z, mod, [0, CAB_TOP + 0.07, 0]))}
      {unitAt(3, COND.x, COND.z, cond, [COND_FAN[0], COND_FAN[1], COND.d / 2 + 0.012])}
      <group ref={wallUnit} position={[WALL.x - WALL.d / 2, WALL.y, WALL.z]} visible={false}>
        <mesh geometry={wall.body} material={MEP.equipment} />
        <mesh geometry={wall.shade} material={MEP.equipmentShade} />
        <mesh ref={louvre} geometry={wall.louvre} material={MEP.equipment} position={[WALL.d - 0.11, -WALL.h / 2 - 0.012, 0]} />
      </group>
    </group>
  );
}
