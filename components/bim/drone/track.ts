import * as THREE from "three";
import type { V3 } from "../geometry";

/**
 * The scroll drone track: camera keyframes over story progress (bim.story 0..1),
 * one or more per beat. Positions and look-at targets each ride a centripetal
 * Catmull-Rom spline (built once). Story progress maps to arc length along the
 * position spline through a monotone cubic, and the target rides the same spline
 * parameter — so the camera never parks between beats: it eases into close shots,
 * accelerates through the long hops and keeps moving.
 *
 * Self-contained (THREE only, type-only imports) so `node components/bim/drone/track.check.mjs`
 * can fly it under plain Node. Metres · +X east · +Y up · +Z south (geometry.ts).
 * Story windows referenced below live in timeline.ts.
 */

type Key = readonly [s: number, pos: V3, target: V3];

export const KEYS: readonly Key[] = [
  // 00 model — from the aerial down to a low hero three-quarter, looking up at the building
  [0.0, [46, 44, 56], [0, 9, 0]],
  [0.05, [48, 19, 40], [1, 9.5, 0]],
  [0.1, [33, 3.4, 33], [3, 10.5, 1]],

  // 01 sheet metal — chase the coping crew up the east parapet, pull out across the east-wall cladding, down to the canopy
  [0.114, [28, 11, 27], [11, 15, 6]],
  [0.126, [21.5, 19.6, 13.5], [16.2, 17.6, 6.5]],
  [0.141, [21.6, 19.3, -1.0], [16.2, 17.4, -7.0]],
  [0.159, [30, 14.5, 0.5], [16.4, 10.5, -4]],
  [0.178, [42, 8, 4], [16.4, 8.5, -1]],
  [0.199, [27, 5.5, 30], [8, 3.6, 11.5]],
  [0.222, [17, 4.4, 27], [5, 4.3, 11.5]],
  [0.245, [32, 21, 42], [0, 10, 0]],

  // 02 HVAC — crane down over RTU-1 as it lands (touchdown ~0.305), swing down into the L3 ceiling plenum and fly the
  // supply main just under the slab (section box and X-ray are on from 0.3), then back out to a section of every floor
  [0.262, [10, 36, 25], [-6.5, 17.5, -2]],
  [0.282, [-4.6, 38, 6], [-9.3, 18.4, -2]],
  [0.304, [-7.6, 30, 1.8], [-9.3, 17.9, -2]],
  [0.326, [-4.5, 22, 11], [-4.5, 13, 0]],
  [0.341, [-9.8, 13.6, 13.5], [-2, 11.8, 2.4]],
  [0.353, [-8.8, 12.07, 8.2], [2.5, 11.7, 2.1]],
  [0.365, [-5.2, 12.07, 3.15], [7.5, 11.65, 1.7]],
  [0.377, [0.0, 12.07, 2.95], [12.5, 11.6, 1.6]],
  [0.388, [4.6, 12.07, 2.9], [15.5, 11.45, 1.5]],
  [0.4, [8.6, 12.08, 6.6], [16.5, 10.8, 1.0]],
  [0.416, [12.5, 12.15, 20], [16, 9.8, -2]],
  [0.432, [3.5, 10, 62], [1, 9, 0]],

  // 03 exhaust & outside air — the north-east riser, a low orbit of EF-1 looking up its plume, back and over to the OA hood
  [0.446, [22, 11, 44], [10, 9, -4]],
  [0.466, [35, 12.5, 12], [13, 10, -7]],
  [0.486, [25.5, 18.6, -1.5], [14, 18.3, -8.4]],
  [0.503, [19.8, 18.15, -8.0], [14, 19.0, -8.4]],
  [0.52, [17.8, 18.3, -14.2], [14, 20.4, -8.4]],
  [0.537, [11.0, 18.45, -14.8], [13.6, 20.8, -8.4]],
  [0.556, [6, 24, -27], [2, 18.6, -5]],
  [0.58, [-1.5, 22, -8.6], [-6.4, 18.2, -2.1]],

  // 04 controls — a vertical drop down the riser outside the north glass, in between the transoms to EMS-1, out along L1
  [0.596, [-6, 23.5, -12.5], [-11.95, 17, -5.2]],
  [0.612, [-7.4, 18, -13.6], [-11.95, 15.4, -5.2]],
  [0.632, [-7.2, 11.5, -13.8], [-11.95, 9.6, -5.2]],
  [0.651, [-7.0, 5.2, -13.8], [-11.95, 3.4, -5.2]],
  [0.667, [-6.95, 3.2, -9.8], [-12, 1.9, -5.2]],
  [0.684, [-7.3, 2.2, -5.55], [-12.05, 1.65, -5.2]],
  [0.706, [-4.0, 2.4, 2.6], [-9, 4.5, -4.2]],
  [0.72, [-2.2, 3.2, 14], [-5.5, 6.5, -3]],
  [0.731, [6, 9, 34], [-4, 8, -3]],

  // 05 maintenance — quick inspection hops on the three SERVICE_STOPS windows: RTU-1, EF-1, EMS-1
  [0.744, [3.5, 17, 22], [-6.5, 16.5, -2]],
  [0.756, [-2.2, 22.6, 6.2], [-9.3, 17.9, -2]],
  [0.781, [-5.2, 22.2, 7.8], [-9.3, 17.8, -2]],
  [0.797, [16.8, 20.6, -1.0], [14, 17.6, -8.4]],
  [0.817, [19.7, 19.9, -5.0], [14, 17.5, -8.4]],
  [0.832, [26, 14, 12], [4, 6, -1]],
  [0.847, [-6.6, 3.3, 12.8], [-12, 1.8, -5.2]],
  [0.868, [-8.0, 2.6, 4.4], [-12.05, 1.65, -5.2]],
  [0.882, [-5.5, 5.5, 18], [-6.5, 8.5, -2]],

  // 06 finale — rise to a wide aerial, ending on a top-down plan that turns as it settles
  [0.9, [8, 20, 48], [0, 9, 0]],
  [0.925, [46, 48, 56], [0, 8, 0]],
  [0.955, [20, 72, 22], [0, 5, 0]],
  [0.978, [2.4, 74, 5.0], [0, 4, 0]],
  [1.0, [-2.2, 74, 4.9], [0, 4, 0]],
];

