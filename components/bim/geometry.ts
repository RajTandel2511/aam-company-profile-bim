/**
 * The illustrative building every trade is modelled into — one typical
 * four-storey commercial building. Every part routes off these numbers, so ducts
 * land in the shaft, lines reach their sensors and the camera frames real
 * positions. ILLUSTRATIVE · NOT TO SCALE — no real project is depicted.
 *
 * Units: metres. +X east, +Y up, +Z south (toward the default camera).
 * Origin: grade level at the building's centre.
 */

export type V3 = readonly [number, number, number];

/* ------------------------------------------------------------ STRUCTURE -- */

/** Column grid lines A..E (x) and 1..3 (z). Columns stand on every intersection. */
export const GRID_X = [-16, -8, 0, 8, 16] as const;
export const GRID_Z = [-10, 0, 10] as const;
export const GRID_X_LABELS = ["A", "B", "C", "D", "E"] as const;
export const GRID_Z_LABELS = ["1", "2", "3"] as const;

/** Level datums. A slab occupies [y - SLAB_T, y]; ROOF is the roof slab. */
export const LEVELS = [
  { id: "L1", y: 0, label: "L1  ±0.00" },
  { id: "L2", y: 4.5, label: "L2  +4.50" },
  { id: "L3", y: 8.5, label: "L3  +8.50" },
  { id: "L4", y: 12.5, label: "L4  +12.50" },
  { id: "ROOF", y: 16.5, label: "ROOF  +16.50" },
] as const;
/** Occupied floors: index 0..3 = L1..L4. */
export const FLOORS = 4;
export const ROOF_Y = 16.5;
export const SLAB_T = 0.3;
/** Slab half-extents (slab edge). */
export const SLAB = { x: 16.3, z: 10.3 } as const;
/** Square concrete column on every grid intersection, L1 to roof. */
export const COLUMN = 0.55;
/** Parapet wall on the roof-slab edge: inner face at SLAB - t, top at `top`. */
export const PARAPET = { top: 17.6, t: 0.3 } as const;

/** Glass curtain wall on the north and south faces, at z = ±CURTAIN_Z. */
export const CURTAIN_Z = 10.4;
/** Mullion spacing along x; transoms at every slab edge and mid-storey. */
export const MULLION_STEP = 2;
/** Solid east and west end walls (x = ±inner..±outer), clad in metal panels whose outer face is ±CLAD_X. */
export const END_WALL = { inner: 16.0, outer: 16.3 } as const;
export const CLAD_X = 16.42;

/** Stair / elevator core (concrete) at the west end. */
export const CORE = { x0: -15.7, x1: -12.2, z0: -6.5, z1: 1.5, wall: 0.25 } as const;
/** Mechanical shaft beside the core — slabs are open here; the supply and return trunks drop through it. */
export const SHAFT = { x0: -11.6, x1: -9.0, z0: -3.4, z1: -0.6 } as const;
/** Stair penthouse on the roof above the north half of the core. */
export const PENTHOUSE = { x0: -15.7, x1: -12.2, z0: -6.5, z1: -2.5, top: 19.6 } as const;
/** Entry canopy on the south face. */
export const CANOPY = { x0: 3, x1: 12, z0: CURTAIN_Z, z1: 13.4, y: 3.9, t: 0.25 } as const;

/** Underside of the slab above occupied floor i (0 = L1 … 3 = L4). */
export const ceilingTop = (i: number) => LEVELS[i + 1].y - SLAB_T;
/** Finished ceiling line — diffuser and grille faces sit here. */
export const ceilingLine = (i: number) => ceilingTop(i) - 1.05;

/* ------------------------------------------------------------------ HVAC -- */

/**
 * Packaged rooftop unit on a curb, over the shaft (both trunks drop from its
 * underside). w along x, d along z. Its west end clears the stair penthouse.
 */
export const RTU = { cx: -9.3, cz: -2.0, w: 5.6, d: 2.4, h: 1.9, curb: 0.45 } as const;
export const RTU_BASE = ROOF_Y + RTU.curb;

/** Rectangular duct sections, [width, height] in metres (trunks: [x, z] in plan). */
export const DUCT = {
  supplyTrunk: [0.9, 0.6],
  supplyMain: [0.9, 0.5],
  supplyLateral: [0.6, 0.35],
  returnTrunk: [1.0, 0.6],
  returnMain: [1.0, 0.5],
  exhaustRiser: [0.6, 0.45],
  exhaustBranch: [0.45, 0.3],
} as const;

