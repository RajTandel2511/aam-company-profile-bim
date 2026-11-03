"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { clamp, easeOutCubic, lerp, prng, seg } from "@/lib/timing";
import {
  DUCT,
  EXHAUST,
  FLOORS,
  OA,
  ROOF_FANS,
  ROOF_Y,
  exhaustBranch,
  exhaustFlow,
  exhaustGrilles,
  exhaustRiser,
  exhaustY,
  oaFlow,
  type V3,
} from "../geometry";
import { Pulses, Tag, polyLength } from "../kit";
import { GLOW, MEP } from "../materials";
import { bim } from "../store";
import { STORY, arrive, ease, stagger, win, type Window } from "../timeline";
import { RectDuct, extendEnd, trimStart, type DuctRun } from "./duct";
import { W_ROOF_FANS } from "./air/layout";
import {
  FLOOR_INDEX,
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
  smoothstep,
  sub,
  tagShow,
  useParts,
} from "./air/parts";

/**
 * Chapter 03 — EXHAUST & OUTSIDE AIR. The restroom exhaust riser climbs the
 * north-east corner, branches run out floor by floor (bottom-up, chasing the
 * riser) to their ceiling grilles, and EF-1 drops onto its roof curb, then the
 * two smaller roof fans EF-2 and EF-3. The outside-air hood extrudes from
 * RTU-1's east face. From the run mark exhaust pulses up the riser and leaves
 * EF-1 as a plume (EF-2 / EF-3 trail faint ones) while fresh air streams into
 * the hood. Pure function of bim.story; ambient motion runs on bim.time.
 */

const X = STORY.exhaust;
const F = EXHAUST;
const EXHAUST_END = chapterEnd("exhaust");
const FAN_BASE = ROOF_Y + F.fanCurb;
const FAN_TOP = FAN_BASE + F.fanH;

/* ------------------------------------------------------------ schedule -- */

/** Floors build bottom-up, following the riser as it climbs. */
const W_BRANCH = FLOOR_INDEX.map((i) => stagger(X.branches, i, FLOORS));
const W_GRILLES = FLOOR_INDEX.map((i) => stagger(X.grilles, i, FLOORS));
const branchBuild = FLOOR_INDEX.map((i) => () => ease(bim.story, W_BRANCH[i]));

/* ---------------------------------------------------------- ductwork -- */

const GRILLE_FACE = [F.grille, F.grille] as const;
const GRILLE_BOOT = [0.36, 0.1, 0.36] as const;
const GRILLE_NECK = [0.3, 0.3] as const;
/** Branches run on past the end grille so its neck lands fully under the duct. */
const BRANCH_TAIL = 0.25;
/** The riser starts under the L1 branch so the takeoff reads as a square elbow. */
const RISER_BOOT = 0.05;

const GRILLES = FLOOR_INDEX.flatMap((i) => exhaustGrilles(i));
const GRILLE_FLOOR = FLOOR_INDEX.flatMap((i) => exhaustGrilles(i).map(() => i));
/** The grille at the branch end waits for the branch to reach it. */
const lag = (k: number) => (GRILLES[k][0] === F.branchEndX ? 0.2 : 0);
const W_NECK = GRILLES.map((_, k) => sub(W_GRILLES[GRILLE_FLOOR[k]], lag(k), lag(k) + 0.6));
const W_GRILLE = GRILLES.map((_, k) => sub(W_GRILLES[GRILLE_FLOOR[k]], lag(k) + 0.45, lag(k) + 0.8));
const grilleAppear = (k: number) => win(bim.story, W_GRILLE[k]);

const RUNS: DuctRun[] = [
  { path: trimStart(exhaustRiser, -(DUCT.exhaustBranch[1] / 2 + RISER_BOOT)), size: DUCT.exhaustRiser, build: () => ease(bim.story, X.riser) },
  ...FLOOR_INDEX.map(
    (i): DuctRun => ({
      path: extendEnd(trimStart(exhaustBranch(i), DUCT.exhaustRiser[0] / 2), BRANCH_TAIL),
      size: DUCT.exhaustBranch,
      build: branchBuild[i],
    }),
  ),
  ...GRILLES.map(
    ([x, y, z], k): DuctRun => ({
      path: neckPath(x, z, exhaustY(GRILLE_FLOOR[k]) - DUCT.exhaustBranch[1] / 2, y, GRILLE_BOOT[1]),
      size: GRILLE_NECK,
      build: () => ease(bim.story, W_NECK[k]),
    }),
  ),
];

