"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Edges, Line } from "@react-three/drei";
import {
  Arrive,
  BED,
  COLORS,
  CornerPiece,
  EDGE_OPACITY,
  F,
  FlangeFrame,
  GAP,
  GEO,
  Glow,
  H,
  L,
  MAT,
  Plate,
  Q,
  RET,
  RUN_Y,
  T,
  TC,
  Tag,
  TdcJoint,
  W,
  bandShape,
  extrudePlan,
  extrudeYZ,
  ringShape,
  sectionCorners,
  useBake,
  type P2,
  type V3,
} from "./parts";
import { AT, NOTE, flash, io, shop, shown } from "./sequence";

/**
 * The shop sequence in 3D — rectangular duct only. Section A is folded from a flat
 * blank (panels rotate about their hinge edges), its corner closed with a Pittsburgh
 * lock and its TDC flanges formed; then B, a square elbow with small turning vanes and
 * a transition join it, while a smaller duct shows an S&D joint. Every part reads
 * shop.p inside useFrame, so the whole thing is a pure function of scroll progress.
 *
 * Run frame: metres, section A centred on the origin, duct base at RUN_Y; the run
 * heads +x, and the elbow turns it toward -z.
 */

/* ---------------------------------------------------------------- layout -- */

/** Square elbow: the straight extension on each leg. */
const E = 0.1;
/** Inlet flange plane of the elbow. */
export const ELBOW_X = 1.5 * L + 2 * GAP;
/** The elbow's turning square, for the camera. */
export const ELBOW_C: V3 = [ELBOW_X + E + W / 2, RUN_Y + 0.12, 0];
/** The small S&D duct sits in front of the A|B joint. */
export const SD: V3 = [L / 2 + GAP / 2 + 0.02, RUN_Y, 0.86];
/** Centre of the finished run's footprint (x, z) — it turns about this in the last step. */
export const PIVOT: [number, number] = [0.97, -0.26];

/* ------------------------------------------------------------- the blank -- */

/** Pittsburgh lock, drawn about 1.5x real so it reads: pocket floor, wall, lip, and the male's 90° flange. */
const POCKET = 0.024;
const WALL = 0.012;
const LIP = 0.019;
const MALE = 0.018;

const MARK_Y = T / 2 + 0.0006;
/** The blank's end edge: flange and return laid flat. */
const END = L / 2 + F + RET;
const NOTCH = 0.014;

function marksFor(len: number, fold: boolean, notch: boolean) {
  const y = MARK_Y;
  const breaks: V3[] = [
    [L / 2, y, 0],
    [L / 2, y, -len],
    [-L / 2, y, 0],
    [-L / 2, y, -len],
  ];
  const foldLine: V3[] = fold
    ? [
        [-L / 2, y, -len],
        [L / 2, y, -len],
      ]
    : [];
  const cuts: V3[] = notch
    ? [1, -1].flatMap((s): V3[] => [
        [(s * L) / 2, y, -len],
        [s * END, y, -len - NOTCH],
        [(s * L) / 2, y, -len],
        [s * END, y, -len + NOTCH],
      ])
    : [];
  return { dashed: [...breaks, ...foldLine], cuts };
}

/** Fold and flange-break lines (dashed) and corner notches on one panel of the flat blank. */
function Marks({ len, fold, notch }: { len: number; fold: boolean; notch: boolean }) {
  const { dashed, cuts } = useMemo(() => marksFor(len, fold, notch), [len, fold, notch]);
  return (
    <>
      <Line name="mark" points={dashed} segments dashed dashSize={0.024} gapSize={0.014} color={COLORS.glow} lineWidth={1} transparent opacity={0} />
      {cuts.length > 0 && <Line name="mark" points={cuts} segments color={COLORS.notch} lineWidth={1} transparent opacity={0} />}
    </>
  );
}

/** One panel of the wrap in its own hinge frame, running z = 0 → -len, a TDC flange strip (and its return) laid flat past each end. */
function Panel({ len, fold = false, notch = false }: { len: number; fold?: boolean; notch?: boolean }) {
  return (
    <>
      <Plate size={[L, T, len]} position={[0, 0, -len / 2]} />
      {[1, -1].map((s) => (
        // the -x end is the +x end mirrored, so one rotation value forms both
        <group key={s} position={[(s * L) / 2, 0, 0]} scale={[s, 1, 1]}>
          <group name="flange">
            <Plate size={[F, T, len]} position={[F / 2, 0, -len / 2]} />
            <group name="ret" position={[F, 0, 0]}>
              <Plate size={[RET, T, len]} position={[RET / 2, 0, -len / 2]} />
            </group>
          </group>
        </group>
      ))}
      <Marks len={len} fold={fold} notch={notch} />
    </>
  );
}

