"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeInCubic, easeOutCubic, lerp, prng, seg } from "@/lib/timing";
import {
  DUCT,
  RETURN,
  ROOF_Y,
  RTU,
  RTU_BASE,
  SUPPLY,
  returnFlow,
  returnGrilles,
  returnMain,
  returnTrunk,
  returnY,
  supplyFlow,
  supplyTrunk,
  supplyY,
  type V3,
} from "../geometry";
import { Tag, polyLength } from "../kit";
import { GLOW, MEP } from "../materials";
import { bim } from "../store";
import { STORY, ease, win } from "../timeline";
import { RectDuct, extendEnd, trimStart, type DuctRun } from "./duct";
import { Coordination } from "./air/coordination";
import { MultiPulses, type Stream } from "./air/flows";
import { Hangers } from "./air/hangers";
import {
  COLLARS,
  DROPS,
  FLOOR_INDEX,
  MAIN_LEN,
  RETURN_NECK,
  WRAP,
  W_LATERAL,
  W_RET,
  W_SUPPLY,
  W_TRANSITION,
  lateralPath,
  mainParts,
  shoeAt,
  wrapParts,
} from "./air/layout";
import type { FlangeSpec } from "./air/plan";
import {
  FLOW,
  Particles,
  Swatch,
  Terminals,
  box,
  chapterEnd,
  cylinder,
  disc,
  done,
  fract,
  inDuct,
  merge,
  neckPath,
  outline,
  running,
  tagShow,
  useParts,
} from "./air/parts";

/**
 * Chapter 02 — HVAC, drawn as a coordination model. RTU-1 is craned onto its
 * curb, trapeze hangers go up just ahead of the duct, the supply and return
 * trunks drop down the shaft and the mains run out floor by floor (top-down,
 * chasing the trunks). Then the connector pieces land with a placement flash —
 * fire dampers at the shaft, turning vanes in the main's elbow, concentric
 * transitions after each lateral, canvas connectors on the trunks, 45° shoe
 * takeoffs and return tee collars — VAV boxes are lifted onto the shoes, the
 * laterals extrude from them, round spiral drops and flex feed round-neck
 * diffusers, and the supply side is wrapped in foil-faced insulation (layout:
 * air/layout.ts). From the run mark conditioned air pulses out through the
 * supply, back through the return, and throws from every diffuser. Every state
 * is a pure function of bim.story (scrubbing back un-builds it); ambient motion
 * runs on bim.time.
 */

const H = STORY.hvac;
const HVAC_END = chapterEnd("hvac");

/* ------------------------------------------------------------ schedule -- */

const trunkBuild = () => ease(bim.story, H.trunks);
/** 0..1 of MAIN_LEN: one extrusion front runs the whole split main. */
const mainFront = FLOOR_INDEX.map((i) => () => ease(bim.story, W_SUPPLY[i]));
const returnMainBuild = FLOOR_INDEX.map((i) => () => ease(bim.story, W_RET[i]));
const lateralBuild = W_LATERAL.map((ws) => ws.map((w) => () => ease(bim.story, w)));

/* ---------------------------------------------------------- ductwork -- */

const GRILLE_BOOT = [1.0, 0.1, 0.48] as const;
/** Trunks tuck under the L1 mains so each takeoff reads as a square elbow. */
const TRUNK_BOOT = 0.05;

const DIFFUSERS = DROPS.map((d) => d.face);
const GRILLES = FLOOR_INDEX.flatMap((i) => returnGrilles(i));
const GRILLE_FLOOR = FLOOR_INDEX.flatMap((i) => returnGrilles(i).map(() => i));
const grilleAppear = (k: number) => win(bim.story, COLLARS[k].grille);

const SUPPLY_RUNS: DuctRun[] = [
  { path: extendEnd(supplyTrunk, DUCT.supplyMain[1] / 2 + TRUNK_BOOT), size: DUCT.supplyTrunk, build: trunkBuild },
  ...FLOOR_INDEX.flatMap((i) =>
    mainParts(i).map((p): DuctRun => ({ path: p.path, size: p.size, build: () => (mainFront[i]() * MAIN_LEN - p.from) / (p.to - p.from) })),
  ),
  ...FLOOR_INDEX.flatMap((i) =>
    SUPPLY.lateralsX.map((x, j): DuctRun => ({ path: lateralPath(i, x), size: DUCT.supplyLateral, build: lateralBuild[i][j] })),
  ),
];