export const SUPPLY = {
  trunkX: -9.75,
  trunkZ: -2.0,
  mainZ: 1.6,
  mainEndX: 13.2,
  lateralsX: [-2, 5, 12],
  lateralEndZ: 7.2,
  diffusersZ: [4.4, 7.2],
  /** square ceiling diffuser face */
  diffuser: 0.6,
} as const;

export const RETURN = {
  trunkX: -10.85,
  trunkZ: -2.0,
  mainZ: -5.2,
  mainEndX: 9.5,
  grillesX: [-3, 3, 9],
  /** return grille face, x by z */
  grille: [1.2, 0.6],
} as const;

/** Centre-line elevations of the mains on floor i. Supply runs low, return high; they never cross in plan. */
export const supplyY = (i: number) => ceilingTop(i) - 0.55;
export const returnY = (i: number) => ceilingTop(i) - 0.35;

export const supplyTrunk: V3[] = [
  [SUPPLY.trunkX, RTU_BASE, SUPPLY.trunkZ],
  [SUPPLY.trunkX, supplyY(0), SUPPLY.trunkZ],
];
/** Trunk -> south out of the shaft -> east along the floor. */
export const supplyMain = (i: number): V3[] => [
  [SUPPLY.trunkX, supplyY(i), SUPPLY.trunkZ],
  [SUPPLY.trunkX, supplyY(i), SUPPLY.mainZ],
  [SUPPLY.mainEndX, supplyY(i), SUPPLY.mainZ],
];
export const supplyLaterals = (i: number): V3[][] =>
  SUPPLY.lateralsX.map((x): V3[] => [
    [x, supplyY(i), SUPPLY.mainZ],
    [x, supplyY(i), SUPPLY.lateralEndZ],
  ]);
/** Diffuser face centres on floor i (at the ceiling line, under each lateral). */
export const diffusers = (i: number): V3[] =>
  SUPPLY.lateralsX.flatMap((x) => SUPPLY.diffusersZ.map((z): V3 => [x, ceilingLine(i), z]));

export const returnTrunk: V3[] = [
  [RETURN.trunkX, RTU_BASE, RETURN.trunkZ],
  [RETURN.trunkX, returnY(0), RETURN.trunkZ],
];
/** Trunk -> north out of the shaft -> east along the floor. */
export const returnMain = (i: number): V3[] => [
  [RETURN.trunkX, returnY(i), RETURN.trunkZ],
  [RETURN.trunkX, returnY(i), RETURN.mainZ],
  [RETURN.mainEndX, returnY(i), RETURN.mainZ],
];
export const returnGrilles = (i: number): V3[] => RETURN.grillesX.map((x): V3 => [x, ceilingLine(i), RETURN.mainZ]);

/** Air direction, for particles: unit -> down the trunk -> out to the end of the floor's main. */
export const supplyFlow = (i: number): V3[] => [
  [SUPPLY.trunkX, RTU_BASE + 0.4, SUPPLY.trunkZ],
  [SUPPLY.trunkX, supplyY(i), SUPPLY.trunkZ],
  [SUPPLY.trunkX, supplyY(i), SUPPLY.mainZ],
  [SUPPLY.mainEndX, supplyY(i), SUPPLY.mainZ],
];
/** ...and back: end of the return main -> trunk -> up into the unit. */
export const returnFlow = (i: number): V3[] => [
  [RETURN.mainEndX, returnY(i), RETURN.mainZ],
  [RETURN.trunkX, returnY(i), RETURN.mainZ],
  [RETURN.trunkX, returnY(i), RETURN.trunkZ],
  [RETURN.trunkX, RTU_BASE + 0.4, RETURN.trunkZ],
];

/* ------------------------------------------------- EXHAUST & OUTSIDE AIR -- */

/** Restroom exhaust: grilles on every floor, a riser by the north-east corner, an up-blast fan on the roof. */
export const EXHAUST = {
  riserX: 14.0,
  riserZ: -8.4,
  branchEndX: 8.0,
  grillesX: [8.0, 11.0],
  grille: 0.45,
  fanCurb: 0.45,
  fanR: 0.85,
  fanH: 0.95,
  /** discharge plume fades out here */
  plumeTop: 23.5,
} as const;
export const exhaustY = (i: number) => ceilingTop(i) - 0.35;