/* -------------------------------------------------------------- flows -- */

/** Exhaust pulses ride exhaustFlow up to EF-1's discharge, where the plume takes over. */
const FLOWS = FLOOR_INDEX.map((i) => {
  const p = exhaustFlow(i);
  const end = p[p.length - 1];
  const path: V3[] = [...p.slice(0, -1), [end[0], FAN_TOP, end[2]]];
  return {
    key: `e${i}`,
    path,
    count: Math.max(3, Math.round(polyLength(path) / 2)),
    speed: 2.8,
    size: 0.075,
    material: FLOW.exhaust,
    gate: () => Math.min(running(X.run), done(branchBuild[i]())) * inDuct(),
  };
});

/** Discharge plume: rising, spreading, drifting a little downwind, gone by EXHAUST.plumeTop. */
const PLUME = { count: 44, period: 2.6, spread: 1.1, drift: 0.8, size: 0.09 } as const;
const plumeGate = () => running(X.run);

function Plume() {
  const n = bim.quality === "low" ? PLUME.count / 2 : PLUME.count;
  const place = useMemo(() => {
    const seed = Float32Array.from({ length: n * 4 }, prng(0xef1));
    return (i: number, t: number, out: THREE.Vector3) => {
      const s = i * 4;
      const u = fract(t / (PLUME.period * (0.85 + 0.3 * seed[s])) + seed[s + 1]);
      const r = F.fanR * 0.55 * Math.sqrt(seed[s + 2]) + u * PLUME.spread;
      const a = seed[s + 3] * Math.PI * 2 + u * 1.4;
      out.set(
        F.riserX + Math.cos(a) * r + u * u * PLUME.drift,
        FAN_TOP + 0.06 + u * (F.plumeTop - FAN_TOP),
        F.riserZ + Math.sin(a) * r,
      );
      return PLUME.size * Math.min(1, u / 0.08) * (1 - u) ** 1.3;
    };
  }, [n]);
  return <Particles count={n} material={GLOW.exhaust} place={place} gate={plumeGate} />;
}

/** Fresh air drawn in off the open roof along oaFlow, converging on the hood's louvres. */
const INTAKE = { count: 36, speed: 1.4, size: 0.05 } as const;
const OA_FROM = oaFlow[0];
const OA_TO = oaFlow[oaFlow.length - 1];
const OA_LEN = Math.abs(OA_FROM[0] - OA_TO[0]);
const intakeGate = () => Math.min(running(X.run), done(arrive(bim.story, X.oa)));

function Intake() {
  const n = bim.quality === "low" ? INTAKE.count / 2 : INTAKE.count;
  const place = useMemo(() => {
    const seed = Float32Array.from({ length: n * 4 }, prng(0x0a1));
    return (i: number, t: number, out: THREE.Vector3) => {
      const s = i * 4;
      const u = fract((t * INTAKE.speed * (0.85 + 0.3 * seed[s])) / OA_LEN + seed[s + 1]);
      const taper = 1 - 0.45 * smoothstep(u);
      out.set(
        lerp(OA_FROM[0], OA_TO[0], u),
        OA_FROM[1] + (seed[s + 2] - 0.5) * 1.5 * taper + 0.05 * Math.sin(t * 2.3 + seed[s] * Math.PI * 2),
        OA_FROM[2] + (seed[s + 3] - 0.5) * 2.4 * taper,
      );
      return INTAKE.size * clamp(Math.min(u / 0.15, (1 - u) / 0.1));
    };
  }, [n]);
  return <Particles count={n} material={GLOW.exhaust} place={place} gate={intakeGate} />;
}

/* ------------------------------------------------------ roof exhaust fans -- */

/** Up-blast fan proportions (fractions of the fan's height / radius); the rotor spins once exhaust runs. */
const FAN = { bounce: 0.12, spin: 7, base: 0.06, housing: 0.52, band: 1.06 } as const;

type FanSpec = {
  x: number;
  z: number;
  r: number;
  curb: number;
  h: number;
  /** drop onto the curb inside this story window, from `drop` m above */
  window: Window;
  drop: number;
  /** rotor spins (and the plume runs) from here */
  spinFrom: number;
  spin: number;
};

