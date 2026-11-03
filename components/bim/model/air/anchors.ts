/**
 * Card anchors for the air-side model — one representative of each new element,
 * for the mid-screen BIM element cards. Pure data (no THREE / React).
 *
 *   at      model point the card's leader line lands on (metres, geometry.ts axes)
 *   window  story span to show the card: opens once the element is in place,
 *           closes at the end of its STORY window (never under 0.02 long)
 *
 * Representatives sit on L3, the floor the camera flies through. Labels are
 * illustrative presentation names — no sizes or capacities are claimed.
 */
import { ROOF_FANS, ROOF_Y, SHAFT, SUPPLY, supplyY, type V3 } from "../../geometry";
import { STORY } from "../../timeline";
import {
  DROPS,
  DROP_LEN,
  MAIN_H,
  TRANSITIONS,
  VAV,
  W_FD_SUPPLY,
  W_ROOF_FANS,
  W_TRANSITION,
  W_VAV,
  supplyFd,
  vavAt,
  wrapMid,
} from "./layout";

export type AirAnchor = { id: string; label: string; at: V3; window: readonly [number, number] };

const L3 = 2;
const H = STORY.hvac;
const show = (from: number, to: number): readonly [number, number] => [from, Math.max(to, from + 0.02)];

const vav = vavAt(L3, SUPPLY.lateralsX[0]);
const fd = supplyFd(L3);
const drop = DROPS.find((d) => d.floor === L3)!; // lateral 0, first diffuser
const t1 = TRANSITIONS[0];
const wrap = wrapMid(L3);
const ef2 = ROOF_FANS[0];

export const AIR_ANCHORS: AirAnchor[] = [
  {
    id: "vav-L3",
    label: "VAV terminal box · L3",
    at: [vav[0], vav[1] + VAV.casing[1] / 2, vav[2] + VAV.casing[2] / 2],
    window: show(W_VAV[L3][0][1], H.vav[1]),
  },
  {
    id: "fd-L3",
    label: "Fire damper · L3 supply at the shaft",
    at: [fd[0], fd[1] + MAIN_H / 2 + 0.08, SHAFT.z1],
    window: show(W_FD_SUPPLY[L3][1], H.fittings[1]),
  },
  {
    id: "drop-L3",
    label: "Round spiral drop + flex · L3",
    at: [drop.top[0], drop.top[1] - DROP_LEN / 2, drop.top[2]],
    window: show(drop.diffuser[1], H.round[1]),
  },
  {
    id: "transition-L3",
    label: "Concentric transition · L3 supply main",
    at: [(t1.x0 + t1.x1) / 2, supplyY(L3) + MAIN_H / 2, SUPPLY.mainZ],
    window: show(W_TRANSITION[L3][0][1], H.fittings[1]),
  },
  {
    id: "wrap-L3",
    label: "Duct insulation wrap · L3 supply",
    at: wrap.at,
    window: show(wrap.t, H.wrap[1]),
  },
  {
    id: "ef-2",
    label: `${ef2.tag} · roof exhaust fan`,
    at: [ef2.x, ROOF_Y + ef2.curb + ef2.h, ef2.z],
    window: show(W_ROOF_FANS[0][1], STORY.exhaust.fans[1]),
  },
];