export const exhaustRiser: V3[] = [
  [EXHAUST.riserX, exhaustY(0), EXHAUST.riserZ],
  [EXHAUST.riserX, ROOF_Y + EXHAUST.fanCurb, EXHAUST.riserZ],
];
export const exhaustBranch = (i: number): V3[] => [
  [EXHAUST.riserX, exhaustY(i), EXHAUST.riserZ],
  [EXHAUST.branchEndX, exhaustY(i), EXHAUST.riserZ],
];
export const exhaustGrilles = (i: number): V3[] => EXHAUST.grillesX.map((x): V3 => [x, ceilingLine(i), EXHAUST.riserZ]);
/** Grille -> up the neck -> along the branch -> up the riser -> through the fan -> out as a plume. */
export const exhaustFlow = (i: number): V3[] => [
  [EXHAUST.branchEndX, ceilingLine(i), EXHAUST.riserZ],
  [EXHAUST.branchEndX, exhaustY(i), EXHAUST.riserZ],
  [EXHAUST.riserX, exhaustY(i), EXHAUST.riserZ],
  [EXHAUST.riserX, EXHAUST.plumeTop, EXHAUST.riserZ],
];

/** Outside-air hood on the RTU's east end; fresh air is drawn in from the open roof. */
export const OA = {
  x: RTU.cx + RTU.w / 2,
  z: RTU.cz,
  y: RTU_BASE + 1.25,
  depth: 0.8,
  height: 1.0,
  width: 1.8,
  intakeFromX: -1.5,
} as const;
export const oaFlow: V3[] = [
  [OA.intakeFromX, OA.y, OA.z],
  [OA.x + 0.1, OA.y, OA.z],
];

/* -------------------------------------------------------------- CONTROLS -- */

/**
 * EMS panel on the core's east wall at L1 (w along z, h vertical, d out from the wall),
 * a controls riser straight up from it, a sensor on column C2 on every floor, and
 * links to the rooftop unit and the exhaust fan.
 */
export const CONTROLS = {
  panel: { x: -12.09, y: 1.6, z: -5.2, w: 0.75, h: 1.1, d: 0.22 },
  riserX: -11.95,
  riserZ: -5.2,
  /** horizontal runs hug the slab soffit, clear above every duct */
  soffit: 0.05,
  sensor: { x: 0, z: 0.32, h: 1.5 },
  roofY: ROOF_Y + 0.2,
  /** RTU control box on the unit's north face */
  rtuBox: { x: -9.0, z: RTU.cz - RTU.d / 2 - 0.1, y: RTU_BASE + 0.9 },
} as const;

const C = CONTROLS;
const panelTop: V3 = [C.riserX, C.panel.y + C.panel.h / 2, C.riserZ];
const soffitY = (i: number) => ceilingTop(i) - C.soffit;

/** Panel -> riser -> along the soffit -> down column C2 to the floor's sensor. Index 0..3 = L1..L4. */
export const sensorRoutes: V3[][] = Array.from({ length: FLOORS }, (_, i): V3[] => [
  panelTop,
  [C.riserX, soffitY(i), C.riserZ],
  [C.riserX, soffitY(i), -3.9],
  [C.sensor.x, soffitY(i), -3.9],
  [C.sensor.x, soffitY(i), C.sensor.z],
  [C.sensor.x, LEVELS[i].y + C.sensor.h, C.sensor.z],
]);
/** Panel -> riser to the roof -> across to the RTU control box. */
export const rtuRoute: V3[] = [
  panelTop,
  [C.riserX, C.roofY, C.riserZ],
  [C.rtuBox.x, C.roofY, C.riserZ],
  [C.rtuBox.x, C.roofY, C.rtuBox.z],
  [C.rtuBox.x, C.rtuBox.y, C.rtuBox.z],
];
/** Panel -> riser to the roof -> along the north parapet -> to the exhaust fan curb. */
export const fanRoute: V3[] = [
  panelTop,
  [C.riserX, C.roofY, C.riserZ],
  [C.riserX, C.roofY, -9.6],
  [EXHAUST.riserX - 1, C.roofY, -9.6],
  [EXHAUST.riserX - 1, C.roofY, EXHAUST.riserZ],
  [EXHAUST.riserX - EXHAUST.fanR - 0.05, C.roofY, EXHAUST.riserZ],
];
export const sensorAt = (i: number): V3 => [C.sensor.x, LEVELS[i].y + C.sensor.h, C.sensor.z];

/* --------------------------------------------------------- VRF & SPLITS -- */

/**
 * VRF heat-recovery system: three condensing modules on rails in the roof's
 * south-east yard, insulated refrigerant pairs run west on sleepers to a riser
 * beside column C2, a branch selector box on every floor, and ceiling
 * cassettes in the perimeter zones. Branches run just above the ceiling line,
 * below every duct (supply bottoms out at ceilingTop - 0.8). Clear of the
 * shaft, the controls drop at C2 (x 0, z 0.32), the OA intake strip and EF-1.
 */
