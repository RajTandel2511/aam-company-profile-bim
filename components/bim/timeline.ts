import { easeInOutCubic, easeOutCubic, seg } from "@/lib/timing";

/**
 * When everything happens. Two clocks drive the model:
 *   bim.intro — the load-time 4D construction sequence (0..1 over INTRO_SECONDS)
 *   bim.story — scroll progress through the systems story (0..1)
 * Every part derives its state as a pure function of these, so scrubbing
 * backwards un-builds the model exactly.
 */

export type Window = readonly [number, number];

export const INTRO_SECONDS = 4.6;

/** Load-time sequence, as fractions of bim.intro. Columns and slabs go floor by floor inside their windows. */
export const INTRO = {
  grid: [0.0, 0.14],
  footings: [0.06, 0.2],
  columns: [0.14, 0.56],
  slabs: [0.2, 0.66],
  core: [0.24, 0.66],
  roof: [0.6, 0.76],
  envelope: [0.66, 0.96],
  annotations: [0.78, 1.0],
} as const satisfies Record<string, Window>;

export type ChapterId = "model" | "sheetmetal" | "hvac" | "vrf" | "exhaust" | "controls" | "maintenance" | "finale";

/** Story chapters in scroll order. The six systems map 1:1 to content.services ids. */
export const CHAPTERS: readonly { id: ChapterId; range: Window }[] = [
  { id: "model", range: [0.0, 0.08] },
  { id: "sheetmetal", range: [0.08, 0.2] },
  { id: "hvac", range: [0.2, 0.37] },
  { id: "vrf", range: [0.37, 0.5] },
  { id: "exhaust", range: [0.5, 0.62] },
  { id: "controls", range: [0.62, 0.74] },
  { id: "maintenance", range: [0.74, 0.88] },
  { id: "finale", range: [0.88, 1.0] },
];

/**
 * Build windows inside each chapter (story progress). A part is absent before
 * its window, builds across it, and stays afterwards. Ambient loops (flows,
 * pulses) start at their `run` mark and keep running to the end.
 */
export const STORY = {
  sheetmetal: {
    panels: [0.09, 0.17],
    coping: [0.1, 0.14],
    flashing: [0.12, 0.155],
    gutters: [0.135, 0.18],
    canopy: [0.15, 0.19],
    glint: [0.17, 0.198],
    /** chapter's own tags are gone by here */
    tagsOut: 0.2,
  },
  /** Section box engages and the architecture ghosts as the story goes inside. */
  section: [0.2, 0.245],
  xray: [0.2, 0.245],
  hvac: {
    rtu: [0.215, 0.255],
    trunks: [0.245, 0.28],
    hangers: [0.255, 0.335],
    supply: [0.27, 0.32],
    ret: [0.29, 0.34],
    /** duct connectors: tees / takeoffs, transitions, elbows with vanes, flex collars, fire + volume dampers */
    fittings: [0.295, 0.345],
    terminals: [0.305, 0.35],
    /** VAV terminal boxes at the head of each supply lateral */
    vav: [0.31, 0.35],
    /** round spiral drops + flex to the diffusers */
    round: [0.315, 0.355],
    /** insulation wrap travelling along the supply mains and laterals */
    wrap: [0.33, 0.365],
    run: 0.335,
  },
  vrf: {
    /** three VRF condensing units + the split condenser craned onto the roof */
    units: [0.38, 0.415],
    /** insulated refrigerant pairs: roof run, riser, floor branches */
    piping: [0.405, 0.45],
    /** branch selector boxes, one per floor */
    boxes: [0.425, 0.455],
    /** ceiling cassettes on every floor */
    indoor: [0.44, 0.485],
    /** ductless wall split in the tech room + its line set */
    split: [0.455, 0.485],
    run: 0.47,
  },
  exhaust: {
    riser: [0.51, 0.54],
    branches: [0.525, 0.56],
    grilles: [0.54, 0.57],
    fan: [0.54, 0.57],
    /** the two smaller roof exhaust fans */
    fans: [0.55, 0.58],
    oa: [0.56, 0.595],
    run: 0.575,
  },
  controls: {
    panel: [0.63, 0.65],
    riser: [0.645, 0.67],
    lines: [0.66, 0.705],
    sensors: [0.685, 0.72],
    run: 0.7,
  },
  maintenance: {
    /** one window per SERVICE_STOPS entry, in order */
    stops: [
      [0.755, 0.79],
      [0.79, 0.825],
      [0.825, 0.86],
    ],
  },
  finale: {
    running: [0.9, 0.94],
  },
} as const;

/** Local 0..1 progress of p inside window w. */
export const win = (p: number, w: Window) => seg(p, w[0], w[1]);
/** Eased (in-out cubic) local progress — for placements and camera-like moves. */
export const ease = (p: number, w: Window) => easeInOutCubic(seg(p, w[0], w[1]));
/** Eased-out local progress — for things that arrive and settle. */
export const arrive = (p: number, w: Window) => easeOutCubic(seg(p, w[0], w[1]));
/** Sub-window i of n inside w, overlapping by `overlap` (0..1) — floor-by-floor and bay-by-bay sequencing. */
export function stagger(w: Window, i: number, n: number, overlap = 0.5): Window {
  const span = (w[1] - w[0]) / (n - (n - 1) * overlap);
  const a = w[0] + i * span * (1 - overlap);
  return [a, a + span];
}

/** Index into CHAPTERS for story progress p. */
export function chapterAt(p: number): number {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (p >= CHAPTERS[i].range[0]) return i;
  return 0;
}
