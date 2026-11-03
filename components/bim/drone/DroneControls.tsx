"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { useViewer, type DronePreset } from "@/lib/viewer-state";
import type { V3 } from "../geometry";
import { bim } from "../store";
import { DRONE_LENS, PORTRAIT_LENS, droneLink } from "./link";

/** The look-at point stays near the building and above grade; polar limits keep the camera above it. */
const BOUNDS = new THREE.Box3(new THREE.Vector3(-30, 0.3, -24), new THREE.Vector3(30, 26, 26));
const DISTANCE = { min: 2, max: 170 } as const;
/** camera-controls smoothing (s): preset flights, idle damping, while dragging; reduced motion ~ none. */
const SMOOTH = { flight: 0.55, idle: 0.25, drag: 0.12, reduced: 0.0001 } as const;

type Shot = { pos: V3; target: V3; xray: number; cut: number };

/** Distance at which a box of on-screen half-size (w, h) fits the drone lens, with margin. */
function fit(halfW: number, halfH: number, aspect: number): number {
  const fov = DRONE_LENS + Math.max(0, 1 - aspect) * PORTRAIT_LENS;
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return 1.12 * Math.max(halfH / t, halfW / (t * aspect));
}

/** A camera position `dist` m from the target, at an azimuth (0 = south, 90 = east) and elevation in degrees. */
function from(target: V3, azimuth: number, elevation: number, dist: number): V3 {
  const a = THREE.MathUtils.degToRad(azimuth);
  const e = THREE.MathUtils.degToRad(elevation);
  return [target[0] + dist * Math.cos(e) * Math.sin(a), target[1] + dist * Math.sin(e), target[2] + dist * Math.cos(e) * Math.cos(a)];
}

/** The preset shots. X-ray and the section box come on where the inside has to read. */
function shot(id: DronePreset, aspect: number): Shot {
  switch (id) {
    case "aerial": {
      const t: V3 = [0, 8, 0];
      return { target: t, pos: from(t, 40, 30, fit(21, 13, aspect)), xray: 0, cut: 0 };
    }
    case "roof": {
      const t: V3 = [-0.5, 17.6, -3];
      return { target: t, pos: from(t, 25, 34, Math.min(70, fit(17.5, 6.5, aspect))), xray: 0, cut: 0 };
    }
    case "vrf": {
      // three-quarter aerial of the VRF yard; X-ray shows the refrigerant riser dropping through the floors below it
      const t: V3 = [2.8, 14.8, 2.4];
      return { target: t, pos: from(t, 32, 34, Math.min(46, fit(7.5, 6.5, aspect))), xray: 1, cut: 0 };
    }
    case "plenum":
      // L3 just under the ceiling line, looking east down the supply main — below the VAV boxes, hangers and VRF branches
      return { pos: [-7.6, 10.8, 3.6], target: [8, 11.45, 1.8], xray: 1, cut: 1 };
    case "plan": {
      // straight down, north up
      const t: V3 = [0, 4, 0.8];
      return { target: t, pos: from(t, 0, 89.9, fit(18.5, 12.5, aspect)), xray: 0, cut: 0 };
    }
    case "section": {
      const t: V3 = [0, 8.8, 0];
      return { target: t, pos: from(t, 0, 3, fit(18.5, 11, aspect)), xray: 1, cut: 1 };
    }
  }
}

function settle(c: CameraControls) {
  c.smoothTime = bim.reduced ? SMOOTH.reduced : SMOOTH.idle;
}

function fly(c: CameraControls, id: DronePreset, aspect: number) {
  const s = shot(id, aspect);
  droneLink.xray = s.xray;
  droneLink.cut = s.cut;
  const glide = !bim.reduced; // reduced motion: an instant cut
  if (glide) c.smoothTime = SMOOTH.flight;
  void c.setLookAt(s.pos[0], s.pos[1], s.pos[2], s.target[0], s.target[1], s.target[2], glide);
}

/**
 * Free flight: drei CameraControls on the stage camera — drag / one finger to
 * orbit, wheel / pinch to zoom toward the pointer, right-drag / two fingers to pan,
 * damped. It takes over exactly where the scroll camera is, then flies to a preset
 * when one is asked for (flyTo in lib/viewer-state). Mounted only in drone mode.
 */
function DroneControls({ preset, nonce }: { preset: DronePreset | null; nonce: number }) {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.minDistance = DISTANCE.min;
    c.maxDistance = DISTANCE.max;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI / 2;
    c.dollyToCursor = true;
    c.draggingSmoothTime = bim.reduced ? SMOOTH.reduced : SMOOTH.drag;
    settle(c);
    c.setBoundary(BOUNDS);
    // take the camera exactly as the scroll track left it, model state included
    void c.setLookAt(camera.position.x, camera.position.y, camera.position.z, bim.target.x, bim.target.y, bim.target.z, false);
    droneLink.xray = bim.xray;
    droneLink.cut = bim.cut;
    droneLink.controls = c;
    const onSettle = () => settle(c);
    c.addEventListener("rest", onSettle);
    c.addEventListener("controlstart", onSettle);
    return () => {
      c.removeEventListener("rest", onSettle);
      c.removeEventListener("controlstart", onSettle);
      droneLink.controls = null;
    };
  }, [camera]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !preset || nonce === droneLink.nonce) return;
    droneLink.nonce = nonce;
    fly(c, preset, aspect);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a resize must not re-fly the shot
  }, [preset, nonce]);

  return <CameraControls ref={ref} />;
}

/**
 * Mounts the drone controls while drone mode is on. Its own tiny subscriber,
 * so the memoised scene never re-renders; on-demand frames (reduced motion)
 * also repaint when the visual style or the mode changes.
 */
export default function DroneLayer() {
  const { drone, preset, presetNonce, style } = useViewer();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [drone, style, invalidate]);
  return drone ? <DroneControls preset={preset} nonce={presetNonce} /> : null;
}
