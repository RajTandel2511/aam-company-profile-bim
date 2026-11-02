import * as THREE from "three";

/**
 * Screen geometry for the site plan's furniture (TwinFurniture). Pure three.js (no React,
 * no path aliases), so geo.check.mjs runs it in Node: `node components/reach/geo.check.mjs`.
 */

/** "No crossing / not shown": every real position these return is positive. */
export const HIDDEN = -1;

export type Segment = { a: THREE.Vector3; b: THREE.Vector3 };

/** Scratch; frame callbacks run one at a time. */
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();

/** World point -> canvas px (x right, y down), written to `out`. False when it is behind the camera or past the far plane. */
export function toScreen(out: THREE.Vector3, p: THREE.Vector3, camera: THREE.Camera, w: number, h: number): boolean {
  out.copy(p).project(camera);
  const inFront = out.z > -1 && out.z < 1;
  out.set((out.x + 1) * 0.5 * w, (1 - out.y) * 0.5 * h, 0);
  return inFront;
}

/**
 * Where the screen image of a segment crosses the line x = edge (axis "x": returns its y) or
 * y = edge (axis "y": returns its x); HIDDEN if it doesn't. A straight line stays straight
 * under perspective, so its two projected ends are enough.
 */
export function crossing(s: Segment, axis: "x" | "y", edge: number, camera: THREE.Camera, w: number, h: number): number {
  if (!toScreen(pa, s.a, camera, w, h) || !toScreen(pb, s.b, camera, w, h)) return HIDDEN;
  const a0 = axis === "x" ? pa.x : pa.y;
  const a1 = axis === "x" ? pb.x : pb.y;
  if ((a0 - edge) * (a1 - edge) > 0 || a0 === a1) return HIDDEN;
  const t = (edge - a0) / (a1 - a0);
  return axis === "x" ? pa.y + t * (pb.y - pa.y) : pa.x + t * (pb.x - pa.x);
}

/** Clockwise angle on screen (degrees) from straight up to the direction `dir` points at `at`. */
export function screenAngle(at: THREE.Vector3, dir: THREE.Vector3, camera: THREE.Camera, w: number, h: number): number {
  toScreen(pa, at, camera, w, h);
  toScreen(pb, pb.copy(at).add(dir), camera, w, h);
  return (Math.atan2(pb.x - pa.x, pa.y - pb.y) * 180) / Math.PI;
}

/** Screen px per world unit, across the view, at the camera's look-at point `at`. */
export function pxPerUnit(camera: THREE.PerspectiveCamera, at: THREE.Vector3, h: number): number {
  return h / (2 * camera.position.distanceTo(at) * Math.tan((camera.fov * Math.PI) / 360));
}
