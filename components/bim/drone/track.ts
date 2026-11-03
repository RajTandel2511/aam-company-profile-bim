import * as THREE from "three";
import type { V3 } from "../geometry";

/**
 * The scroll drone track: camera keyframes over story progress (bim.story 0..1),
 * one or more per beat. Positions and look-at targets each ride a centripetal
 * Catmull-Rom spline (built once). Story progress maps to arc length along each
 * spline through a monotone cubic — so the camera never parks between beats: it
 * eases into close shots, accelerates through the long hops and keeps moving.
 *
 * Self-contained (THREE only, type-only imports) so `node components/bim/drone/track.check.mjs`
 * can fly it under plain Node. Metres · +X east · +Y up · +Z south (geometry.ts).
 * Keys are timed to the CHAPTERS / STORY windows in timeline.ts (noted per beat); the
 * check reads the live timeline, so re-time these whenever those windows move.
 * While an element's card is up the target sits on the element (CameraRig's wide-screen
 * view offset puts the target right of centre, clear of the story panel) and the move is slow;
 * the check's FOCUS table lists (and asserts) each of those holds.
 */

type Key = readonly [s: number, pos: V3, target: V3];

export const KEYS: readonly Key[] = [
  // 00 model [0, 0.08] — from the aerial down to a low hero three-quarter, looking up at the building
  [0.0, [46, 44, 56], [0, 9, 0]],
  [0.04, [48, 19, 40], [1, 9.5, 0]],
  [0.08, [33, 3.4, 33], [3, 10.5, 1]],

  // 01 sheet metal [0.08, 0.2] — chase the coping crews off the SE corner and up the east parapet (coping 0.1–0.14),
  // pull out across the east-wall cladding and its downspouts (gutters 0.135–0.18), down to the canopy (0.15–0.19)
  [0.093, [28, 11, 27], [11, 15, 6]],
  [0.1055, [22.8, 20.6, 15.2], [16.2, 17.6, 6.0]],
  [0.1187, [23.4, 20.2, 0.8], [16.2, 17.4, -7.2]],
  [0.1395, [29, 18, 1.5], [16.4, 15.6, -4]],
  [0.1525, [38.5, 9.5, 5.5], [16.4, 9.5, -1]],
  [0.1675, [32, 6.5, 22], [14.5, 6.8, 3.0]],
  [0.1865, [17, 4.4, 27], [5, 4.3, 11.5]],
  [0.1975, [25, 15, 33], [1, 9.5, 1]],

  // 02 HVAC [0.2, 0.37] — crane down over RTU-1 as it lands (rtu 0.215–0.255, touchdown ~0.246) and hold while the rig
  // climbs away; the trunks drop down the shaft (0.245–0.28); into L3 from the south-east just under the ceiling line
  // (X-ray + section box on from 0.245) and west along the supply main toward the shaft — the main extruding toward the
  // camera (L3 0.28–0.30), its fire damper at the shaft ahead (fittings), round drops and the wrapped main on the right
  // (0.31–0.37) — below every duct, hanger and VRF branch; pull back along the view and out to a section of every floor
  [0.2095, [7, 34, 23], [-6.5, 17.5, -2]],
  [0.2257, [-4.6, 38, 6], [-9.3, 18.4, -2]],
  [0.2452, [-7.6, 30, 1.8], [-9.3, 17.9, -2]],
  [0.2575, [-7.2, 27.8, 4.6], [-9.1, 17.6, -2]],
  [0.268, [-2, 24, 18], [-8.5, 14.5, -1.0]],
  [0.2795, [14, 13.4, 16], [2, 11.6, 3.0]],
  [0.2895, [13.4, 10.8, 7.8], [2.0, 11.4, 3.2]],
  [0.3, [11.2, 10.65, 6.0], [0, 11.45, 2.2]],
  [0.312, [8.4, 10.6, 5.7], [-4.2, 11.5, 1.6]],
  [0.324, [6.2, 10.6, 5.6], [-5.2, 11.55, 1.6]],
  [0.336, [4.25, 10.6, 7.45], [-5.0, 11.5, 2.0]],
  [0.348, [2.2, 10.6, 6.2], [-3.4, 11.4, 2.8]],
  [0.3595, [6.5, 11.0, 8.8], [-3.0, 11.3, 3.0]],
  [0.3705, [14, 14.5, 22], [0, 10, 1]],

  // 03 VRF [0.37, 0.5] — a low arc round the yard, south-east to east, as the three modules are craned in (units
  // 0.38–0.415; never over a lift); across the roof to the riser head and down beside the refrigerant pairs through L4
  // (piping 0.405–0.45) to L3's branch selector box (boxes 0.425–0.455); south-east under the main and beneath a 4-way
  // cassette, holding on the next one down the row (indoor 0.44–0.485), then west past it under the ceiling to the
  // ductless wall split on the core face (split 0.455–0.485) — push in, pull back along the view — and out south
  [0.3825, [12.6, 21.4, 15.8], [3.5, 17.6, 5.2]],
  [0.397, [13.8, 21.0, 10.8], [3.45, 17.6, 5.05]],
  [0.4155, [13.4, 20.6, 5.4], [3.4, 17.6, 4.6]],
  [0.4255, [6.4, 19.6, -1.9], [1.0, 17.0, -1.0]],
  [0.4315, [4.6, 17.6, -2.4], [1.0, 16.0, -1.0]],
  [0.437, [4.6, 14.2, -2.4], [1.3, 13.0, -1.0]],
  [0.444, [4.6, 11.62, -2.4], [1.9, 11.58, -1.0]],
  [0.4505, [4.2, 11.5, -1.9], [1.8, 11.55, -0.85]],
  [0.4575, [6.4, 10.65, 1.6], [-4.4, 11.2, 4.6]],
  [0.463, [9.2, 10.45, 4.8], [1.1, 11.25, 6.0]],
  [0.4685, [7.6, 10.45, 5.3], [0.9, 11.25, 5.95]],
  [0.479, [2.8, 10.5, 5.0], [-11.6, 10.95, 1.0]],
  [0.4835, [-1.0, 10.5, 4.0], [-11.9, 10.95, 0.75]],
  [0.4895, [-5.6, 10.45, 2.6], [-12.08, 10.95, 0.6]],
  [0.4955, [-0.5, 10.6, 4.2], [-11.9, 10.9, 0.75]],
  [0.504, [1.0, 11.2, 12.0], [-9.0, 10.6, 2.6]],
  [0.5145, [6.0, 12.6, 24], [-3.0, 10.4, 0.6]],

  // 04 exhaust & outside air [0.5, 0.62] — the north-east riser climbing (riser 0.51–0.54); a slow arc round EF-1 from the
  // east as it drops in and its plume starts (fan 0.54–0.57, run 0.575); west, low over EF-3 / EF-2 (fans 0.55–0.58), to
  // the finished OA hood as its intake starts (oa 0.56–0.595)
  [0.5245, [18, 12.5, 30], [10.5, 9.5, -5]],
  [0.5355, [30, 13.5, 10], [14, 11, -7.6]],
  [0.5485, [23.0, 19.2, -6.6], [14, 18.0, -8.4]],
  [0.561, [22.4, 18.9, -4.2], [14, 18.2, -8.4]],
  [0.575, [20.4, 19.6, -2.8], [14, 18.6, -8.4]],
  [0.5875, [17.0, 19.4, -3.4], [9.4, 17.2, -5.4]],
  [0.5935, [13.6, 19.6, -3.8], [8.2, 17.3, -5.0]],
  [0.606, [5.0, 21.4, -3.4], [-6.0, 18.4, -1.8]],
  [0.6175, [0.0, 21.2, -4.6], [-6.5, 17.6, -2.2]],
  [0.6265, [-1.6, 19.6, -10.2], [-9.4, 9.8, -3.8]],

  // 05 controls [0.62, 0.74] — a drop outside the north glass looking down the riser at EMS-1 as it powers on (panel
  // 0.63–0.65) while the riser climbs to meet the camera (0.645–0.67), in between the transoms to EMS-1 as the lines
  // branch out (0.66–0.705), out along L1
  [0.633, [-3.5, 17.5, -17.0], [-11.6, 2.8, -5.2]],
  [0.6456, [-5.4, 13.8, -15.6], [-11.6, 4.2, -5.2]],
  [0.6616, [-6.6, 9.0, -14.6], [-11.8, 3.6, -5.2]],
  [0.6768, [-7.0, 5.2, -13.8], [-11.95, 2.6, -5.2]],
  [0.689, [-7.0, 3.0, -9.9], [-12, 1.9, -5.2]],
  [0.701, [-7.4, 2.15, -6.2], [-12.05, 1.65, -5.2]],
  [0.7085, [-7.2, 2.1, -5.5], [-12.0, 1.7, -5.15]],
  [0.7215, [-5.6, 2.6, -1.0], [-12.2, 3.6, -5.6]],
  [0.734, [-2.6, 2.9, 12.6], [-9.6, 5.8, -6.0]],
  [0.7415, [4, 8, 28], [-4, 8, -3]],

  // 06 maintenance [0.74, 0.88] — quick inspection hops on the three STORY.maintenance.stops: RTU-1, EF-1, EMS-1
  [0.749, [3.5, 17, 22], [-6.5, 16.5, -2]],
  [0.7603, [-2.2, 22.6, 6.2], [-9.3, 17.9, -2]],
  [0.7821, [-5.2, 22.2, 7.8], [-9.3, 17.8, -2]],
  [0.7961, [16.8, 20.6, -1.0], [14, 17.6, -8.4]],
  [0.8136, [18.6, 20.2, -3.0], [14, 17.5, -8.4]],
  [0.8265, [23, 13.5, 15], [2.5, 5.5, -1.5]],
  [0.8399, [-6.6, 2.7, 12.8], [-12, 1.8, -5.2]],
  [0.8583, [-8.0, 2.3, 4.4], [-12.05, 1.65, -5.2]],
  [0.872, [-5.5, 5.5, 18], [-6.5, 8.5, -2]],

  // 07 finale [0.88, 1] — rise to a wide aerial, ending on a top-down plan that turns as it settles
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

/** A spline plus its story -> arc-length timing, landing on every key at its story value. */
function rail(points: readonly V3[]) {
  const curve = spline(points);
  curve.arcLengthDivisions = DIVISIONS * (KEYS.length - 1);
  const lengths = curve.getLengths();
  const total = lengths[lengths.length - 1];
  const timing = monotone(
    KEYS.map((k) => k[0]),
    KEYS.map((_, i) => (total > 0 ? lengths[i * DIVISIONS] / total : 0)),
  );
  return { curve, total, timing };
}

/**
 * Camera and target each ride their own rail by arc length. Riding the camera's spline parameter instead
 * jerked the gaze wherever a span's target swing was far longer than its camera move (the target's speed
 * jumped at the key); on its own timing the target's speed stays smooth through every key.
 */
const POS = rail(KEYS.map((k) => k[1]));
const TGT = rail(KEYS.map((k) => k[2]));
const unit = (v: number) => Math.min(1, Math.max(0, v));

/** Camera position and look-at target on the track at story progress s. No allocation. */
export function sampleTrack(s: number, pos: THREE.Vector3, target: THREE.Vector3): void {
  POS.curve.getPoint(POS.curve.getUtoTmapping(0, unit(POS.timing(s)) * POS.total), pos); // by arc distance (0 falls back to u = 0)
  TGT.curve.getPoint(TGT.curve.getUtoTmapping(0, unit(TGT.timing(s)) * TGT.total), target);
}