const RETURN_RUNS: DuctRun[] = [
  { path: extendEnd(returnTrunk, DUCT.returnMain[1] / 2 + TRUNK_BOOT), size: DUCT.returnTrunk, build: trunkBuild },
  ...FLOOR_INDEX.map(
    (i): DuctRun => ({ path: trimStart(returnMain(i), DUCT.returnTrunk[1] / 2), size: DUCT.returnMain, build: returnMainBuild[i] }),
  ),
  ...GRILLES.map(
    ([x, y, z], k): DuctRun => ({
      path: neckPath(x, z, returnY(GRILLE_FLOOR[k]) - DUCT.returnMain[1] / 2, y, GRILLE_BOOT[1]),
      size: RETURN_NECK,
      build: () => ease(bim.story, COLLARS[k].neck),
    }),
  ),
];

/** Foil-faced insulation on the supply mains and laterals: a translucent sleeve, tape bands as the joints, the head as the wrap front. */
const WRAP_BANDS: FlangeSpec = { step: WRAP.step, depth: WRAP.depth, proud: WRAP.band, proudStart: WRAP.band, endClear: 0.3, minBody: 1 };
const WRAP_RUNS: DuctRun[] = FLOOR_INDEX.flatMap((i) =>
  wrapParts(i).map((p): DuctRun => ({ path: p.path, size: p.size, build: () => win(bim.story, p.window) })),
);

/* -------------------------------------------------------------- flows -- */

/** Metres between pulses on the mains. */
const PULSE_GAP = 2;
const mainCount = (path: V3[]) => Math.max(3, Math.round(polyLength(path) / PULSE_GAP));
/** Supply air runs once the floor's main and both its transitions are in. */
const supplyLive = (i: number) => Math.min(done(mainFront[i]()), done(win(bim.story, W_TRANSITION[i][1])));

const SUPPLY_STREAMS: Stream[] = FLOOR_INDEX.map((i) => {
  const path = supplyFlow(i);
  return { path, count: mainCount(path), gate: () => Math.min(running(H.run), supplyLive(i)) * inDuct() };
});
const RETURN_STREAMS: Stream[] = FLOOR_INDEX.map((i) => {
  const path = returnFlow(i);
  return { path, count: mainCount(path), gate: () => Math.min(running(H.run), done(returnMainBuild[i]())) * inDuct() };
});
/** Through the shoe, the VAV box and on down the lateral. */
const LATERAL_STREAMS: Stream[] = FLOOR_INDEX.flatMap((i) =>
  SUPPLY.lateralsX.map(
    (x, j): Stream => ({
      path: [
        [x, supplyY(i), shoeAt(i, x)[2]],
        [x, supplyY(i), SUPPLY.lateralEndZ],
      ],
      count: 3,
      gate: () => Math.min(running(H.run), done(lateralBuild[i][j]())) * inDuct(),
    }),
  ),
);

/** Conditioned-air throw: four-way off each diffuser, out along the ceiling, dropping as it slows. */
const THROW = { perDiffuser: 8, period: 2.6, reach: 1.5, drop: 1.25, size: 0.034 } as const;
const throwGate = () => running(H.run);

function Throw() {
  const per = bim.quality === "low" ? THROW.perDiffuser / 2 : THROW.perDiffuser;
  const place = useMemo(() => {
    const seed = Float32Array.from({ length: DIFFUSERS.length * per * 3 }, prng(0x7a11));
    return (i: number, t: number, out: THREE.Vector3) => {
      const d = (i / per) | 0;
      const g = win(bim.story, DROPS[d].diffuser);
      if (g <= 0) return 0;
      const s = i * 3;
      const p = DIFFUSERS[d];
      const a = ((i % 4) * Math.PI) / 2 + (seed[s] - 0.5) * 0.7;
      const u = fract(t / (THROW.period * (0.8 + 0.4 * seed[s + 1])) + seed[s + 2]);
      const r = SUPPLY.diffuser * 0.55 + u * THROW.reach;
      out.set(p[0] + Math.cos(a) * r, p[1] - 0.06 - THROW.drop * u ** 2.2, p[2] + Math.sin(a) * r);
      return THROW.size * Math.sqrt(Math.sin(Math.PI * u)) * g;
    };
  }, [per]);
  return <Particles count={DIFFUSERS.length * per} material={GLOW.supply} place={place} gate={throwGate} />;
}

