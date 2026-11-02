"use client";

import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useReducedMotion } from "motion/react";
import { motionConfig } from "@/lib/motion-config";
import { getMotionPaused, useMotionPaused } from "@/lib/motion-pause";
import { clamp, easeOutCubic, seg } from "@/lib/timing";
import { CHOREO_END, CITIES, LEVEL, SLAB, TWIN_COLORS, type Focus, type MapFurniture, type TwinClock } from "./data";
import { Furniture } from "./TwinFurniture";
import { Land } from "./TwinLand";
import { Network } from "./TwinNetwork";
import { Tags } from "./TwinTags";

/** Compiles the map's shaders as soon as the canvas mounts (it mounts ahead of view), so its first visible frame doesn't hitch. */
function Warm() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera).catch(() => undefined);
    });
    return () => cancelAnimationFrame(id);
  }, [gl, scene, camera]);
  return null;
}

/**
 * The Bay Area site plan in 3D. Client-only: ReachExplorer loads it with next/dynamic
 * (ssr: false). The canvas is created only once the map comes within a screen and a
 * half of the viewport; it renders only while on screen with the tab visible, and the
 * scroll-in sequence starts once a third of it is in view. Reduced motion: the
 * finished map, no drift or particles, rendered on demand. Paused motion: drift,
 * pulses and sparks hold still, and frames are drawn on demand once the map is built.
 */

export type TwinProps = {
  active: string | null;
  onHover: (city: string | null) => void;
  onSelect: (city: string | null) => void;
  /** the HUD's site-plan furniture, placed from the live camera (TwinFurniture) */
  furniture: MutableRefObject<MapFurniture>;
};

type SceneProps = TwinProps & { started: boolean; reduce: boolean; lowEnd: boolean };

const FOV = 30;
const ELEVATION = THREE.MathUtils.degToRad(36); // pitched ~54 degrees off straight down
const DRIFT_AZ = THREE.MathUtils.degToRad(6);
const DRIFT_EL = THREE.MathUtils.degToRad(1.2);
const DRIFT_PERIOD = 28; // seconds per sway
const DOLLY = 0.18; // the intro pushes in from this much farther out
const FRAME_FILL = 0.84; // share of the view the cities may fill; the rest is room for tags and the edge fade
const CENTER_PASSES = 6; // converges to well under a pixel (checked numerically at 1:1 and 690x780)
const FOG_NEAR = 1; // world units beyond the look-at distance
const FOG_FAR = 15;
const START_RATIO = 0.3; // visible share of the map that starts the sequence
const NEAR_MARGIN = "150% 0px"; // the canvas is created this far ahead of the viewport
const MAX_STEP = 1 / 20; // clamp the frame delta so a stalled tab never jumps
const DAMP = 10; // highlight easing rate, 1/s
const SETTLED = 1e-3; // a highlight this close to its target counts as done
const PIXEL_BUDGET = 2.5e6; // high tier: device pixels per window the dpr may spend
const BLOOM = { threshold: 0.4, smoothing: 0.15, intensity: 1.1, radius: 0.55 } as const;

const UP = new THREE.Vector3(0, 1, 0);
const FIT_POINTS = CITIES.flatMap((c) => [
  new THREE.Vector3(c.x, 0, c.z),
  new THREE.Vector3(c.x, SLAB + c.count * LEVEL, c.z),
]);

/** Quality tier, decided once at mount with the BIM stage's split: a low-end device or a narrow screen. */
function pickTier(): { lowEnd: boolean; dpr: [number, number] } {
  const { innerWidth: w, innerHeight: h } = window;
  const lowEnd = motionConfig.isLowEnd() || w < 768;
  // ponytail: the budget counts the whole window (the canvas is smaller, so it errs sharp) and never drops below CSS pixels.
  return { lowEnd, dpr: [1, lowEnd ? 1.5 : clamp(Math.sqrt(PIXEL_BUDGET / (w * h)), 1, 1.75)] };
}

/** Camera distance that keeps every city base and pillar top inside the frame, for one view direction. */
function fitDistance(target: THREE.Vector3, az: number, el: number, aspect: number): number {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * FRAME_FILL;
  const tanH = tanV * aspect;
  const back = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const right = new THREE.Vector3().crossVectors(UP, back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const q = new THREE.Vector3();
  let d = 0;
  for (const p of FIT_POINTS) {
    q.subVectors(p, target);
    const depth = q.dot(back);
    d = Math.max(d, Math.abs(q.dot(right)) / tanH + depth, Math.abs(q.dot(up)) / tanV + depth);
  }
  return d;
}

/**
 * Look-at point and distance that centre the cities on screen and keep them in
 * frame across the whole drift. Perspective makes the near (south) cities read
 * wider, so a few passes nudge the target until the projected box is centred.
 */
function frameView(aspect: number): { target: THREE.Vector3; dist: number } {
  const target = new THREE.Vector3(0, LEVEL, 0);
  const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 500);
  const ndc = new THREE.Vector3();
  const fit = () =>
    Math.max(fitDistance(target, -DRIFT_AZ, ELEVATION, aspect), fitDistance(target, DRIFT_AZ, ELEVATION, aspect));
  for (let pass = 0; pass < CENTER_PASSES; pass++) {
    const dist = fit();
    cam.position.set(target.x, target.y + dist * Math.sin(ELEVATION), target.z + dist * Math.cos(ELEVATION));
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of FIT_POINTS) {
      ndc.copy(p).project(cam);
      x0 = Math.min(x0, ndc.x);
      x1 = Math.max(x1, ndc.x);
      y0 = Math.min(y0, ndc.y);
      y1 = Math.max(y1, ndc.y);
    }
    const halfH = dist * halfTan;
    target.x += ((x0 + x1) / 2) * halfH * aspect;
    target.z -= ((y0 + y1) / 2) * (halfH / Math.sin(ELEVATION));
  }
  return { target, dist: fit() };
}