/* ------------------------------------------------------- straight section -- */

/** How far each operation has gone, 0..1. */
type Form = { f1: number; f2: number; f3: number; male: number; wall: number; lip: number; flange: number; ret: number; corners: number; marks: number };

const FORMED: Form = { f1: 1, f2: 1, f3: 1, male: 1, wall: 1, lip: 1, flange: 1, ret: 1, corners: 1, marks: 0 };
const formed = () => FORMED;
const FORM_KEYS = Object.keys(FORMED) as (keyof Form)[];

/** Every operation finished: the section can draw from its baked copy. */
function isFormed(s: Form) {
  for (const k of FORM_KEYS) if (s[k] !== FORMED[k]) return false;
  return true;
}

/** Section A, made in front of you. */
const formA = (p: number): Form => ({
  f1: io(p, AT.fold1),
  f2: io(p, AT.fold2),
  f3: io(p, AT.fold3),
  male: io(p, AT.male),
  wall: io(p, AT.wall),
  lip: io(p, AT.lip),
  flange: io(p, AT.flange),
  ret: io(p, AT.ret),
  corners: io(p, AT.corners),
  marks: Math.min(io(p, AT.marksIn), 1 - io(p, AT.marksOut)),
});

type Found = Record<"flange" | "ret" | "corner" | "mark", THREE.Object3D[]>;
type CornerData = { y: number; z: number; sy: number; sz: number };
const FOUND_NAMES = new Set<string>(["flange", "ret", "corner", "mark"]);

const SEAM_GLOW = new THREE.BoxGeometry(L, WALL + 0.01, POCKET + 0.01);

const rotX = (g: THREE.Object3D | null, a: number) => {
  if (g) g.rotation.x = a;
};

/**
 * A 4 ft straight, folded as one wrap: the bottom panel stays on the bed and the
 * back side, top and front side fold up and over about their hinge edges. The
 * front side's male flange closes into the pocket on the bottom's front edge — the
 * Pittsburgh lock — then the end strips form TDC flanges and corner pieces go in.
 */
