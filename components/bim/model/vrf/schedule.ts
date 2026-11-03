import { FLOORS, VRF } from "../../geometry";
import { STORY, stagger, type Window } from "../../timeline";

/**
 * When each piece of the VRF chapter builds — every window derived from
 * STORY.vrf, never a hard-coded story number. Pure (no THREE / React), so
 * plan.ts, anchors.ts and the self-check can all share it.
 */

export const H = STORY.vrf;
export const FLOOR_IDS = Array.from({ length: FLOORS }, (_, i) => i);
export const CASSETTES = VRF.cassettes.length;

/** Sub-window [a, b] (fractions) of window w. */
export const sub = (w: Window, a: number, b: number): Window => [w[0] + (w[1] - w[0]) * a, w[0] + (w[1] - w[0]) * b];

/** Floors build top-down, chasing the riser as it drops from the roof. */
const order = (i: number) => FLOORS - 1 - i;

export const W = {
  /** steel rail frame grows up off the roof before the first lift */
  rails: sub(H.units, 0, 0.16),
  /** the three modules, craned in one after another */
  modules: [0, 1, 2].map((m) => stagger(sub(H.units, 0.06, 0.72), m, 3, 0.45)),
  /** the split condenser is the last lift */
  condenser: sub(H.units, 0.58, 1),
  /** service stubs out of every module front */
  stubs: sub(H.piping, 0, 0.12),
  /** header west along the yard, north on sleepers to the riser head */
  roof: sub(H.piping, 0.08, 0.3),
  /** the riser drops at constant speed (linear), so floor tees know when it passes */
  riser: sub(H.piping, 0.28, 0.52),
  /** story span of a floor feed, riser tee -> branch selector box */
  feedSpan: (H.piping[1] - H.piping[0]) * 0.1,
  /** branch selector box -> cassette pairs, per floor */
  pairs: FLOOR_IDS.map((i) => stagger(sub(H.piping, 0.5, 1), order(i), FLOORS)),
  boxes: FLOOR_IDS.map((i) => stagger(H.boxes, order(i), FLOORS)),
  indoor: FLOOR_IDS.map((i) => stagger(H.indoor, order(i), FLOORS)),
  /** wall split grows out of the core wall, then its line set climbs to the roof */
  wall: sub(H.split, 0, 0.35),
  lineSet: sub(H.split, 0.25, 0.95),
} as const;

/** Cassette k on floor i: hanger rods drop, then the unit lifts into the ceiling. */
export const cassetteWin = (i: number, k: number): Window => stagger(W.indoor[i], k, CASSETTES, 0.6);