const EF1: FanSpec = { x: F.riserX, z: F.riserZ, r: F.fanR, curb: F.fanCurb, h: F.fanH, window: X.fan, drop: 6, spinFrom: X.run, spin: FAN.spin };
/** EF-2, EF-3: smaller fans on their own curbs, running once landed (and once exhaust runs). */
const SMALL_FANS: FanSpec[] = ROOF_FANS.map((f, k) => ({
  x: f.x,
  z: f.z,
  r: f.r,
  curb: f.curb,
  h: f.h,
  window: W_ROOF_FANS[k],
  drop: 4,
  spinFrom: Math.max(X.run, W_ROOF_FANS[k][1]),
  spin: FAN.spin * 1.3,
}));
const FANS = [EF1, ...SMALL_FANS];

function fanParts({ r, curb: curbH, h }: FanSpec) {
  const k = r / F.fanR;
  const plateW = 2 * r + 0.1;
  const housingH = h * FAN.housing;
  const bandR = r * FAN.band;
  const bandH = h - FAN.base - housingH;
  const plate = () => box(plateW - 0.04, FAN.base, plateW - 0.04, 0, FAN.base / 2, 0);
  const housing = () => cylinder(r, housingH, 0, FAN.base + housingH / 2, 0);
  const windband = () => cylinder(bandR, bandH, 0, h - bandH / 2, 0);
  const curb = () => box(plateW, curbH, plateW, 0, curbH / 2, 0);
  const blades = Array.from({ length: 6 }, (_, b) =>
    box(r * 0.62, 0.025, 0.16 * k, r * 0.42, 0, 0)
      .rotateX(0.35)
      .rotateY((b * Math.PI) / 3),
  );
  return {
    body: merge([plate(), housing(), windband()]),
    /** the dark discharge opening inside the windband */
    shade: disc(bandR - 0.07 * k, 0, h + 0.01, 0),
    edges: outline([plate(), housing(), windband()]),
    rotor: merge([...blades, cylinder(0.2 * r, 0.12 * (h / F.fanH))]),
    curb: curb(),
    curbEdges: outline([curb()]),
  };
}
/** One stable maker per fan, for useParts. */
const FAN_PARTS = FANS.map((spec) => () => fanParts(spec));

function ExhaustFan({ spec, make }: { spec: FanSpec; make: () => ReturnType<typeof fanParts> }) {
  const g = useParts(make);
  const curb = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Mesh>(null);
  const last = useRef(NaN);
  const base = ROOF_Y + spec.curb;

  useFrame(() => {
    if (rotor.current) rotor.current.rotation.y = !bim.reduced && bim.story >= spec.spinFrom ? bim.time * spec.spin : 0;
    const c = curb.current;
    const f = fan.current;
    if (!c || !f || bim.story === last.current) return;
    last.current = bim.story;
    const t = win(bim.story, spec.window);
    const k = easeOutCubic(seg(t, 0, 0.2));
    c.visible = k > 0;
    c.scale.y = Math.max(k, 1e-3);
    const p = seg(t, 0.12, 0.8);
    const q = seg(t, 0.8, 1);
    f.visible = t > 0.12;
    f.position.y = base + spec.drop * (1 - easeOutCubic(p)) + FAN.bounce * Math.abs(Math.sin(Math.PI * 2 * q)) * (1 - q) ** 2;
  });

  return (
    <group>
      <group ref={curb} position={[spec.x, ROOF_Y, spec.z]} visible={false}>
        <mesh geometry={g.curb} material={MEP.equipmentShade} />
        <lineSegments geometry={g.curbEdges} material={MEP.edge} />
      </group>
      <group ref={fan} position={[spec.x, base, spec.z]} visible={false}>
        <mesh geometry={g.body} material={MEP.equipment} />
        <mesh geometry={g.shade} material={MEP.equipmentShade} />
        <lineSegments geometry={g.edges} material={MEP.edge} />
        <mesh ref={rotor} geometry={g.rotor} material={MEP.equipment} position={[0, spec.h + 0.05, 0]} />
      </group>
    </group>
  );
}

/** Faint plumes off EF-2 / EF-3: fewer, smaller motes, each fan's only once it runs. */
const SMALL_PLUME = { count: 14, period: 2.2, rise: 3.2, spread: 0.55, drift: 0.5, size: 0.05 } as const;
const SMALL_RUN = Math.min(...SMALL_FANS.map((f) => f.spinFrom));
const smallPlumeGate = () => running(SMALL_RUN);