function Straight({ form, position }: { form: (p: number) => Form; position?: V3 }) {
  const root = useRef<THREE.Group>(null);
  const h1 = useRef<THREE.Group>(null);
  const h2 = useRef<THREE.Group>(null);
  const h3 = useRef<THREE.Group>(null);
  const male = useRef<THREE.Group>(null);
  const wall = useRef<THREE.Group>(null);
  const lip = useRef<THREE.Group>(null);
  const found = useRef<Found>({ flange: [], ret: [], corner: [], mark: [] });
  const { live, swap } = useBake();

  useLayoutEffect(() => {
    const next: Found = { flange: [], ret: [], corner: [], mark: [] };
    root.current?.traverse((o) => {
      if (FOUND_NAMES.has(o.name)) next[o.name as keyof Found].push(o);
    });
    found.current = next;
  }, []);

  useFrame(() => {
    const s = form(shop.p);
    rotX(h1.current, Q * s.f1);
    rotX(h2.current, Q * s.f2);
    rotX(h3.current, Q * s.f3);
    rotX(male.current, -Q * s.male);
    rotX(wall.current, -Q * s.wall);
    rotX(lip.current, -Q * s.lip);
    const { flange, ret, corner, mark } = found.current;
    for (const o of flange) o.rotation.z = -Q * s.flange;
    for (const o of ret) o.rotation.z = -Q * s.ret;
    const out = (1 - s.corners) * 0.12;
    for (const o of corner) {
      const c = o.userData as CornerData;
      o.visible = s.corners > 0;
      o.position.y = c.y + c.sy * out;
      o.position.z = c.z + c.sz * out;
    }
    for (const o of mark) {
      o.visible = s.marks > 0.005;
      ((o as THREE.Mesh).material as THREE.Material).opacity = 0.9 * s.marks;
    }
    // A from the moment its corner pieces are in; B (always formed) from the first frame
    swap(isFormed(s));
  });

  return (
    <group ref={root} position={position}>
      <group ref={live}>
        {/* bottom panel frame: origin on its front edge, panel running back to -W */}
        <group position={[0, 0, W / 2]}>
          <Panel len={W} fold notch />
          {/* Pittsburgh pocket on the front edge: the floor, then a wall and lip that close over the male flange */}
          <Plate size={[L, T, POCKET]} position={[0, 0, POCKET / 2]} />
          <group ref={wall} position={[0, 0, POCKET]}>
            <Plate size={[L, T, WALL]} position={[0, 0, WALL / 2]} />
            <group ref={lip} position={[0, 0, WALL]}>
              <Plate size={[L, T, LIP]} position={[0, 0, LIP / 2]} />
            </group>
          </group>
          <Line
            name="mark"
            points={[
              [-L / 2, MARK_Y, POCKET],
              [L / 2, MARK_Y, POCKET],
              [-L / 2, MARK_Y, POCKET + WALL],
              [L / 2, MARK_Y, POCKET + WALL],
            ]}
            segments
            dashed
            dashSize={0.024}
            gapSize={0.014}
            color={COLORS.glow}
            lineWidth={1}
            transparent
            opacity={0}
          />
          <group ref={h1} position={[0, 0, -W]}>
            <Panel len={H} fold notch />
            <group ref={h2} position={[0, 0, -H]}>
              <Panel len={W} fold notch />
              <group ref={h3} position={[0, 0, -W]}>
                {/* a sheet short, so its male flange lands on the pocket floor rather than in it */}
                <Panel len={H - T} fold />
                <group ref={male} position={[0, 0, -(H - T)]}>
                  <Plate size={[L, T, MALE]} position={[0, 0, -MALE / 2]} />
                </group>
              </group>
            </group>
          </group>
        </group>

        {[1, -1].flatMap((end) =>
          sectionCorners(W, H).map((c) => (
            <group
              key={`${end}${c.sy}${c.sz}`}
              name="corner"
              userData={{ y: c.y, z: c.z, sy: c.sy, sz: c.sz }}
              position={[end * (L / 2 - T / 2 - TC / 2), c.y, c.z]}
              rotation={[c.turn, 0, 0]}
              visible={false}
            >
              <CornerPiece />
            </group>
          )),
        )}
      </group>

      <Glow geometry={SEAM_GLOW} position={[0, WALL / 2, W / 2 + POCKET / 2]} amount={(p) => flash(p, AT.seamGlow)} />
      <Glow geometry={GEO.ringGlow} position={[L / 2, 0, 0]} amount={(p) => flash(p, AT.flangeGlow)} />
      <Glow geometry={GEO.ringGlow} position={[-L / 2, 0, 0]} amount={(p) => flash(p, AT.flangeGlow)} />
    </group>
  );
}

/* --------------------------------------------- square elbow, turning vanes -- */

const VANES = 20;
/** Small vanes: a tight radius, single wall, a short straight tail each end. */
const VANE_R = 0.05;
const VANE_TAIL = 0.02;
const RUNNER = 0.006;
const RUNNER_LEN = W * Math.SQRT2 - 0.04;
const LIFT = 0.32;

/** The elbow's cheek in plan: inlet leg along +x, outlet leg toward -z, square throat and heel. */
function cheekShape() {
  const s = new THREE.Shape();
  s.moveTo(0, W / 2);
  s.lineTo(E + W, W / 2);
  s.lineTo(E + W, -W / 2 - E);
  s.lineTo(E, -W / 2 - E);
  s.lineTo(E, -W / 2);
  s.lineTo(0, -W / 2);
  s.closePath();
  return s;
}

/** One small vane in plan, its chord midpoint at the origin: in along +x, a quarter turn, out along -z. */
function vaneShape() {
  const r = VANE_R;
  const pts: P2[] = [[-r / 2 - VANE_TAIL, r / 2]];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Q;
    pts.push([-r / 2 + r * Math.sin(a), -r / 2 + r * Math.cos(a)]);
  }
  pts.push([r / 2, -r / 2 - VANE_TAIL]);
  return bandShape(pts, 0.0016);
}

const ELBOW_GEO = {
  cheek: extrudePlan(cheekShape(), T),
  vane: extrudePlan(vaneShape(), H - 2 * RUNNER - 0.004),
};

