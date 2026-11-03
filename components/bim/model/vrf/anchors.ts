import { CHAPTERS } from "../../timeline";
import { LEVELS, ROOF_Y, SPLIT, VRF, cassetteAt, vrfBoxAt, type V3 } from "../../geometry";
import { W, cassetteWin, sub } from "./schedule";

/**
 * Card anchors for the element-card builder: one per VRF element worth a
 * mid-screen card. `at` is a model point on the element (metres); `window` is
 * the story span the card is live — it opens once the element has built and
 * closes as the flow moves on. Labels are illustrative presentation marks, no
 * specs or capacities.
 */
export type VrfAnchor = { id: string; label: string; at: V3; window: readonly [number, number] };

const CHAPTER_END = CHAPTERS.find((c) => c.id === "vrf")?.range[1] ?? 1;
/** the roof membrane the split condenser stand sits on (Structure's MEMBRANE_T) */
const ROOF_TOP = ROOF_Y + 0.06;
const L3 = 2;
/** the L3 cassette that gets a card: south row, nearest the riser */
const CAS = 1;
const box = vrfBoxAt(L3);
const cas = cassetteAt(L3, CAS);
const C = SPLIT.condenser;

export const VRF_ANCHORS: readonly VrfAnchor[] = [
  {
    id: "VRF-CU-2",
    label: "VRF heat-recovery condensing units · CU-1…3",
    at: [VRF.modulesX[1], ROOF_Y + VRF.rail + VRF.h, VRF.z],
    window: [W.modules[1][1], W.roof[1]],
  },
  {
    id: "RF-R1",
    label: "Refrigerant riser · liquid, suction + discharge",
    at: [VRF.riserX, LEVELS[3].y + 1.8, VRF.riserZ],
    window: W.riser,
  },
  {
    id: "BS-3",
    label: "Branch selector box · L3",
    at: [box[0], box[1] + VRF.box.h / 2, box[2]],
    window: [sub(W.boxes[L3], 0.5, 1)[0], W.indoor[L3][0]],
  },
  {
    id: "CAS-3.2",
    label: "4-way ceiling cassette · L3",
    at: [cas[0], cas[1] + VRF.cassette.h, cas[2]],
    window: [cassetteWin(L3, CAS)[1], cassetteWin(L3, CAS)[1] + (W.indoor[L3][1] - W.indoor[L3][0])],
  },
  {
    id: "DS-1",
    label: "Ductless wall split · L3 tech room",
    at: [SPLIT.wall.x + SPLIT.wall.d / 2, SPLIT.wall.y + SPLIT.wall.h / 2, SPLIT.wall.z],
    window: [W.wall[1], W.lineSet[1]],
  },
  {
    id: "DS-CU-1",
    label: "Split condenser · roof",
    at: [C.x, ROOF_TOP + C.stand + C.h, C.z],
    window: [W.lineSet[1], CHAPTER_END],
  },
];
