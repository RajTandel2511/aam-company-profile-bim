"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { motionTokens } from "@/lib/motion-tokens";
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, seg } from "@/lib/timing";
import { CHOREO, CITIES, HQ, HQ_INDEX, LEVEL, SLAB, STREAMS, TOTAL, TWIN_COLORS, type Focus, type ReachCity, type TwinClock } from "./data";

/**
 * The network on the map: a cyan pillar per city with one floor plate per active
 * project (white core, white top plate), rings at HQ in the three stream colours, and
 * an arc from HQ to every city — cycling supply blue, exhaust green and return coral —
 * with its stream travelling along it. Transparent overlays carry
 * renderOrder 1 so they always composite over the (transparent) land.
 */

const CORE_R = 0.014;
const HALO_R = 0.06;
const HALO_OPACITY = 0.14;
const PLATE_R = 0.055;
const PLATE_T = 0.014;
const FOOT_R = 0.12;
const FOOT_OPACITY = 0.85;
const HIT_R = 0.16;
const HIT_PAD = 0.3;
/** Colours are pushed past 1 so the bloom pass picks them up. */
const BOOST = 2.2;
const BOOST_RGB: [number, number, number] = [BOOST, BOOST, BOOST];
const RING_RADII = [0.17, 0.25, 0.33];
const RING_W = 0.016;
const PULSE_PERIOD = 3.2; // seconds
const ARC_R = 0.016;
const ARC_PEAK = 0.18; // arc height per world unit of distance from HQ ...
const ARC_PEAK_MIN = 0.22; // ... plus this
const ARC_BEND = 0.12; // sideways bow as a fraction of the chord, all one way, so the fan reads as a swirl
const ARC_ALPHA = 0.9;
const ARC_GLOW = 1.3;
const ARC_GLOW_ON = 1.4;
const PARTICLE_R = 0.026;
const PARTICLE_SPEED = 0.85; // world units per second
const PARTICLE_GAP = 1.5; // world units between particles on an arc

const STREAM_COLORS = STREAMS.map((s) => new THREE.Color(s.glow));
const PILLAR = new THREE.Color(TWIN_COLORS.pillar);
const CORE = new THREE.Color(TWIN_COLORS.core);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const tintTop = new THREE.Color();

type PartProps = { clock: TwinClock; focus: Focus; reduce: boolean };
export type NetworkProps = PartProps & {
  lowEnd: boolean;
  onHover: (city: string | null) => void;
  onSelect: (city: string | null) => void;
};

type Arc = { city: ReachCity; index: number; curve: THREE.QuadraticBezierCurve3; length: number };

/** One raised curve from HQ to every other city. */
const ARCS: Arc[] = CITIES.flatMap((city, index) => {
  if (city.isHQ) return [];
  const [hx, hz] = HQ;
  const dx = city.x - hx;
  const dz = city.z - hz;
  const peak = ARC_PEAK_MIN + ARC_PEAK * Math.hypot(dx, dz);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(hx, SLAB, hz),
    // a quadratic Bezier peaks at half its control point's height
    new THREE.Vector3(hx + dx / 2 - dz * ARC_BEND, SLAB + 2 * peak, hz + dz / 2 + dx * ARC_BEND),
    new THREE.Vector3(city.x, SLAB, city.z),
  );
  return [{ city, index, curve, length: curve.getLength() }];
});

function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

function cityAt(e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>): string | null {
  return e.instanceId === undefined ? null : (CITIES[e.instanceId]?.name ?? null);
}