/** Square elbow with small turning vanes in runners; the top cheek lifts away as a cutaway to show them. */
function Elbow() {
  const top = useRef<THREE.Group>(null);
  const vanes = useRef<THREE.InstancedMesh>(null);
  const { live, swap } = useBake();
  const ghost = useMemo(() => {
    const m = MAT.steel.clone();
    m.transparent = true;
    return m;
  }, []);
  const vaneMat = useMemo(() => {
    const m = MAT.steel.clone();
    m.emissive = new THREE.Color(COLORS.glow);
    m.emissiveIntensity = 0;
    return m;
  }, []);
  useEffect(
    () => () => {
      ghost.dispose();
      vaneMat.dispose();
    },
    [ghost, vaneMat],
  );

  // Vane chord midpoints sit on the miter line, throat (E, -W/2) to heel (E + W, W/2).
  useLayoutEffect(() => {
    const mesh = vanes.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let k = 0; k < VANES; k++) {
      const u = (k + 1) / (VANES + 1);
      mesh.setMatrixAt(k, m.makeTranslation(E + u * W, RUNNER + 0.002, -W / 2 + u * W));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    const cut = io(shop.p, AT.cutaway) * (1 - io(shop.p, AT.cutawayClose));
    if (top.current) top.current.position.y = LIFT * cut;
    ghost.opacity = 1 - 0.78 * cut;
    ghost.depthWrite = cut < 0.5;
    vaneMat.emissiveIntensity = 0.45 * cut;
    swap(true);
  });

  return (
    <>
      {/* the parts that never move draw from a baked copy; the lifting cheek and lit vanes stay live */}
      <group ref={live}>
        <FlangeFrame w={W} h={H} />
        <mesh geometry={ELBOW_GEO.cheek} material={MAT.steel} position={[0, -T / 2, 0]}>
          <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY} />
        </mesh>
        {/* heel (outer walls) and throat (inner walls) */}
        <Plate size={[E + W, H, T]} position={[(E + W) / 2, H / 2, W / 2]} />
        <Plate size={[T, H, W + E]} position={[E + W, H / 2, -E / 2]} />
        <Plate size={[E, H, T]} position={[E / 2, H / 2, -W / 2]} />
        <Plate size={[T, H, E]} position={[E, H / 2, -W / 2 - E / 2]} />
        <Plate size={[RUNNER_LEN, RUNNER, 0.03]} position={[E + W / 2, RUNNER / 2, 0]} rotation={[0, -Q / 2, 0]} />
        <group position={[E + W / 2, 0, -W / 2 - E]} rotation={[0, -Q, 0]}>
          <FlangeFrame w={W} h={H} />
        </group>
      </group>
      <instancedMesh ref={vanes} args={[ELBOW_GEO.vane, vaneMat, VANES]} frustumCulled={false} />
      <group ref={top}>
        <mesh geometry={ELBOW_GEO.cheek} material={ghost} position={[0, H - T / 2, 0]}>
          <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY + 0.1} />
        </mesh>
        <Plate size={[RUNNER_LEN, RUNNER, 0.03]} position={[E + W / 2, H - RUNNER / 2, 0]} rotation={[0, -Q / 2, 0]} material={ghost} />
      </group>
      <Tag position={[E + W / 2, H, 0]} show={(p) => shown(p, AT.tagVanes)} note={NOTE.elbow}>
        Turning vanes
      </Tag>
    </>
  );
}

/* ------------------------------------------------------------- transition -- */

/** Rectangular transition: 24 x 12 down to 16 x 10, flat on the bottom. */
const LT = 0.45;
const W2 = 0.4;
const H2 = 0.25;

