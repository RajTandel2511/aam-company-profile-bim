"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence } from "motion/react";
import { motionConfig } from "@/lib/motion-config";
import { useViewer } from "@/lib/viewer-state";
import DroneHud from "./drone/DroneHud";
import Scene from "./Scene";
import { bim } from "./store";

const LABEL =
  "Illustrative 3D model of a typical four-storey commercial building. It assembles from the column grid up, then " +
  "each trade goes in as you scroll: architectural sheet metal on the walls and roof edge, a rooftop HVAC unit with " +
  "insulated supply and return ducts, fittings, dampers, VAV boxes and round drops to the diffusers on every floor, " +
  "a VRF system with three rooftop condensing units, refrigerant piping and ceiling cassettes on each floor plus a " +
  "ductless split, restroom exhaust with rooftop fans and an outside-air hood, EMS controls wired to sensors on each " +
  "floor, and preventative-maintenance checks on the equipment.";

/** Total rendered pixels we allow at the top tier (DPR is capped by this, not just by the ratio). */
const PIXEL_BUDGET = 2.6e6;
const DPR = { min: 1, max: 1.75, low: 1.5, step: 0.25 };
/** Keep rendering this long after leaving drone mode, so the glide back and the story rewind finish even off-screen. */
const LANDING_MS = 2200;

/** Decide quality and motion once, before the canvas is created (it reads them at mount). */
function configure() {
  bim.reduced = motionConfig.prefersReduced();
  bim.quality = motionConfig.isLowEnd() || window.innerWidth < 768 ? "low" : "high";
  if (bim.reduced) {
    bim.intro = 1;
    bim.story = bim.storyTarget = 1;
    bim.hero = bim.heroTarget = 1;
  }
}

function budgetDpr(high: boolean) {
  const byPixels = Math.sqrt(PIXEL_BUDGET / Math.max(1, window.innerWidth * window.innerHeight));
  const cap = Math.min(high ? DPR.max : DPR.low, window.devicePixelRatio || 1);
  return Math.max(DPR.min, Math.min(cap, byPixels));
}

/**
 * The fixed WebGL stage behind the hero and the systems story. It renders only
 * while one of those sections is on screen; everything after the story scrolls
 * over it on opaque backgrounds. In drone view it rises above the page as a
 * fullscreen viewport (page scroll locked, pointer flight, the HUD dialog on top).
 */
export default function BimStage() {
  const configured = useRef(false);
  if (!configured.current) {
    configure();
    configured.current = true;
  }
  const high = bim.quality === "high" && !bim.reduced;
  const { drone } = useViewer();
  const [active, setActive] = useState(true);
  const [landing, setLanding] = useState(false);
  const [ready, setReady] = useState(false);
  const [dpr, setDpr] = useState(() => budgetDpr(high));

  // Render only while the hero or the story is on screen.
  useEffect(() => {
    const els = ["hero", "systems"].map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      setActive([...seen.values()].some(Boolean));
    });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Drone view locks the page (Lenis follows body overflow); leaving it keeps frames coming until the camera has landed.
  const flown = useRef(false);
  useEffect(() => {
    if (drone) {
      flown.current = true;
      const body = document.body;
      const prev = body.style.overflow;
      body.style.overflow = "hidden";
      return () => {
        body.style.overflow = prev;
      };
    }
    if (!flown.current) return;
    setLanding(true);
    const t = setTimeout(() => setLanding(false), LANDING_MS);
    return () => clearTimeout(t);
  }, [drone]);

  // Pointer parallax (fine pointers only).
  useEffect(() => {
    if (bim.reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      bim.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      bim.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  // Stable callbacks, so the memoised scene below never re-renders.
  const onReady = useCallback(() => {
    bim.stageReady = true;
    setReady(true);
  }, []);
  const ceiling = useMemo(() => budgetDpr(high), [high]);
  const onDecline = useCallback(() => setDpr((d) => Math.max(DPR.min, d - DPR.step)), []);
  const onIncline = useCallback(() => setDpr((d) => Math.min(ceiling, d + DPR.step)), [ceiling]);

  // Visibility / DPR / drone changes re-render this wrapper, never the R3F tree (and never the composer).
  const scene = useMemo(
    () => <Scene postFx={high} onReady={onReady} onDecline={onDecline} onIncline={onIncline} />,
    [high, onReady, onDecline, onIncline],
  );
  const live = drone || landing;
  const frameloop = live ? "always" : bim.reduced ? "demand" : active ? "always" : "never";

  return (
    <div
      data-lenis-prevent={drone ? "" : undefined}
      className={`fixed inset-0 ${drone ? "z-[60] bg-void" : "pointer-events-none z-0"}`}
      style={{ visibility: active || live ? "visible" : "hidden" }}
    >
      <div role="img" aria-label={LABEL} className="absolute inset-0 transition-opacity duration-1000 ease-out" style={{ opacity: ready ? 1 : 0 }}>
        <Canvas
          dpr={dpr}
          frameloop={frameloop}
          // the post-processing composer multisamples on its own target, so the default buffer doesn't need MSAA
          gl={{ antialias: !high, alpha: false, stencil: false, powerPreference: "high-performance" }}
          camera={{ fov: 30, near: 0.5, far: 700, position: [62, 34, 74] }}
          style={{ pointerEvents: drone ? "auto" : "none" }}
          onCreated={({ gl }) => {
            gl.localClippingEnabled = true;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
          }}
        >
          {scene}
        </Canvas>
      </div>
      <AnimatePresence>{drone && <DroneHud key="drone-hud" />}</AnimatePresence>
    </div>
  );
}
