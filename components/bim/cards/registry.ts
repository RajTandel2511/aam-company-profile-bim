import {
  CLAD_X,
  CURTAIN_Z,
  DUCT,
  OA,
  PARAPET,
  ROOF_Y,
  RTU,
  RTU_BASE,
  SERVICE_STOPS,
  SLAB,
  sensorRoutes,
  supplyMain,
  type V3,
} from "../geometry";
import { AIR_ANCHORS } from "../model/air/anchors";
import { VRF_ANCHORS } from "../model/vrf/anchors";
import { CHAPTERS, STORY, type ChapterId, type Window } from "../timeline";

/**
 * The mid-screen BIM element cards: what each card says, which model point its
 * leader lands on, and when it shows. Every window derives from STORY (or from
 * the air / VRF builders' anchor windows, which open once their element is in
 * place), so a re-timed story carries the cards with it. Values on a card are
 * illustrative presentation labels, never specifications.
 *
 * Pure data (no THREE / React), so cards.check.mjs can load it under plain Node.
 */

/** One element a card can point at: a model point and the story span it is in shot (the builders' anchor shape). */
export type Anchor = { id: string; label: string; at: V3; window: Window };

export type System = "model" | "sheetmetal" | "supply" | "ret" | "exhaust" | "controls" | "refrigerant" | "maintenance";

export type Icon =
  | "building"
  | "coping"
  | "panels"
  | "rtu"
  | "damper"
  | "round"
  | "wrap"
  | "condenser"
  | "selector"
  | "cassette"
  | "split"
  | "fan"
  | "hood"
  | "ems"
  | "sensor"
  | "service"
  | "check";

export type CardSpec = {
  id: string;
  /** mono mark, e.g. "RTU-1" */
  mark: string;
  /** type line, e.g. "Packaged rooftop unit" */
  type: string;
  category: string;
  system: System;
  icon: Icon;
  /** 2-3 property rows; values are illustrative */
  rows: readonly (readonly [key: string, value: string])[];
  /** status chip before / after doneAt (story progress) */
  status: readonly [doing: string, done: string];
  doneAt: number;
  at: V3;
  /**
   * Linear elements (coping, cladding, duct wrap): the leader slides along this polyline
   * to the point nearest the camera's look-at target, so the dot lands where the shot is.
   */
  path?: readonly V3[];
  /** visible over this story window (fading in and out at its ends) */
  show: Window;
};

/** The model point card c's leader lands on this frame, written into `out` (no allocation). */
export function anchorAt(c: CardSpec, tx: number, ty: number, tz: number, out: { x: number; y: number; z: number }) {
  const p = c.path;
  out.x = c.at[0];
  out.y = c.at[1];
  out.z = c.at[2];
  if (!p) return out;
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len2 = dx * dx + dy * dy + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((tx - a[0]) * dx + (ty - a[1]) * dy + (tz - a[2]) * dz) / len2)) : 0;
    const x = a[0] + dx * t;
    const y = a[1] + dy * t;
    const z = a[2] + dz * t;
    const d = (x - tx) ** 2 + (y - ty) ** 2 + (z - tz) ** 2;
    if (d < best) {
      best = d;
      out.x = x;
      out.y = y;
      out.z = z;
    }
  }
  return out;
}

/** A card is up for at least this much story, so it can be read. */
export const MIN_SPAN = 0.021;
/** A card ends this far before the card two places after it starts. */
const HANDOFF = 0.001;

const SM = STORY.sheetmetal;
const H = STORY.hvac;
const X = STORY.exhaust;
const C = STORY.controls;
const M = STORY.maintenance;
const F = STORY.finale;
const range = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)?.range ?? ([0, 1] as const);
const MODEL = range("model");

const INSTALLED = ["Installing", "Installed"] as const;
const RUNNING = ["Installing", "Running"] as const;
const ONLINE = ["Commissioning", "Online"] as const;