export const VRF = {
  /** module centres along x; w along x, d along z, rails under them */
  modulesX: [2.0, 3.55, 5.1],
  z: 5.2,
  w: 1.3,
  d: 0.85,
  h: 1.75,
  rail: 0.35,
  riserX: 1.0,
  riserZ: -1.0,
  roofY: ROOF_Y + 0.3,
  /** branch selector box hung beside the riser on each floor */
  box: { x: 1.9, z: -1.0, w: 0.55, h: 0.28, d: 0.45 },
  /** branch elevation below the slab soffit */
  branchDrop: 0.92,
  /** cassette face centres (x, z) on every floor: three south, two north */
  cassettes: [
    [-7, 6.0],
    [1, 6.0],
    [9, 6.0],
    [-4, -8.0],
    [4, -8.0],
  ] as readonly (readonly [number, number])[],
  cassette: { face: 0.84, h: 0.28 },
} as const;
export const vrfY = (i: number) => ceilingTop(i) - VRF.branchDrop;
export const vrfBoxAt = (i: number): V3 => [VRF.box.x, ceilingTop(i) - 0.62, VRF.box.z];
export const cassetteAt = (i: number, k: number): V3 => [VRF.cassettes[k][0], ceilingLine(i), VRF.cassettes[k][1]];

/** Roof run from the west end of the yard to the riser head. */
export const vrfRoofRun: V3[] = [
  [VRF.modulesX[0] - VRF.w / 2 - 0.15, VRF.roofY, VRF.z],
  [VRF.riserX, VRF.roofY, VRF.z],
  [VRF.riserX, VRF.roofY, VRF.riserZ],
];
export const vrfRiser: V3[] = [
  [VRF.riserX, VRF.roofY, VRF.riserZ],
  [VRF.riserX, vrfY(0), VRF.riserZ],
];
/** Floor i: riser -> box, then box -> each cassette (south three along z 6, north two along z -8). */
export const vrfBranches = (i: number): V3[][] => {
  const y = vrfY(i);
  const out: V3[][] = [[[VRF.riserX, y, VRF.riserZ], [VRF.box.x, y, VRF.box.z]]];
  for (const [x, z] of VRF.cassettes) {
    out.push([
      [VRF.box.x, y, VRF.box.z],
      [VRF.box.x, y, z],
      [x, y, z],
      [x, ceilingLine(i) + VRF.cassette.h, z],
    ]);
  }
  return out;
};

/** Ductless split for the tech room: wall unit on the core's east face at L3, condenser on the roof above the core. */
export const SPLIT = {
  wall: { x: -12.08, y: LEVELS[2].y + 2.45, z: 0.6, w: 0.9, h: 0.3, d: 0.22 },
  condenser: { x: -14.0, z: 0.6, w: 0.85, d: 0.32, h: 0.7, stand: 0.3 },
} as const;
export const splitLineSet: V3[] = [
  [-12.02, SPLIT.wall.y + SPLIT.wall.h / 2, SPLIT.wall.z + 0.3],
  [-12.02, ROOF_Y + 0.25, SPLIT.wall.z + 0.3],
  [SPLIT.condenser.x + SPLIT.condenser.w / 2 + 0.05, ROOF_Y + 0.25, SPLIT.wall.z + 0.3],
];

/** Two smaller up-blast roof exhaust fans (EF-2, EF-3) on curbs, clear of the VRF yard and the controls run. */
export const ROOF_FANS = [
  { tag: "EF-2", x: 7.0, z: -5.0, r: 0.55, curb: 0.3, h: 0.7 },
  { tag: "EF-3", x: 10.5, z: -5.0, r: 0.55, curb: 0.3, h: 0.7 },
] as const;

/* ----------------------------------------------------------- MAINTENANCE -- */

/** Preventative-maintenance stops, in visiting order. Tags are illustrative marks. */
export const SERVICE_STOPS = [
  { id: "rtu", tag: "RTU-1", at: [RTU.cx, RTU_BASE + RTU.h / 2, RTU.cz] as V3, r: 3.4 },
  { id: "fan", tag: "EF-1", at: [EXHAUST.riserX, ROOF_Y + EXHAUST.fanCurb + EXHAUST.fanH / 2, EXHAUST.riserZ] as V3, r: 1.5 },
  { id: "ems", tag: "EMS-1", at: [C.panel.x, C.panel.y, C.panel.z] as V3, r: 1.1 },
] as const;

/* ---------------------------------------------------------------- FRAMING -- */

/** Bounding box of the whole model including the plume — the camera frames this. */
export const MODEL_BOUNDS = { min: [-17, 0, -11] as V3, max: [17, EXHAUST.plumeTop, 13.4] as V3 } as const;
/** Section box: the south face is cut away at z = SECTION_Z once the story goes inside. */
export const SECTION_Z = 8.4;