function SmallPlumes() {
  const per = bim.quality === "low" ? SMALL_PLUME.count / 2 : SMALL_PLUME.count;
  const place = useMemo(() => {
    const seed = Float32Array.from({ length: SMALL_FANS.length * per * 4 }, prng(0xef23));
    return (i: number, t: number, out: THREE.Vector3) => {
      const f = SMALL_FANS[(i / per) | 0];
      const s = i * 4;
      const u = fract(t / (SMALL_PLUME.period * (0.85 + 0.3 * seed[s])) + seed[s + 1]);
      const r = f.r * 0.5 * Math.sqrt(seed[s + 2]) + u * SMALL_PLUME.spread;
      const a = seed[s + 3] * Math.PI * 2 + u * 1.4;
      out.set(f.x + Math.cos(a) * r + u * u * SMALL_PLUME.drift, ROOF_Y + f.curb + f.h + 0.06 + u * SMALL_PLUME.rise, f.z + Math.sin(a) * r);
      return SMALL_PLUME.size * Math.min(1, u / 0.08) * (1 - u) ** 1.3 * running(f.spinFrom);
    };
  }, [per]);
  return <Particles count={SMALL_FANS.length * per} material={GLOW.exhaust} place={place} gate={smallPlumeGate} />;
}

/* ------------------------------------------------------ outside-air hood -- */

function hoodParts() {
  const { depth: dp, height: ht, width: wd } = OA;
  const t = 0.035;
  // rain-shedding louvre blades across the open front
  const blades = Array.from({ length: 7 }, (_, k) =>
    box(0.15, 0.022, wd, 0, 0, 0)
      .rotateZ(-0.6)
      .translate(dp - 0.07, -ht / 2 + 0.1 + (k * (ht - 0.2)) / 6, 0),
  );
  return {
    body: merge([
      box(dp, t, wd + 2 * t, dp / 2, ht / 2 - t / 2, 0),
      box(dp, t, wd + 2 * t, dp / 2, -ht / 2 + t / 2, 0),
      box(dp, ht, t, dp / 2, 0, wd / 2 + t / 2),
      box(dp, ht, t, dp / 2, 0, -wd / 2 - t / 2),
    ]),
    shade: merge(blades),
    edges: outline([box(dp, ht, wd + 2 * t, dp / 2, 0, 0)]),
  };
}

/** Louvred outside-air hood on RTU-1's east face — extrudes out of the face during STORY.exhaust.oa. */
function OaHood() {
  const g = useParts(hoodParts);
  const hood = useRef<THREE.Group>(null);
  const last = useRef(NaN);

  useFrame(() => {
    const h = hood.current;
    if (!h || bim.story === last.current) return;
    last.current = bim.story;
    const k = arrive(bim.story, X.oa);
    h.visible = k > 0;
    h.scale.x = Math.max(k, 1e-3);
  });

  return (
    <group ref={hood} position={[OA.x, OA.y, OA.z]} visible={false}>
      <mesh geometry={g.body} material={MEP.equipment} />
      <mesh geometry={g.shade} material={MEP.equipmentShade} />
      <lineSegments geometry={g.edges} material={MEP.edge} />
    </group>
  );
}

/* ---------------------------------------------------------------- tags -- */

const EF_TAG: V3 = [F.riserX + F.fanR * FAN.band, FAN_TOP, F.riserZ];
const OA_TAG: V3 = [OA.x + OA.depth, OA.y + OA.height / 2, OA.z + OA.width / 2];
const efTag = tagShow(lerp(X.fan[0], X.fan[1], 0.8), EXHAUST_END);
const oaTag = tagShow(X.oa[1], EXHAUST_END);

export default function Exhaust() {
  return (
    <group>
      <RectDuct runs={RUNS} material={MEP.exhaust} />
      <Terminals at={GRILLES} face={GRILLE_FACE} boot={GRILLE_BOOT} appear={grilleAppear} />
      {FANS.map((spec, k) => (
        <ExhaustFan key={k} spec={spec} make={FAN_PARTS[k]} />
      ))}
      <OaHood />
      {FLOWS.map(({ key, ...flow }) => (
        <Pulses key={key} {...flow} />
      ))}
      <Plume />
      <SmallPlumes />
      <Intake />
      <Tag position={EF_TAG} show={efTag}>
        <Swatch kind="equipment" />
        EF-1
      </Tag>
      <Tag position={OA_TAG} show={oaTag}>
        <Swatch kind="exhaust" />
        OUTSIDE AIR
      </Tag>
    </group>
  );
}