type View = ReturnType<typeof frameView>;

/** Orbit the fitted view: a slow sway (ambient clock), plus the push-in that opens the sequence. */
function CameraRig({ clock, reduce, view }: { clock: TwinClock; reduce: boolean; view: View }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  useFrame(() => {
    const sway = (2 * Math.PI * clock.amb) / DRIFT_PERIOD;
    const az = reduce ? 0 : DRIFT_AZ * Math.sin(sway);
    const el = reduce ? ELEVATION : ELEVATION + DRIFT_EL * Math.sin(sway * 0.73);
    const dist = reduce ? view.dist : view.dist * (1 + DOLLY * (1 - easeOutCubic(seg(clock.t, 0, CHOREO_END))));
    camera.position.set(
      view.target.x + dist * Math.cos(el) * Math.sin(az),
      view.target.y + dist * Math.sin(el),
      view.target.z + dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(view.target);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = view.dist + FOG_NEAR;
      scene.fog.far = view.dist + FOG_FAR;
    }
  });
  return null;
}

type TickerProps = { clock: TwinClock; focus: Focus; started: boolean; reduce: boolean; active: string | null };

/**
 * Advances the scene clocks and eases each city's highlight. Mounted first, so it
 * subscribes first and every other part reads this frame's values. The build clock
 * runs whenever the sequence has started; the ambient clock stands still while motion
 * is paused. With frames on demand, it asks for the next one until the build and the
 * highlights have settled.
 */
function Ticker({ clock, focus, started, reduce, active }: TickerProps) {
  useFrame((state, delta) => {
    const dt = Math.min(delta, MAX_STEP);
    if (reduce) clock.t = CHOREO_END;
    else if (started) {
      clock.t += dt;
      if (!getMotionPaused()) clock.amb += dt;
    }
    const k = reduce ? 1 : 1 - Math.exp(-DAMP * dt);
    let easing = false;
    for (let i = 0; i < CITIES.length; i++) {
      const on = CITIES[i].name === active ? 1 : 0;
      const dim = active !== null && !on ? 1 : 0;
      const f = focus[i];
      f.on += (on - f.on) * k;
      f.dim += (dim - f.dim) * k;
      if (Math.abs(on - f.on) + Math.abs(dim - f.dim) > SETTLED) easing = true;
    }
    if (easing || (started && clock.t < CHOREO_END)) state.invalidate();
  });
  return null;
}

function Scene({ active, onHover, onSelect, furniture, started, reduce, lowEnd }: SceneProps) {
  // ponytail: per-frame scene state is mutated in place (like a ref) — never React state.
  const clock = useMemo<TwinClock>(() => ({ t: 0, amb: 0 }), []);
  const focus = useMemo<Focus>(() => CITIES.map(() => ({ on: 0, dim: 0 })), []);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const view = useMemo(() => frameView(aspect), [aspect]);
  // On-demand frames (reduced motion, paused, before the sequence starts) still need to show a new highlight.
  useEffect(() => invalidate(), [invalidate, active, started, reduce]);

  return (
    <>
      <Ticker clock={clock} focus={focus} started={started} reduce={reduce} active={active} />
      <CameraRig clock={clock} reduce={reduce} view={view} />
      <Land clock={clock} reduce={reduce} />
      <Network clock={clock} focus={focus} reduce={reduce} lowEnd={lowEnd} onHover={onHover} onSelect={onSelect} />
      <Tags clock={clock} focus={focus} active={active} />
      <Furniture furniture={furniture} target={view.target} />
    </>
  );
}

/**
 * Bloom, high tier only. Memoised with no props: the composer rebuilds (and leaks) its
 * effect pass whenever its children change, so hover re-renders must never reach it.
 */
const Fx = memo(function Fx() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom
        mipmapBlur
        luminanceThreshold={BLOOM.threshold}
        luminanceSmoothing={BLOOM.smoothing}
        intensity={BLOOM.intensity}
        radius={BLOOM.radius}
      />
    </EffectComposer>
  );
});

export default function BayTwin({ active, onHover, onSelect, furniture }: TwinProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const paused = useMotionPaused();
  const [{ lowEnd, dpr }] = useState(pickTier);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [started, setStarted] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  // Latch: the WebGL context is created once the map is close, never at page load.
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: NEAR_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setOnScreen(entry.isIntersecting);
        if (entry.intersectionRatio >= START_RATIO) setStarted(true);
      },
      { threshold: [0, START_RATIO] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const frameloop = !onScreen || !pageVisible ? "never" : reduce || !started || paused ? "demand" : "always";

  return (
    <div ref={ref} className="absolute inset-0">
      {near && (
        <Canvas
          flat
          dpr={dpr}
          frameloop={frameloop}
          // The map never moves inside its box, so skip re-measuring after every scroll.
          resize={{ scroll: false }}
          camera={{ fov: FOV, near: 0.5, far: 200, position: [0, 14, 24] }}
          // High tier: the bloom composer's multisampling does the antialiasing.
          gl={{ antialias: lowEnd, powerPreference: "high-performance" }}
          onPointerMissed={() => onSelect(null)}
        >
          <color attach="background" args={[TWIN_COLORS.void]} />
          <fog attach="fog" args={[TWIN_COLORS.void, 20, 40]} />
          <Warm />
          <Scene
            active={active}
            onHover={onHover}
            onSelect={onSelect}
            furniture={furniture}
            started={started}
            reduce={reduce}
            lowEnd={lowEnd}
          />
          {!lowEnd && <Fx />}
        </Canvas>
      )}
    </div>
  );
}