function Pillars({ clock, focus, onHover, onSelect }: Omit<NetworkProps, "lowEnd" | "reduce">) {
  const gl = useThree((s) => s.gl);
  const core = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const foot = useRef<THREE.InstancedMesh>(null);
  const plates = useRef<THREE.InstancedMesh>(null);
  const hit = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(
    () => ({
      column: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0),
      plate: new THREE.CylinderGeometry(1, 1, 1, 24),
      ring: new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2),
      hit: new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  // Fixed hover columns, and seed colours so instanceColor exists before the first frame compiles.
  useLayoutEffect(() => {
    const h = hit.current;
    if (h) {
      CITIES.forEach((c, i) => place(h, i, c.x, 0, c.z, HIT_R, SLAB + c.count * LEVEL + HIT_PAD, HIT_R));
      h.instanceMatrix.needsUpdate = true;
      h.computeBoundingSphere();
    }
    CITIES.forEach((_, i) => {
      core.current?.setColorAt(i, CORE);
      halo.current?.setColorAt(i, PILLAR);
      foot.current?.setColorAt(i, PILLAR);
    });
    for (let j = 0; j < TOTAL; j++) plates.current?.setColorAt(j, PILLAR);
  }, []);

  useFrame(() => {
    const [c0, h0, f0, p0] = [core.current, halo.current, foot.current, plates.current];
    if (!c0 || !h0 || !f0 || !p0) return;
    const t = clock.t;
    let j = 0;
    CITIES.forEach((c, i) => {
      const { on, dim } = focus[i];
      const grow = easeOutCubic(seg(t, c.pillarAt, c.pillarAt + CHOREO.pillarGrow));
      const height = Math.max(1e-4, c.count * LEVEL * grow);
      const wide = 1 + 0.5 * on;
      const glow = (1 + 0.7 * on) * (1 - 0.72 * dim);
      tint.copy(PILLAR).multiplyScalar(glow);
      tintTop.copy(CORE).multiplyScalar(glow);

      place(c0, i, c.x, SLAB, c.z, CORE_R * wide, height, CORE_R * wide);
      place(h0, i, c.x, SLAB, c.z, HALO_R * wide, height, HALO_R * wide);
      const footR = FOOT_R * wide * easeOutBack(seg(t, c.pillarAt, c.pillarAt + CHOREO.pillarGrow));
      place(f0, i, c.x, SLAB + 0.002, c.z, footR, 1, footR);
      c0.setColorAt(i, tintTop);
      h0.setColorAt(i, tint);
      f0.setColorAt(i, tint);

      // A plate pops as the column passes each storey; the top plate burns white.
      const storeys = height / LEVEL;
      for (let k = 0; k < c.count; k++, j++) {
        const r = PLATE_R * wide * easeOutBack(clamp((storeys - k - 0.7) / 0.3));
        place(p0, j, c.x, SLAB + (k + 1) * LEVEL - PLATE_T / 2, c.z, r, PLATE_T, r);
        p0.setColorAt(j, k === c.count - 1 ? tintTop : tint);
      }
    });
    for (const m of [c0, h0, f0, p0]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={halo} args={[geo.column, undefined, CITIES.length]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial
          color={BOOST_RGB}
          toneMapped={false}
          fog={false}
          transparent
          opacity={HALO_OPACITY}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh ref={core} args={[geo.column, undefined, CITIES.length]} frustumCulled={false}>
        <meshBasicMaterial color={BOOST_RGB} toneMapped={false} fog={false} />
      </instancedMesh>
      <instancedMesh ref={plates} args={[geo.plate, undefined, TOTAL]} frustumCulled={false}>
        <meshBasicMaterial color={BOOST_RGB} toneMapped={false} fog={false} />
      </instancedMesh>
      <instancedMesh ref={foot} args={[geo.ring, undefined, CITIES.length]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial color={BOOST_RGB} toneMapped={false} fog={false} transparent opacity={FOOT_OPACITY} depthWrite={false} />
      </instancedMesh>
      {/* Invisible fat columns: thin pillars are hard to hover. Touch selects on tap instead of hover. */}
      <instancedMesh
        ref={hit}
        args={[geo.hit, undefined, CITIES.length]}
        onPointerOver={(e) => {
          if (e.pointerType === "touch") return;
          e.stopPropagation();
          gl.domElement.style.cursor = "pointer";
          onHover(cityAt(e));
        }}
        onPointerOut={(e) => {
          if (e.pointerType === "touch") return;
          gl.domElement.style.cursor = "";
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(cityAt(e));
        }}
      >
        <meshBasicMaterial visible={false} />
      </instancedMesh>
    </group>
  );
}

/** HQ: the logo's three streams as three rings, breathing out of phase. */
function HqRings({ clock, focus, reduce }: PartProps) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const rings = useMemo(
    () =>
      RING_RADII.map((r, i) => ({
        geometry: new THREE.RingGeometry(r - RING_W / 2, r + RING_W / 2, 72).rotateX(-Math.PI / 2),
        color: STREAM_COLORS[i].clone().multiplyScalar(BOOST),
      })),
    [],
  );
  useEffect(() => () => rings.forEach((r) => r.geometry.dispose()), [rings]);

  useFrame(() => {
    const t = clock.t;
    const appear = easeOutCubic(seg(t, CHOREO.hqAt, CHOREO.hqAt + motionTokens.duration.slow));
    const away = HQ_INDEX >= 0 ? focus[HQ_INDEX].dim : 0;
    rings.forEach((_, i) => {
      const mesh = meshes.current[i];
      const mat = mats.current[i];
      if (!mesh || !mat) return;
      const pulse = reduce ? 0 : Math.sin((2 * Math.PI * clock.amb) / PULSE_PERIOD - (i * 2 * Math.PI) / 3);
      mesh.scale.setScalar((0.5 + 0.5 * appear) * (1 + 0.06 * pulse));
      mat.opacity = appear * (0.78 + 0.22 * pulse) * (1 - 0.6 * away);
    });
  });

  return (
    <group position={[HQ[0], SLAB + 0.004, HQ[1]]}>
      {rings.map((r, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          geometry={r.geometry}
          renderOrder={1}
        >
          <meshBasicMaterial
            ref={(el) => {
              mats.current[i] = el;
            }}
            color={r.color}
            toneMapped={false}
            fog={false}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

const ARC_VERTEX = /* glsl */ `
  varying float vU;
  void main() {
    vU = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARC_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uAlpha;
  uniform float uBoost;
  varying float vU;
  void main() {
    if (vU > uProgress) discard;
    // a bright head while the arc is still drawing on
    float head = smoothstep(uProgress - 0.12, uProgress, vU) * (1.0 - step(0.999, uProgress));
    gl_FragColor = vec4(uColor * (uBoost + 2.5 * head), uAlpha);
    #include <colorspace_fragment>
  }
`;

/** Tubes that draw on from HQ (uv.x runs along each tube, so one uniform reveals it). */
function Arcs({ clock, focus }: PartProps) {
  const arcs = useMemo(
    () =>
      ARCS.map((a) => ({
        ...a,
        geometry: new THREE.TubeGeometry(a.curve, 64, ARC_R, 6, false),
        material: new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: STREAM_COLORS[a.city.stream].clone() },
            uProgress: { value: 0 },
            uAlpha: { value: ARC_ALPHA },
            uBoost: { value: ARC_GLOW },
          },
          vertexShader: ARC_VERTEX,
          fragmentShader: ARC_FRAGMENT,
          transparent: true,
          depthWrite: false,
        }),
      })),
    [],
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(
    () => () =>
      arcs.forEach((a) => {
        a.geometry.dispose();
        a.material.dispose();
      }),
    [arcs],
  );

  useFrame(() => {
    const t = clock.t;
    arcs.forEach((a, i) => {
      const { on, dim } = focus[a.index];
      const p = easeInOutCubic(seg(t, a.city.arcAt, a.city.arcEnd));
      const mesh = meshes.current[i];
      if (mesh) mesh.visible = p > 0;
      const u = a.material.uniforms;
      u.uProgress.value = p;
      u.uAlpha.value = ARC_ALPHA * (1 - 0.8 * dim);
      u.uBoost.value = ARC_GLOW + ARC_GLOW_ON * on;
    });
  });

  return (
    <group>
      {arcs.map((a, i) => (
        <mesh
          key={a.city.name}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          geometry={a.geometry}
          material={a.material}
          renderOrder={1}
        />
      ))}
    </group>
  );
}

/** The streams themselves: evenly spaced sparks at constant speed, HQ -> city. Off under reduced motion, still while paused. */
function Particles({ clock, focus, reduce, lowEnd }: PartProps & { lowEnd: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const slots = useMemo(() => {
    const gap = lowEnd ? PARTICLE_GAP * 2 : PARTICLE_GAP;
    return ARCS.flatMap((arc, ai) => {
      const n = Math.max(1, Math.round(arc.length / gap));
      // ponytail: phase from the arc index, not Math.random — deterministic, and neighbouring arcs never pulse in sync.
      return Array.from({ length: n }, (_, k) => ({ arc, offset: k / n + ai * 0.37 }));
    });
  }, [lowEnd]);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    slots.forEach((s, i) => ref.current?.setColorAt(i, STREAM_COLORS[s.arc.city.stream]));
  }, [slots]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = !reduce;
    if (reduce) return;
    const t = clock.t;
    slots.forEach((s, i) => {
      const { on, dim } = focus[s.arc.index];
      const gate = seg(t, s.arc.city.arcEnd, s.arc.city.arcEnd + CHOREO.fade);
      const u = (((clock.amb * PARTICLE_SPEED) / s.arc.length + s.offset) % 1 + 1) % 1;
      const fade = Math.min(1, u / 0.1, (1 - u) / 0.1);
      s.arc.curve.getPointAt(u, dummy.position);
      dummy.scale.setScalar(PARTICLE_R * gate * fade * (1 + 0.6 * on) * (1 - 0.55 * dim));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, slots.length]} frustumCulled={false}>
      <meshBasicMaterial color={BOOST_RGB} toneMapped={false} fog={false} />
    </instancedMesh>
  );
}

export function Network({ lowEnd, onHover, onSelect, ...part }: NetworkProps) {
  return (
    <>
      <Arcs {...part} />
      <Particles {...part} lowEnd={lowEnd} />
      <Pillars clock={part.clock} focus={part.focus} onHover={onHover} onSelect={onSelect} />
      <HqRings {...part} />
    </>
  );
}