/** Existing equipment, straight from geometry.ts. */
const BUILDING: V3 = [4, 10.5, CURTAIN_Z];
const WALL_PANELS: V3 = [CLAD_X, 9.5, -3];
/** the coping all round the parapet (closed loop) */
const CX = SLAB.x - PARAPET.t / 2;
const CZ = SLAB.z - PARAPET.t / 2;
const CY = PARAPET.top + 0.05;
const COPING: V3 = [CX, CY, 1.5];
const COPING_RUN: V3[] = [
  [CX, CY, CZ],
  [CX, CY, -CZ],
  [-CX, CY, -CZ],
  [-CX, CY, CZ],
  [CX, CY, CZ],
];
/** across the east-wall cladding at mid-height */
const PANEL_RUN: V3[] = [
  [CLAD_X, 9, -9.5],
  [CLAD_X, 9, 9.5],
];
/** along the top of L3's wrapped supply main */
const WRAP_RUN: V3[] = supplyMain(2).map((p): V3 => [p[0], p[1] + DUCT.supplyMain[1] / 2 + 0.05, p[2]]);
const RTU_TOP: V3 = [RTU.cx, RTU_BASE + RTU.h, RTU.cz];
const OA_HOOD: V3 = [OA.x + OA.depth, OA.y, OA.z];
const ROOF: V3 = [0, ROOF_Y + 0.5, 0];
const [STOP_RTU, STOP_FAN, STOP_EMS] = SERVICE_STOPS;

type Content = Omit<CardSpec, "at" | "show">;

/**
 * A card on an anchor from the air / VRF builders' lists, shown over the anchor's window
 * (opened `lead` early to catch the element going in, held `tail` longer); dropped (never
 * faked) if that anchor is gone.
 */
function on(list: readonly Anchor[], id: string, c: Content, lead = 0, tail = 0): CardSpec[] {
  const a = list.find((x) => x.id === id);
  return a ? [{ ...c, at: a.at, show: [a.window[0] - lead, a.window[1] + tail] }] : [];
}

