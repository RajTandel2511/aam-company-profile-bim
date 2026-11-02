/**
 * The shop sequence: copy for the step rail and the timing every 3D part reads.
 * Pure data (no three.js), so the server-rendered section can import it.
 *
 * Shop facts — AAM operations ([ops] in lib/content.ts): rectangular duct only;
 * corner seams mostly Pittsburgh lock, some spot-welded; transverse joints TDC
 * flanges and S&D in roughly equal use; turning vanes almost all small vanes set
 * in runners. The duct drawn is a typical 24 x 12 in section — illustrative only,
 * no production numbers.
 */
import { easeInOutCubic, seg } from "@/lib/timing";

export type Span = readonly [number, number];

/** Rail copy. `at` = scroll progress (0..1) where the step begins. */
export const STEPS = [
  {
    id: "blank",
    title: "Flat blank",
    line: "A galvanized blank lies flat on the brake, its fold lines and corner notches laid out.",
    at: 0,
  },
  {
    id: "folds",
    title: "Brake folds",
    line: "The brake bends it 90° at each fold line until the blank closes into a rectangle.",
    at: 0.115,
  },
  {
    id: "pittsburgh",
    title: "Pittsburgh lock",
    line: "The open corner locks with a Pittsburgh seam — the corner we use most; some are spot-welded.",
    at: 0.295,
  },
  {
    id: "tdc",
    title: "TDC flanges",
    line: "Flanges are formed on both ends and a corner piece goes into each corner, ready to bolt.",
    at: 0.415,
  },
  {
    id: "joining",
    title: "Joining",
    line: "Sections bolt flange to flange over a gasket. Smaller duct joins with S&D — slips on two sides, drives on two.",
    at: 0.56,
  },
  {
    id: "elbow",
    title: "Square elbow & turning vanes",
    line: "A square elbow turns the run; small turning vanes set in runners carry the air around the corner.",
    at: 0.725,
  },
  {
    id: "finished",
    title: "The finished run",
    line: "Straight, square elbow, transition — fabricated in our South San Francisco shop, ready for site.",
    at: 0.86,
  },
] as const;

export function stepAt(p: number): number {
  let i = 0;
  while (i < STEPS.length - 1 && p >= STEPS[i + 1].at) i++;
  return i;
}

/** Keynote number of step i, as the legend and the model's element tags print it: "01". */
export const keynote = (i: number) => String(i + 1).padStart(2, "0");

export type StepId = (typeof STEPS)[number]["id"];

/** Keynote by step id, for the element tags in the model. */
export const NOTE = Object.fromEntries(STEPS.map((s, i) => [s.id, keynote(i)])) as Record<StepId, string>;

/** When everything happens, in scroll progress. Each part is a pure function of it, so scrubbing back un-builds exactly. */
export const AT = {
  marksIn: [0.015, 0.07],
  marksOut: [0.12, 0.155],
  fold1: [0.12, 0.185],
  fold2: [0.175, 0.235],
  fold3: [0.225, 0.29],
  male: [0.226, 0.246],
  wall: [0.305, 0.34],
  lip: [0.335, 0.372],
  seamGlow: 0.372,
  bedOut: [0.42, 0.47],
  flange: [0.445, 0.495],
  ret: [0.475, 0.51],
  corners: [0.5, 0.54],
  flangeGlow: 0.54,
  gasketAB: [0.565, 0.59],
  slideB: [0.57, 0.625],
  boltsAB: [0.62, 0.645],
  abGlow: 0.645,
  sdIn: [0.585, 0.615],
  sdSlide: [0.645, 0.675],
  drives: [0.67, 0.698],
  tabs: [0.695, 0.712],
  sdGlow: 0.712,
  sdOut: [0.735, 0.765],
  gasketElbow: [0.735, 0.755],
  slideElbow: [0.735, 0.785],
  boltsElbow: [0.78, 0.8],
  elbowGlow: 0.8,
  cutaway: [0.8, 0.835],
  cutawayClose: [0.865, 0.89],
  gasketTr: [0.87, 0.885],
  slideTr: [0.872, 0.91],
  boltsTr: [0.905, 0.925],
  trGlow: 0.925,
  spin: [0.925, 0.965],
  tagBlank: [0.02, 0.118],
  tagFold: [0.14, 0.295],
  tagSeam: [0.33, 0.415],
  tagTdc: [0.49, 0.56],
  tagGasket: [0.6, 0.655],
  tagSd: [0.68, 0.73],
  tagVanes: [0.81, 0.865],
  tagDone: [0.925, 1.02],
} as const;

/**
 * Written once per frame by the stage rig, read inside every part's useFrame —
 * no React state per frame. `t` is the spin's clock: it advances only while the
 * finished run is spinning on screen and motion isn't paused (lib/motion-pause).
 */
export const shop = { p: 0, t: 0 };

/** Eased (in-out) local progress of p inside span s. */
export const io = (p: number, s: Span) => easeInOutCubic(seg(p, s[0], s[1]));

/** 0 → 1 → 0: rises as a joint closes at `at`, then dies away — the seam highlight. */
export const flash = (p: number, at: number) => (p < at ? seg(p, at - 0.008, at) : 1 - seg(p, at, at + 0.035));

/** A tag's opacity: fades in at the start of its span and out at the end. */
export const shown = (p: number, s: Span) => Math.min(seg(p, s[0], s[0] + 0.012), 1 - seg(p, s[1] - 0.012, s[1]));

/** Typical shop pieces — rectangular fittings only. */
export const PIECES = [
  "Cut duct",
  "Rectangular blanks",
  "Transitions",
  "Radius elbows",
  "Square elbows",
  "Offsets",
  "End caps",
  "Square-to-round",
  "45° takeoffs",
] as const;

/** The shop standard, as a BIM properties palette. */
export const SPECS = [
  { k: "Duct", v: "Rectangular only" },
  { k: "Corner seams", v: "Pittsburgh lock on most; some spot-welded" },
  { k: "Transverse joints", v: "TDC flanges and S&D, in roughly equal use" },
  { k: "Turning vanes", v: "Small vanes, set in runners" },
] as const;

export const SEQUENCE_LABEL =
  "3D illustration of how the AAM shop makes rectangular duct, step by step as you scroll: a flat galvanized blank is folded on a brake into a rectangular section; the open corner closes with a Pittsburgh lock; TDC flanges are formed on both ends and corner pieces fitted; a second section bolts on over a gasket while a smaller duct joins with an S&D slip-and-drive joint; a square elbow with small turning vanes in runners is added; and the finished run — straight, square elbow and transition — turns slowly. Illustrative, typical 24 by 12 inch duct.";
