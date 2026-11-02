"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { prng } from "@/lib/timing";
import { bim } from "./store";

const DUST = { count: 420, lowCount: 160, box: [86, 34, 66] as const };

const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uPx;
  attribute float aPhase;
  varying float vFade;
  void main() {
    vec3 p = position;
    // slow updraft that wraps at the top, with a lazy sideways swirl
    p.y = mod(p.y + uTime * (0.35 + aPhase * 0.25), ${DUST.box[1].toFixed(1)});
    p.x += sin(uTime * 0.17 + aPhase * 6.2831) * 1.4;
    p.z += cos(uTime * 0.13 + aPhase * 6.2831) * 1.1;
    vFade = smoothstep(0.0, 4.0, p.y) * (1.0 - smoothstep(${(DUST.box[1] - 6).toFixed(1)}, ${DUST.box[1].toFixed(1)}, p.y));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * (0.6 + aPhase) * (60.0 / -mv.z);
  }
`;
const dustFrag = /* glsl */ `
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.55, 0.86, 1.0) * 1.3, a * a * uOpacity * vFade);
  }
`;

const glowFrag = /* glsl */ `
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = pow(max(0.0, 1.0 - d), 2.4);
    gl_FragColor = vec4(vec3(0.03, 0.34, 0.62) * g * uStrength, 1.0);
  }
`;
const glowVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/**
 * Air you can see: slow-rising cyan dust motes catching the light around the
 * model, and a soft cyan-blue glow pooling under the building like a site lamp.
 * Both are GPU-only (one draw call each) and freeze with the motion pause (bim.time).
 */
export default function Atmosphere() {
  const dust = useRef<THREE.Points>(null);
  const { geometry, dustMat, glowMat } = useMemo(() => {
    const n = bim.quality === "low" ? DUST.lowCount : DUST.count;
    const rand = prng(1994);
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() - 0.5) * DUST.box[0];
      pos[i * 3 + 1] = rand() * DUST.box[1];
      pos[i * 3 + 2] = (rand() - 0.5) * DUST.box[2];
      phase[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    const d = new THREE.ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPx: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const gm = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: { uStrength: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry: g, dustMat: d, glowMat: gm };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      dustMat.dispose();
      glowMat.dispose();
    },
    [geometry, dustMat, glowMat],
  );

  useFrame(({ gl }) => {
    const on = bim.reduced ? 0 : Math.min(1, bim.intro * 1.4);
    dustMat.uniforms.uTime.value = bim.time;
    dustMat.uniforms.uOpacity.value = 0.55 * on;
    dustMat.uniforms.uPx.value = gl.getPixelRatio();
    if (dust.current) dust.current.visible = on > 0.01;
    // the pool brightens a touch once the systems are running
    glowMat.uniforms.uStrength.value = (0.55 + 0.35 * bim.xray) * Math.min(1, bim.intro * 2);
  });

  return (
    <group>
      <points ref={dust} geometry={geometry} material={dustMat} frustumCulled={false} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} material={glowMat} renderOrder={-1}>
        <planeGeometry args={[110, 80]} />
      </mesh>
    </group>
  );
}