/** Every card in story order, with the window it would like (trimmed by `schedule` below). */
const WANTED: CardSpec[] = [
  // 00 model
  {
    id: "building",
    mark: "BLDG",
    type: "Typical commercial building",
    category: "Base model · illustrative",
    system: "model",
    icon: "building",
    rows: [
      ["Levels", "L1–L4 + roof"],
      ["Bays", "8 × 10 m grid"],
      ["Roof", "+16.50"],
    ],
    status: ["Base model", "Base model"],
    doneAt: 0,
    at: BUILDING,
    show: [MODEL[0] + (MODEL[1] - MODEL[0]) * 0.15, MODEL[1] - (MODEL[1] - MODEL[0]) * 0.08],
  },

  // 01 sheet metal
  {
    id: "coping",
    mark: "CP-1",
    type: "Parapet coping",
    category: "Architectural sheet metal",
    system: "sheetmetal",
    icon: "coping",
    rows: [
      ["Location", "Parapet · roof edge"],
      ["Run", "≈ 106 m perimeter"],
      ["Profile", "Cap + cleat"],
    ],
    status: INSTALLED,
    doneAt: SM.coping[1],
    at: COPING,
    path: COPING_RUN,
    show: [SM.coping[0], SM.coping[1] + 0.006],
  },
  {
    id: "wall-panels",
    mark: "MP-1",
    type: "Metal wall panels",
    category: "Architectural sheet metal",
    system: "sheetmetal",
    icon: "panels",
    rows: [
      ["Walls", "East + west ends"],
      ["Height", "L1 → parapet"],
      ["Joint", "Concealed fastener"],
    ],
    status: INSTALLED,
    doneAt: SM.panels[1],
    at: WALL_PANELS,
    path: PANEL_RUN,
    show: [SM.coping[1] + 0.009, SM.gutters[1] - 0.004],
  },

  // 02 HVAC
  {
    id: "rtu-1",
    mark: "RTU-1",
    type: "Packaged rooftop unit",
    category: "HVAC · supply / return",
    system: "supply",
    icon: "rtu",
    rows: [
      ["Level", "Roof · on curb"],
      ["Size", "5.6 × 2.4 × 1.9 m"],
      ["Serves", "L1–L4 supply/return"],
    ],
    status: RUNNING,
    doneAt: H.run,
    at: RTU_TOP,
    show: [H.rtu[0], H.rtu[1] + 0.013],
  },
  ...on(AIR_ANCHORS, "fd-L3", {
    id: "fire-damper",
    mark: "FD-3.1",
    type: "Fire damper",
    category: "HVAC · duct connector",
    system: "supply",
    icon: "damper",
    rows: [
      ["Location", "Shaft wall · L3"],
      ["Duct", "900 × 500 supply"],
      ["Access", "Door at damper"],
    ],
    status: INSTALLED,
    doneAt: H.fittings[1],
  }),
  ...on(AIR_ANCHORS, "drop-L3", {
    id: "round-duct",
    mark: "SR-3.1",
    type: "Spiral round duct + flex",
    category: "HVAC · supply branch",
    system: "supply",
    icon: "round",
    rows: [
      ["Size", "Ø 280 spiral"],
      ["Runs", "Lateral → diffuser"],
      ["Flex", "Insulated · short"],
    ],
    status: INSTALLED,
    doneAt: H.round[1],
  }),
  ...on(
    AIR_ANCHORS,
    "wrap-L3",
    {
      id: "duct-wrap",
      mark: "DW-3",
      type: "Duct wrap · FSK foil",
      category: "HVAC · duct insulation",
      system: "sheetmetal",
      icon: "wrap",
      rows: [
        ["Wraps", "Supply ducts"],
        ["Facing", "Foil-scrim-kraft"],
        ["Seams", "Taped · sealed"],
      ],
      status: ["Wrapping", "Installed"],
      doneAt: H.wrap[1],
      path: WRAP_RUN,
    },
    0,
    0.004,
  ),

  // 03 VRF & splits
  ...on(
    VRF_ANCHORS,
    "VRF-CU-2",
    {
      id: "vrf-cu",
      mark: "VRF-CU-2",
      type: "VRF condensing unit · heat recovery",
      category: "VRF · outdoor",
      system: "refrigerant",
      icon: "condenser",
      rows: [
        ["Level", "Roof yard · SE"],
        ["Modules", "3 outdoor units"],
        ["Size", "1.3 × 0.85 × 1.75 m"],
      ],
      status: RUNNING,
      doneAt: STORY.vrf.run,
    },
    0,
    0.007,
  ),
  ...on(VRF_ANCHORS, "BS-3", {
    id: "branch-box",
    mark: "BS-3",
    type: "Branch selector box",
    category: "VRF · refrigerant",
    system: "refrigerant",
    icon: "selector",
    rows: [
      ["Level", "L3 · by riser"],
      ["Branches", "5 cassettes"],
      ["Mode", "Heat / cool by zone"],
    ],
    status: RUNNING,
    doneAt: STORY.vrf.run,
  }),
  ...on(
    VRF_ANCHORS,
    "CAS-3.2",
    {
    id: "cassette",
    mark: "CAS-3.2",
    type: "4-way ceiling cassette",
    category: "VRF · indoor unit",
    system: "refrigerant",
    icon: "cassette",
    rows: [
      ["Level", "L3 · south zone"],
      ["Face", "840 × 840 mm"],
      ["Piping", "Liquid + gas pair"],
    ],
    status: RUNNING,
    doneAt: STORY.vrf.run,
    },
    0.012,
  ),
  ...on(VRF_ANCHORS, "DS-1", {
    id: "wall-split",
    mark: "DS-1",
    type: "Ductless wall split",
    category: "Split system · indoor",
    system: "refrigerant",
    icon: "split",
    rows: [
      ["Room", "L3 tech room"],
      ["Condenser", "Roof · above core"],
      ["Line set", "Insulated pair"],
    ],
    status: RUNNING,
    doneAt: Math.max(STORY.vrf.split[1], STORY.vrf.run),
  }),

  // 04 exhaust & outside air
  {
    id: "ef-1",
    mark: STOP_FAN.tag,
    type: "Up-blast exhaust fan",
    category: "Exhaust · roof",
    system: "exhaust",
    icon: "fan",
    rows: [
      ["Level", "Roof · on curb"],
      ["Serves", "Restrooms · L1–L4"],
      ["Discharge", "Vertical up-blast"],
    ],
    status: RUNNING,
    doneAt: X.run,
    at: STOP_FAN.at,
    show: [X.fan[0], X.fan[1] + 0.012],
  },
  {
    id: "oa-hood",
    mark: "OA-1",
    type: "Outside-air hood",
    category: "Outside air · intake",
    system: "exhaust",
    icon: "hood",
    rows: [
      ["Mounted", "RTU-1 · east end"],
      ["Intake", "Louvred + screen"],
      ["Feeds", "Fresh air → RTU-1"],
    ],
    status: RUNNING,
    doneAt: X.run,
    at: OA_HOOD,
    show: [X.oa[1] - 0.004, X.oa[1] + 0.022],
  },

  // 05 controls
  {
    id: "ems-1",
    mark: STOP_EMS.tag,
    type: "EMS control panel",
    category: "Controls · EMS",
    system: "controls",
    icon: "ems",
    rows: [
      ["Location", "Core wall · L1"],
      ["Links", "RTU · EF · 4 zones"],
      ["Network", "Riser to roof"],
    ],
    status: ONLINE,
    doneAt: C.run,
    at: STOP_EMS.at,
    show: [C.lines[0] + 0.012, C.lines[1]],
  },
  {
    // the L2 zone sensor's line: it runs along the soffit right past where the pull-out looks
    id: "sensor-line-2",
    mark: "CL-2",
    type: "Sensor line · zone L2",
    category: "Controls · EMS network",
    system: "controls",
    icon: "sensor",
    rows: [
      ["From", "EMS-1 · riser"],
      ["To", "T-2 · column C2"],
      ["Signal", "Low-voltage"],
    ],
    status: ONLINE,
    doneAt: C.run,
    at: sensorRoutes[1][sensorRoutes[1].length - 1],
    path: sensorRoutes[1],
    show: [C.lines[1], C.sensors[1] + 0.018],
  },

  // 06 maintenance
  {
    id: "pm-rtu",
    mark: "PM-1",
    type: "Preventative maintenance",
    category: `Service · ${STOP_RTU.tag}`,
    system: "maintenance",
    icon: "service",
    rows: [
      ["Unit", STOP_RTU.tag],
      ["Checks", "Filters · coils"],
      ["Interval", "Quarterly"],
    ],
    status: ["Inspecting", "PM complete"],
    doneAt: M.stops[0][1] - 0.006,
    at: STOP_RTU.at,
    show: M.stops[0],
  },

  // 07 finale
  {
    id: "all-systems",
    mark: "SYSTEMS",
    type: "Every system running",
    category: "Six trades · one building",
    system: "exhaust",
    icon: "check",
    rows: [
      ["Air", "RTU-1 · VRF · split"],
      ["Exhaust", "EF-1 – EF-3 · OA"],
      ["Controls", "EMS-1 online"],
    ],
    status: ["Starting", "All running"],
    doneAt: F.running[1],
    at: ROOF,
    show: [F.running[0], F.running[1] + 0.035],
  },
];

/**
 * Each card stays up at least MIN_SPAN, and ends before the card two places after it
 * starts — with the cards in story order, never more than two are up at once.
 */
function schedule(cards: CardSpec[]): CardSpec[] {
  const sorted = [...cards].sort((a, b) => a.show[0] - b.show[0]);
  return sorted.map((c, i) => {
    const next2 = sorted[i + 2];
    const end = Math.max(c.show[1], c.show[0] + MIN_SPAN);
    return { ...c, show: [c.show[0], next2 ? Math.min(end, next2.show[0] - HANDOFF) : end] };
  });
}

/** In story order; at most two in their window at any moment. */
export const CARDS: readonly CardSpec[] = schedule(WANTED);
