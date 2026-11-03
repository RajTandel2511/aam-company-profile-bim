import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Static geometry helpers for the air-side parts (re-exported by parts.tsx).
 * THREE only, no React — so shapes.check.mjs can build the shapes under Node.
 */

export const box = (sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
export const cylinder = (r: number, h: number, x = 0, y = 0, z = 0) =>
  new THREE.CylinderGeometry(r, r, h, 32).translate(x, y, z);
/** Flat disc facing up. */
export const disc = (r: number, x = 0, y = 0, z = 0) =>
  new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2).translate(x, y, z);

/** Merges parts into one geometry (one draw call) and disposes the parts. Extruded (non-indexed) parts mix with indexed ones. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.some((p) => !p.index) ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts;
  const out = mergeGeometries(flat);
  for (const p of new Set([...parts, ...flat])) p.dispose();
  if (!out) throw new Error("merge: parts have mismatched attributes");
  return out;
}

/** BIM linework: the parts' hard edges merged into one LineSegments geometry. */
export function outline(parts: THREE.BufferGeometry[], angle = 30): THREE.BufferGeometry {
  return merge(
    parts.map((p) => {
      const e = new THREE.EdgesGeometry(p, angle);
      p.dispose();
      return e;
    }),
  );
}