function transitionGeometry() {
  const a: V3[] = [
    [0, 0, -W / 2],
    [0, 0, W / 2],
    [0, H, W / 2],
    [0, H, -W / 2],
  ];
  const b: V3[] = [
    [LT, 0, -W2 / 2],
    [LT, 0, W2 / 2],
    [LT, H2, W2 / 2],
    [LT, H2, -W2 / 2],
  ];
  const pos = [0, 1, 2, 3].flatMap((i) => {
    const j = (i + 1) % 4;
    return [...a[i], ...a[j], ...b[j], ...a[i], ...b[j], ...b[i]];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const TR_GEO = transitionGeometry();

/** Static from the start, so it draws from its baked copy from the first frame. */
function Transition() {
  const { live, swap } = useBake();
  useFrame(() => swap(true));
  return (
    <group ref={live}>
      <mesh geometry={TR_GEO} material={MAT.steel2}>
        <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY} />
      </mesh>
      <FlangeFrame w={W} h={H} />
      <group position={[LT, 0, 0]} scale={[-1, 1, 1]}>
        <FlangeFrame w={W2} h={H2} />
      </group>
    </group>
  );
}

/* ------------------------------------------------- S&D on a smaller duct -- */

/** A 12 x 8 in duct in short pieces, joined S&D: S slips top and bottom, drives down the sides. */
const WS = 0.3;
const HS = 0.2;
const LS = 0.42;
const SLIP_P = 0.026;
const SLIP_G = 0.0045;
const DRIVE_Q = 0.02;
const DRIVE_G = 0.004;
const TAB = 0.025;
const DRIVE_FOOT = 0.008;

/** The S slip's profile: three layers joined by a fold at each end — one pocket opens each way. */
function slipShape() {
  const p = SLIP_P;
  const g = SLIP_G;
  const r = g / 2;
  const pts: P2[] = [
    [p, g],
    [-p + r, g],
  ];
  for (let i = 1; i < 8; i++) {
    const a = Q + (i / 8) * Math.PI;
    pts.push([-p + r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  pts.push([-p + r, 0], [p - r, 0]);
  for (let i = 1; i < 8; i++) {
    const a = Q - (i / 8) * Math.PI;
    pts.push([p - r + r * Math.cos(a), -r + r * Math.sin(a)]);
  }
  pts.push([p - r, -g], [-p, -g]);
  return bandShape(pts, 0.0014);
}

const SD_GEO = {
  slip: new THREE.ExtrudeGeometry(slipShape(), { depth: WS + 0.004, bevelEnabled: false }).translate(0, 0, -(WS + 0.004) / 2),
  glow: extrudeYZ(ringShape(WS, HS, 0.016), 0.06),
};

/** An open rectangular tube of the small duct, from x0 to x0 + LS. */
function SmallTube({ x0 }: { x0: number }) {
  const cx = x0 + LS / 2;
  return (
    <>
      <Plate size={[LS, T, WS]} position={[cx, 0, 0]} />
      <Plate size={[LS, T, WS]} position={[cx, HS, 0]} />
      <Plate size={[LS, HS, T]} position={[cx, HS / 2, WS / 2]} />
      <Plate size={[LS, HS, T]} position={[cx, HS / 2, -WS / 2]} />
    </>
  );
}

function SlipDrive() {
  const root = useRef<THREE.Group>(null);
  const drives = useRef<THREE.Group>(null);
  const tabs = useRef<THREE.Group[]>([]);
  const webH = HS + TAB + DRIVE_FOOT;

  useFrame(() => {
    const p = shop.p;
    const s = io(p, AT.sdIn) * (1 - io(p, AT.sdOut));
    if (root.current) {
      root.current.visible = s > 0.001;
      root.current.scale.setScalar(Math.max(s, 0.001));
    }
    const d = io(p, AT.drives);
    if (drives.current) {
      drives.current.visible = d > 0;
      drives.current.position.y = (1 - d) * 0.3;
    }
    const t = io(p, AT.tabs);
    for (const tab of tabs.current) tab.rotation.x = Q * t;
  });

  return (
    <group ref={root} position={SD} visible={false}>
      <SmallTube x0={-LS} />
      <mesh geometry={SD_GEO.slip} material={MAT.steel} position={[0, HS, 0]}>
        <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY} />
      </mesh>
      <mesh geometry={SD_GEO.slip} material={MAT.steel} scale={[1, -1, 1]}>
        <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY} />
      </mesh>
      <Arrive during={AT.sdSlide} from={[0.4, 0, 0]}>
        <SmallTube x0={0} />
      </Arrive>
      <group ref={drives} visible={false}>
        {[1, -1].map((side, i) => (
          // the -z drive is the +z one mirrored
          <group key={side} scale={[1, 1, side]}>
            <Plate size={[2 * DRIVE_Q, webH, T]} position={[0, webH / 2 - DRIVE_FOOT, WS / 2 + DRIVE_G]} />
            <Plate size={[T, webH, DRIVE_G]} position={[DRIVE_Q - T / 2, webH / 2 - DRIVE_FOOT, WS / 2 + DRIVE_G / 2]} />
            <Plate size={[T, webH, DRIVE_G]} position={[-DRIVE_Q + T / 2, webH / 2 - DRIVE_FOOT, WS / 2 + DRIVE_G / 2]} />
            {/* the drive's tail, bent under once it is driven home */}
            <group
              ref={(g) => {
                if (g) tabs.current[i] = g;
              }}
              position={[0, -DRIVE_FOOT, WS / 2 + DRIVE_G]}
            >
              <Plate size={[2 * DRIVE_Q, TAB, T]} position={[0, -TAB / 2, 0]} />
            </group>
          </group>
        ))}
      </group>
      <Glow geometry={SD_GEO.glow} amount={(p) => flash(p, AT.sdGlow)} />
      <Tag position={[0, HS, WS / 2]} show={(p) => shown(p, AT.tagSd)} note={NOTE.joining}>
        {"S&D · Slip & drive"}
      </Tag>
    </group>
  );
}

/* ------------------------------------------------------------- brake bed -- */

/** The brake bed under the blank; it sinks into the floor once the section is formed. */
function Bed() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = io(shop.p, AT.bedOut);
    g.visible = k < 1;
    g.scale.y = Math.max(1 - k, 0.001);
  });
  return (
    <group ref={ref}>
      <Plate size={[1.1, BED, 2.1]} position={[0, BED / 2, -0.6]} material={MAT.bed} />
    </group>
  );
}