/** Arc-length samples per key-to-key span. */
const DIVISIONS = 48;

/**
 * Monotone cubic through (xs, ys) — Fritsch–Carlson tangents (weighted harmonic
 * mean, as in PCHIP), flat at both ends so the track eases in and out. Never
 * overshoots, so the camera never backs up along the rail.
 */
export function monotone(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi);
  const m = xs.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const a = d[i - 1];
    const b = d[i];
    if (a <= 0 || b <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  return (x: number) => {
    const v = Math.min(xs[n - 1], Math.max(xs[0], x));
    let i = 0;
    while (i < n - 2 && v > xs[i + 1]) i++;
    const t = (v - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (3 * t2 - 2 * t3) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

const spline = (points: readonly V3[]) =>
  new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, "centripetal");

const POS = spline(KEYS.map((k) => k[1]));
POS.arcLengthDivisions = DIVISIONS * (KEYS.length - 1);
const LENGTHS = POS.getLengths();
const TOTAL = LENGTHS[LENGTHS.length - 1];
/** story -> arc length along the position spline (as a fraction), landing on every key at its story value */
const TIMING = monotone(
  KEYS.map((k) => k[0]),
  KEYS.map((_, i) => LENGTHS[i * DIVISIONS] / TOTAL),
);
/** The target rides the position's spline parameter, so the two never drift apart between keys (no swinging gaze). */
const TGT = spline(KEYS.map((k) => k[2]));
const unit = (v: number) => Math.min(1, Math.max(0, v));

/** Camera position and look-at target on the track at story progress s. No allocation. */
export function sampleTrack(s: number, pos: THREE.Vector3, target: THREE.Vector3): void {
  const t = POS.getUtoTmapping(0, unit(TIMING(s)) * TOTAL); // by arc distance (0 falls back to u = 0)
  POS.getPoint(t, pos);
  TGT.getPoint(t, target);
}
