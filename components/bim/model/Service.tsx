"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeInOutCubic, easeOutCubic, lerp, seg } from "@/lib/timing";
import { CONTROLS, EXHAUST, ROOF_Y, RTU, RTU_BASE, SERVICE_STOPS, type V3 } from "../geometry";
import { COLORS } from "../materials";
import { Tag } from "../kit";
import { STORY, arrive, win, type Window } from "../timeline";
import { bim } from "../store";
import { bandPassed, glowGradient } from "./signals/fx";

/**
 * Chapter 05 — MAINTENANCE (preventative). One stop per SERVICE_STOPS window: a
 * scanning ring locks onto the equipment and sweeps it top to bottom carrying a
 * translucent scan plane, then a green check badge lands. Badges stay, dimmed, until
 * the finale's band of light passes them and relights them. Pure function of
 * bim.story — scrub-back safe, and at story = 1 (reduced motion) only the lit badges remain.
 */

type StopId = (typeof SERVICE_STOPS)[number]["id"];

const RING_TUBE = 0.035;
/** an open arc, so its turning reads as an orbit */
const RING_ARC = Math.PI * 2 * 0.82;
const RING_ORBIT = Math.PI * 1.5;
const RING_LOCK_FROM = 1.35;
const RING_RELEASE_TO = 1.12;
const DISC_PEAK = 0.4;
const BADGE_DIM = 0.45;

/** Vertical scan per stop: from just above the equipment down to its base (curb / panel bottom). */
const SWEEP: Record<StopId, readonly [top: number, bottom: number]> = {
  rtu: [RTU_BASE + RTU.h + 0.35, ROOF_Y + 0.05],
  fan: [ROOF_Y + EXHAUST.fanCurb + EXHAUST.fanH + 0.3, ROOF_Y + 0.05],
  ems: [CONTROLS.panel.y + CONTROLS.panel.h / 2 + 0.25, CONTROLS.panel.y - CONTROLS.panel.h / 2 - 0.25],
};

const STOPS = SERVICE_STOPS.map((s, k) => {
  const [top, bottom] = SWEEP[s.id];
  const w: Window = STORY.maintenance.stops[k];
  return {
    ...s,
    w,
    top,
    bottom,
    badge: [s.at[0], top + 0.15, s.at[2]] as V3,
    badgeIn: [lerp(w[0], w[1], 0.8), w[1]] as Window,
    badgeDim: [w[1], w[1] + 0.012] as Window,
    /** horizontal, around the equipment's vertical axis */
    ring: new THREE.TorusGeometry(s.r, RING_TUBE, 8, 160, RING_ARC).rotateX(Math.PI / 2),
  };
});

/** maintenance reads violet: the ring is lifted past 1 so bloom catches the thin arc */
const ringMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(COLORS.violetGlow).multiplyScalar(3),
  toneMapped: false,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  fog: false,
});
/** unit scan plane, dark at the centre and bright at the rim */
const DISC = glowGradient(new THREE.RingGeometry(0, 1, 72, 6).rotateX(-Math.PI / 2), (x, _y, z) => Math.hypot(x, z) ** 3);
const discMat = new THREE.MeshBasicMaterial({
  color: COLORS.violet,
  vertexColors: true,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
  fog: false,
});

export default function Service() {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const disc = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const p = bim.story;
    let active = false;
    for (let k = 0; k < STOPS.length; k++) {
      const s = STOPS[k];
      const ring = rings.current[k];
      const u = win(p, s.w);
      const live = u > 0 && u < 1 && !active; // windows abut: one stop at a time
      if (ring) ring.visible = live;
      if (!live || !ring) continue;
      active = true;

      const lock = easeOutCubic(seg(u, 0, 0.16));
      const release = seg(u, 0.8, 0.94);
      const y = lerp(s.top, s.bottom, easeInOutCubic(seg(u, 0.1, 0.8)));
      const scale = lerp(RING_LOCK_FROM, 1, lock) * lerp(1, RING_RELEASE_TO, release);
      ring.position.set(s.at[0], y, s.at[2]);
      ring.rotation.y = u * RING_ORBIT;
      ring.scale.setScalar(scale);
      ringMat.opacity = lock * (1 - release);

      const d = disc.current;
      if (d) {
        d.position.set(s.at[0], y, s.at[2]);
        d.scale.set(s.r * scale, 1, s.r * scale);
        discMat.opacity = DISC_PEAK * seg(u, 0.08, 0.2) * (1 - seg(u, 0.72, 0.86));
      }
    }
    if (disc.current) disc.current.visible = active;
  });

  return (
    <group>
      {STOPS.map((s, k) => (
        <mesh
          key={s.id}
          ref={(el) => {
            rings.current[k] = el;
          }}
          geometry={s.ring}
          material={ringMat}
          visible={false}
        />
      ))}
      <mesh ref={disc} geometry={DISC} material={discMat} visible={false} />

      {STOPS.map((s) => (
        <Tag
          key={s.id}
          position={s.badge}
          show={() => {
            const p = bim.story;
            const dimmed = lerp(1, BADGE_DIM, win(p, s.badgeDim));
            return arrive(p, s.badgeIn) * lerp(dimmed, 1, bandPassed(p, s.badge[1]));
          }}
        >
          <span className="text-green-glow">{s.tag} · PM ✓</span>
        </Tag>
      ))}
    </group>
  );
}