/* --------------------------------------------------------------- RTU-1 -- */

/** Crane lift: starts `drop` m above the curb, hops once on the slings, then the rig unhooks and climbs out of frame. */
const CRANE = { drop: 11, bounce: 0.18, rise: 16, hook: 1.7, cable: 60 } as const;
/** Condenser fans on the coil end (unit-local x), spinning once the system runs. */
const FANS = { x: [-2.1, -1.05], r: 0.5, spin: 7 } as const;
const RAIL = 0.12;

function rtuParts() {
  const { w, d, h } = RTU;
  // louvred coil guards wrap the condenser end: south, north and west faces
  const coilX0 = -w / 2 + 0.1;
  const coilX1 = -w / 2 + 2.4;
  const coilC = (coilX0 + coilX1) / 2;
  const coilL = coilX1 - coilX0;
  const slats: THREE.BufferGeometry[] = [];
  for (let y = 0.32; y <= h - 0.2; y += 0.11) {
    slats.push(
      box(coilL, 0.035, 0.05, coilC, y, d / 2 + 0.025),
      box(coilL, 0.035, 0.05, coilC, y, -d / 2 - 0.025),
      box(0.05, 0.035, d - 0.24, -w / 2 - 0.025, y, 0),
    );
  }
  const doorsX = [0.3, 1.25, 2.2];
  const cabinet = () => box(w, h - RAIL, d, 0, RAIL + (h - RAIL) / 2, 0);
  const rail = () => box(w + 0.06, RAIL, d + 0.06, 0, RAIL / 2, 0);
  const doors = () => doorsX.map((x) => box(0.88, 1.3, 0.03, x, 0.95, d / 2 + 0.015));
  const shrouds = () => FANS.x.map((x) => cylinder(FANS.r, 0.14, x, h + 0.07, 0));
  const curb = () => box(w - 0.2, RTU.curb, d - 0.2, 0, RTU.curb / 2, 0);
  const hookY = h + CRANE.hook;
  const rig: number[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rig.push(0, hookY, 0, sx * (w / 2 - 0.25), h, sz * (d / 2 - 0.2));
  rig.push(0, hookY, 0, 0, h + CRANE.cable, 0);
  return {
    body: merge([cabinet(), ...doors(), ...shrouds()]),
    shade: merge([
      rail(),
      ...slats,
      ...FANS.x.map((x) => disc(FANS.r - 0.07, x, h + 0.15, 0)),
      ...doorsX.map((x) => box(0.05, 0.18, 0.05, x + 0.33, 0.95, d / 2 + 0.055)),
    ]),
    edges: outline([cabinet(), rail(), ...doors(), ...shrouds()]),
    blades: merge([...[0, 1, 2].map((k) => box(0.36, 0.02, 0.13, 0.21, 0, 0).rotateY((k * Math.PI * 2) / 3)), cylinder(0.07, 0.06)]),
    curb: curb(),
    curbEdges: outline([curb()]),
    rig: new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(rig, 3)),
    hook: box(0.22, 0.32, 0.22, 0, hookY + 0.16, 0),
  };
}