/* ---------------------------------------------------------------- the run -- */

/**
 * The finished run turns slowly back and forth: amplitude (rad) and rate (rad of phase per
 * second). The phase is shop.t, which the rig holds still while motion is paused.
 */
const SPIN = 0.6;
const SPIN_RATE = 0.35;

export function DuctRun({ reduce }: { reduce: boolean }) {
  const spin = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!spin.current) return;
    const w = reduce ? 0 : io(shop.p, AT.spin);
    spin.current.rotation.y = w * SPIN * Math.sin(shop.t * SPIN_RATE);
  });

  return (
    <>
      <Bed />
      <group ref={spin} position={[PIVOT[0], 0, PIVOT[1]]}>
        <group position={[-PIVOT[0], 0, -PIVOT[1]]}>
          <Straight form={formA} position={[0, RUN_Y, 0]} />
          <group position={[L / 2 + GAP / 2, RUN_Y, 0]}>
            <TdcJoint gasket={AT.gasketAB} bolts={AT.boltsAB} glowAt={AT.abGlow} />
          </group>
          <Arrive during={AT.slideB} from={[1.4, 0, 0]} position={[L + GAP, RUN_Y, 0]}>
            <Straight form={formed} />
          </Arrive>
          <group position={[1.5 * L + 1.5 * GAP, RUN_Y, 0]}>
            <TdcJoint gasket={AT.gasketElbow} bolts={AT.boltsElbow} glowAt={AT.elbowGlow} />
          </group>
          <Arrive during={AT.slideElbow} from={[0.9, 0.22, 0]} position={[ELBOW_X, RUN_Y, 0]}>
            <Elbow />
            {/* the outlet joint faces -z: rotate the joint's +x (the arriving side) onto -z */}
            <group position={[E + W / 2, 0, -W / 2 - E - GAP / 2]} rotation={[0, Q, 0]}>
              <TdcJoint gasket={AT.gasketTr} bolts={AT.boltsTr} glowAt={AT.trGlow} />
            </group>
            <group position={[E + W / 2, 0, -W / 2 - E - GAP]} rotation={[0, Q, 0]}>
              <Arrive during={AT.slideTr} from={[0.7, 0, 0]}>
                <Transition />
              </Arrive>
            </group>
          </Arrive>

          <Tag position={[0.18, RUN_Y + 0.002, -0.78]} show={(p) => shown(p, AT.tagBlank)} note={NOTE.blank}>
            Galvanized blank
          </Tag>
          <Tag position={[0.35, RUN_Y + H, -W / 2]} show={(p) => shown(p, AT.tagFold)} note={NOTE.folds}>
            {"Brake fold · 90°"}
          </Tag>
          <Tag position={[0.12, RUN_Y + WALL, W / 2 + POCKET]} show={(p) => shown(p, AT.tagSeam)} note={NOTE.pittsburgh}>
            Pittsburgh lock
          </Tag>
          <Tag position={[L / 2, RUN_Y + H + F, W / 2 + F / 2]} show={(p) => shown(p, AT.tagTdc)} note={NOTE.tdc}>
            TDC flange
          </Tag>
          <Tag position={[L / 2 + GAP / 2, RUN_Y + H + F / 2, W / 2 + F / 2]} show={(p) => shown(p, AT.tagGasket)} note={NOTE.joining}>
            {"Gasket · corner bolts"}
          </Tag>
          <Tag position={[L + GAP, RUN_Y + H + F + 0.02, 0]} show={(p) => shown(p, AT.tagDone)} note={NOTE.finished}>
            Fabricated in South San Francisco
          </Tag>
        </group>
      </group>
      <SlipDrive />
    </>
  );
}