/** RTU-1 on its curb: cabinet, louvred coil guards, access doors, condenser fans — craned in during STORY.hvac.rtu. */
function Rtu() {
  const g = useParts(rtuParts);
  const curb = useRef<THREE.Group>(null);
  const unit = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const fanA = useRef<THREE.Mesh>(null);
  const fanB = useRef<THREE.Mesh>(null);
  const last = useRef(NaN);

  useFrame(() => {
    const spin = !bim.reduced && bim.story >= H.run ? bim.time * FANS.spin : 0;
    if (fanA.current) fanA.current.rotation.y = spin;
    if (fanB.current) fanB.current.rotation.y = spin * 0.94 + 0.5;

    const c = curb.current;
    const u = unit.current;
    const r = rig.current;
    if (!c || !u || !r || bim.story === last.current) return;
    last.current = bim.story;
    const t = win(bim.story, H.rtu);
    // the curb goes on first...
    const k = easeOutCubic(seg(t, 0, 0.16));
    c.visible = k > 0;
    c.scale.y = Math.max(k, 1e-3);
    // ...then the unit is lowered, touches down and settles with a hop on the slings
    const p = seg(t, 0.04, 0.78);
    const q = seg(t, 0.78, 1);
    const y = RTU_BASE + CRANE.drop * (1 - easeOutCubic(p)) + CRANE.bounce * Math.abs(Math.sin(Math.PI * 2 * q)) * (1 - q) ** 2;
    u.visible = t > 0.04;
    u.position.y = y;
    // the rig unhooks and climbs out of frame
    r.visible = t > 0.04 && t < 1;
    r.position.y = y + CRANE.rise * easeInCubic(seg(t, 0.86, 1));
  });

  return (
    <group>
      <group ref={curb} position={[RTU.cx, ROOF_Y, RTU.cz]} visible={false}>
        <mesh geometry={g.curb} material={MEP.equipmentShade} />
        <lineSegments geometry={g.curbEdges} material={MEP.edge} />
      </group>
      <group ref={unit} position={[RTU.cx, RTU_BASE, RTU.cz]} visible={false}>
        <mesh geometry={g.body} material={MEP.equipment} />
        <mesh geometry={g.shade} material={MEP.equipmentShade} />
        <lineSegments geometry={g.edges} material={MEP.edge} />
        <mesh ref={fanA} geometry={g.blades} material={MEP.equipment} position={[FANS.x[0], RTU.h + 0.17, 0]} />
        <mesh ref={fanB} geometry={g.blades} material={MEP.equipment} position={[FANS.x[1], RTU.h + 0.17, 0]} />
      </group>
      <group ref={rig} position={[RTU.cx, RTU_BASE, RTU.cz]} visible={false}>
        <lineSegments geometry={g.rig} material={MEP.edge} />
        <mesh geometry={g.hook} material={MEP.equipmentShade} />
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- tags -- */

/** Floor whose mains carry the SUPPLY AIR / RETURN AIR tags (L3). */
const TAG_FLOOR = 2;
const RTU_TAG: V3 = [RTU.cx + RTU.w / 2, RTU_BASE + RTU.h, RTU.cz + RTU.d / 2];
const SUPPLY_TAG: V3 = [1.5, supplyY(TAG_FLOOR) + DUCT.supplyMain[1] / 2 + WRAP.proud, SUPPLY.mainZ];
const RETURN_TAG: V3 = [-1, returnY(TAG_FLOOR) + DUCT.returnMain[1] / 2, RETURN.mainZ];
const rtuTag = tagShow(lerp(H.rtu[0], H.rtu[1], 0.8), HVAC_END);
const supplyTag = tagShow(W_SUPPLY[TAG_FLOOR][1], HVAC_END);
const returnTag = tagShow(W_RET[TAG_FLOOR][1], HVAC_END);

export default function Hvac() {
  return (
    <group>
      <Rtu />
      <Hangers />
      <RectDuct runs={SUPPLY_RUNS} material={MEP.supply} />
      <RectDuct runs={RETURN_RUNS} material={MEP.ret} />
      <Coordination />
      <Terminals at={GRILLES} face={RETURN.grille} boot={GRILLE_BOOT} appear={grilleAppear} />
      <RectDuct runs={WRAP_RUNS} material={MEP.wrap} flange={WRAP_BANDS} lines={false} />
      <MultiPulses streams={SUPPLY_STREAMS} speed={3.2} size={0.085} material={FLOW.supply} />
      <MultiPulses streams={RETURN_STREAMS} speed={3.2} size={0.085} material={FLOW.ret} />
      <MultiPulses streams={LATERAL_STREAMS} speed={2.2} size={0.065} material={FLOW.supply} />
      <Throw />
      <Tag position={RTU_TAG} show={rtuTag}>
        <Swatch kind="equipment" />
        RTU-1
      </Tag>
      <Tag position={SUPPLY_TAG} show={supplyTag}>
        <Swatch kind="supply" />
        SUPPLY AIR
      </Tag>
      <Tag position={RETURN_TAG} show={returnTag}>
        <Swatch kind="ret" />
        RETURN AIR
      </Tag>
    </group>
  );
}
