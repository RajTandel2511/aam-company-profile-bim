"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useFrame } from "@react-three/fiber";
import { Edges, Html } from "@react-three/drei";
import { bake } from "./bake";
import { flash, io, shop, type Span } from "./sequence";

/**
 * Shop-scene kit: dimensions, materials, profile geometry and the parts every
 * piece of duct shares — plates with BIM edge lines, TDC flange frames, joints,
 * seam glows and tags — plus the bake that merges a finished fitting into a few
 * draw calls. Client-only (it creates three.js objects at import) and
 * loaded only through ShopStage (next/dynamic, ssr: false). Deliberately separate
 * from components/bim, the main stage's private world.
 */

export type V3 = [number, number, number];

/* ---------------------------------------------------- dimensions, metres -- */

/** A typical 24 x 12 in duct in 4 ft sections. */
export const W = 0.6;
export const H = 0.3;
export const L = 1.2;
/** Sheet thickness — drawn heavier than real gauge so the edges read on screen. */
export const T = 0.0025;
/** TDC flange leg and return; corner-piece plate and leg. */
export const F = 0.035;
export const RET = 0.012;
export const TC = 0.004;
export const LEG = 0.07;
export const GASKET = 0.003;
/** Flange plate centre to flange plate centre across a made-up TDC joint. */
export const GAP = T + GASKET;
/** Brake bed top; the duct keeps this elevation once it leaves the brake. */
export const BED = 0.3;
export const RUN_Y = BED + T / 2;
export const Q = Math.PI / 2;

/** Detail-sheet palette: galvanized steel stays steel grey; the drawing on it is cyan, amber and violet. */
export const COLORS = {
  /** the page void — three doesn't tone-map a colour background, so the canvas meets its frame without a seam */
  bg: "#04070D",
  steel: "#C3CAD1",
  zinc: "#A3ACB5",
  /** BIM linework */
  edge: "#38E1FF",
  gasket: "#0B1220",
  bed: "#111B2E",
  /** drafting cyan: fold and break lines, the lit vanes, the cool rim light */
  glow: "#38E1FF",
  /** the flash as a seam or joint closes */
  seam: "#FFB547",
  /** cut / notch lines on the blank (violet: the set's detail linework) */
  notch: "#8B7CFF",
  // dark on purpose: ACES tone mapping lifts these to a faint navy cell and a cyan major line
  gridCell: "#1A2E4A",
  gridSection: "#11607A",
} as const;

/** Edge-line opacity. Live <Edges> and the baked copy share it, or a fitting would visibly change as it bakes. */
export const EDGE_OPACITY = 0.5;

/* ------------------------------------------------------------ materials -- */

// polygonOffset pushes faces back a hair so the edge lines draw cleanly on top.
const solid = (color: string, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...extra });

export const MAT = {
  /** galvanized steel */
  steel: solid(COLORS.steel, 0.35, 0.8),
  /** galvanized, single-surface parts (the transition) */
  steel2: solid(COLORS.steel, 0.35, 0.8, { side: THREE.DoubleSide }),
  /** corner pieces and bolts */
  zinc: solid(COLORS.zinc, 0.3, 0.85),
  gasket: solid(COLORS.gasket, 0.8, 0.05),
  bed: solid(COLORS.bed, 0.6, 0.4),
  hole: new THREE.MeshBasicMaterial({ color: "#05070A" }),
};

/* -------------------------------------------------------- profile geometry -- */

export type P2 = [number, number];

/** A polyline thickened into a closed band `t` wide — sheet-metal profiles (vanes, slips). */
export function bandShape(pts: P2[], t: number): THREE.Shape {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (t / 2);
    const ny = ((bx - ax) / len) * (t / 2);
    left.push(new THREE.Vector2(x + nx, y + ny));
    right.push(new THREE.Vector2(x - nx, y - ny));
  });
  return new THREE.Shape([...left, ...right.reverse()]);
}

/** A shape drawn in a cross-section (u → z, v → y), extruded `depth` along x, centred on x = 0. */
export function extrudeYZ(shape: THREE.Shape, depth: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.rotateY(-Q);
  g.translate(depth / 2, 0, 0);
  return g;
}

/** A shape drawn in plan (u → x, v → z), extruded `depth` up from y = 0. */
export function extrudePlan(shape: THREE.Shape, depth: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.rotateX(Q);
  g.translate(0, depth, 0);
  return g;
}

/** A rectangular ring `band` wide round a w x h section (base y = 0, centred on z), as a cross-section shape. */
export function ringShape(w: number, h: number, band: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - band, -band);
  s.lineTo(w / 2 + band, -band);
  s.lineTo(w / 2 + band, h + band);
  s.lineTo(-w / 2 - band, h + band);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, 0);
  hole.lineTo(-w / 2, h);
  hole.lineTo(w / 2, h);
  hole.lineTo(w / 2, 0);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

/** TDC corner piece: an L hugging the outside of a duct corner (corner at the origin, outward = +u +v). */
function cornerShape() {
  const s = new THREE.Shape();
  s.moveTo(-LEG, 0);
  s.lineTo(0, 0);
  s.lineTo(0, -LEG);
  s.lineTo(F, -LEG);
  s.lineTo(F, F);
  s.lineTo(-LEG, F);
  s.closePath();
  return s;
}

export const GEO = {
  corner: extrudeYZ(cornerShape(), TC),
  hole: new THREE.CylinderGeometry(0.0045, 0.0045, TC * 1.6, 12).rotateZ(Q),
  head: new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 6).rotateZ(Q),
  shank: new THREE.CylinderGeometry(0.0035, 0.0035, 1, 8).rotateZ(Q),
  gasket: extrudeYZ(ringShape(W, H, F * 0.9), GASKET),
  /** the flash round a W x H flange or joint */
  ringGlow: extrudeYZ(ringShape(W, H, F + 0.012), 0.012),
};

/* ------------------------------------------------------------------- parts -- */

type PlateProps = { size: V3; position?: V3; rotation?: V3; material?: THREE.Material };

/**
 * A flat piece of sheet with BIM linework on its edges: one mesh + one Edges draw call
 * while it is moving. Finished fittings draw from a baked copy instead (useBake below).
 */
export function Plate({ size, position, rotation, material = MAT.steel }: PlateProps) {
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <boxGeometry args={size} />
      <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ baking -- */

/** Only the shared kit materials bake; glows, the elbow's ghost cheek and lit vanes keep their own and stay live. */
const BAKES = new Set<THREE.Material>(Object.values(MAT));
/** Linework for every baked fitting, matching <Plate>'s edges. LineSegments2 sets its resolution at each draw. */
const EDGE_MAT = new LineMaterial({ color: COLORS.edge, transparent: true, opacity: EDGE_OPACITY, linewidth: 1 });

/**
 * Swaps a fitting's live parts for a baked copy whenever `done`: one mesh per material and
 * one edge-line object instead of two draw calls per plate (~350 calls with the whole run
 * built, ~30 once it is finished). Put the parts in `<group ref={live}>` with no transform
 * of its own and call `swap(done)` from useFrame after posing them; glows and tags stay
 * outside that group and keep animating. The copy is baked the first time `done` holds,
 * so `done` must mean posed for good — scrolling back simply shows the live parts again.
 */
export function useBake() {
  const live = useRef<THREE.Group>(null);
  const baked = useRef<THREE.Group | null>(null);
  useEffect(
    () => () => {
      const b = baked.current;
      if (!b) return;
      b.removeFromParent();
      b.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
    [],
  );
  const swap = (done: boolean) => {
    const g = live.current;
    if (!g?.parent) return;
    if (done && !baked.current) {
      baked.current = bake(g, BAKES, EDGE_MAT);
      g.parent.add(baked.current);
    }
    const b = baked.current;
    g.visible = !(done && b);
    if (b) b.visible = done;
  };
  return { live, swap };
}

/** Holds its children hidden until `during`, then slides them in from the offset `from` to rest at `position`. */
export function Arrive({ during, from, position = [0, 0, 0], children }: { during: Span; from: V3; position?: V3; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = io(shop.p, during);
    g.visible = k > 0;
    const u = 1 - k;
    g.position.set(position[0] + from[0] * u, position[1] + from[1] * u, position[2] + from[2] * u);
  });
  return (
    <group ref={ref} position={position} visible={false}>
      {children}
    </group>
  );
}

type GlowProps = { geometry: THREE.BufferGeometry; amount: (p: number) => number; position?: V3; rotation?: V3 };

/** The bright seam highlight (amber): additive, unlit, shown only while `amount` > 0. */
export function Glow({ geometry, amount, position, rotation }: GlowProps) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(COLORS.seam).multiplyScalar(1.8),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const a = amount(shop.p);
    mat.opacity = a * 0.85;
    if (ref.current) ref.current.visible = a > 0.004;
  });
  return <mesh ref={ref} geometry={geometry} material={mat} position={position} rotation={rotation} visible={false} />;
}

type TagProps = {
  position: V3;
  show: (p: number) => number;
  /** keynote number (sequence.ts NOTE): ties the tag to its row in the section's keynote legend */
  note?: string;
  children: ReactNode;
};

/** Revit-style element tag: a point marker, a 45° leader and a keynoted mono label. Opacity is set per frame, never via state. */
export function Tag({ position, show, note, children }: TagProps) {
  const el = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const node = el.current;
    if (!node) return;
    const o = show(shop.p);
    node.style.opacity = o.toFixed(3);
    node.style.visibility = o < 0.01 ? "hidden" : "visible";
  });
  const o = show(shop.p);
  return (
    <Html position={position} zIndexRange={[20, 0]} pointerEvents="none">
      <div ref={el} aria-hidden="true" className="relative" style={{ opacity: o, visibility: o < 0.01 ? "hidden" : "visible" }}>
        <span className="absolute -left-1 -top-1 h-2 w-2 rotate-45 border border-cyan bg-void" />
        <span className="absolute left-0 top-0 h-px w-7 origin-left -rotate-45 bg-cyan/60" />
        <span className="bim-tag absolute bottom-[19px] left-[19px] border-cyan/40">
          {note ? <span className="border-r border-cyan/40 pr-1.5 text-cyan">{note}</span> : <span className="h-1.5 w-1.5 bg-cyan" />}
          {children}
        </span>
      </div>
    </Html>
  );
}

/* ------------------------------------------------------------- TDC flanges -- */

const CORNER_TURN: Record<string, number> = { "1,1": 0, "-1,1": Q, "-1,-1": 2 * Q, "1,-1": -Q };

/** The four corners of a w x h section (base y = 0, centred on z), which way is out, and the turn that fits a corner piece there. */
export const sectionCorners = (w: number, h: number) =>
  ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sy, sz]) => ({
    sy,
    sz,
    y: sy > 0 ? h : 0,
    z: (sz * w) / 2,
    turn: CORNER_TURN[`${sy},${sz}`],
  }));

/** A TDC corner piece: slides into the flanges either side of a duct corner; bolt hole at the corner. */
export function CornerPiece() {
  return (
    <>
      <mesh geometry={GEO.corner} material={MAT.zinc}>
        <Edges color={COLORS.edge} transparent opacity={EDGE_OPACITY} />
      </mesh>
      <mesh geometry={GEO.hole} material={MAT.hole} position={[0, F / 2, F / 2]} />
    </>
  );
}

/** A finished TDC flange round a w x h opening in the plane x = 0, duct body toward +x: legs, returns, corner pieces. */
export function FlangeFrame({ w, h }: { w: number; h: number }) {
  const back = T / 2 + TC / 2;
  return (
    <group>
      <Plate size={[T, F, w]} position={[0, h + F / 2, 0]} />
      <Plate size={[T, F, w]} position={[0, -F / 2, 0]} />
      <Plate size={[T, h, F]} position={[0, h / 2, w / 2 + F / 2]} />
      <Plate size={[T, h, F]} position={[0, h / 2, -w / 2 - F / 2]} />
      <Plate size={[RET, T, w]} position={[RET / 2, h + F, 0]} />
      <Plate size={[RET, T, w]} position={[RET / 2, -F, 0]} />
      <Plate size={[RET, h, T]} position={[RET / 2, h / 2, w / 2 + F]} />
      <Plate size={[RET, h, T]} position={[RET / 2, h / 2, -w / 2 - F]} />
      {sectionCorners(w, h).map((c) => (
        <group key={`${c.sy}${c.sz}`} position={[back, c.y, c.z]} rotation={[c.turn, 0, 0]}>
          <CornerPiece />
        </group>
      ))}
    </group>
  );
}

type JointProps = { gasket: Span; bolts: Span; glowAt: number };

/**
 * A W x H TDC joint made up at x = 0 (the gasket's centre), the arriving piece on +x:
 * the gasket goes on, four corner bolts slide through and their nuts spin down, and
 * the joint flashes as it closes.
 */
export function TdcJoint({ gasket, bolts, glowAt }: JointProps) {
  const pad = useRef<THREE.Mesh>(null);
  const set = useRef<THREE.Group>(null);
  const spins = useRef<THREE.Group[]>([]);
  const { live, swap } = useBake();
  // joint plane to the back face of each corner piece
  const back = GAP / 2 + T / 2 + TC;
  useFrame(() => {
    const g = io(shop.p, gasket);
    const b = io(shop.p, bolts);
    if (pad.current) {
      pad.current.visible = g > 0;
      pad.current.position.x = (1 - g) * 0.1;
    }
    if (set.current) {
      set.current.visible = b > 0;
      set.current.position.x = (b - 1) * 0.08;
    }
    for (const s of spins.current) s.rotation.x = (1 - b) * 2 * Math.PI;
    swap(g === 1 && b === 1);
  });
  return (
    <group>
      <group ref={live}>
        <mesh ref={pad} geometry={GEO.gasket} material={MAT.gasket} visible={false} />
        <group ref={set} visible={false}>
          {sectionCorners(W, H).map((c, i) => (
            <group
              key={`${c.sy}${c.sz}`}
              ref={(g) => {
                if (g) spins.current[i] = g;
              }}
              position={[0, c.y + (c.sy * F) / 2, c.z + (c.sz * F) / 2]}
            >
              <mesh geometry={GEO.head} material={MAT.zinc} position={[-(back + 0.003), 0, 0]} />
              <mesh geometry={GEO.shank} material={MAT.zinc} scale={[2 * back + 0.012, 1, 1]} />
              <mesh geometry={GEO.head} material={MAT.zinc} position={[back + 0.003, 0, 0]} />
            </group>
          ))}
        </group>
      </group>
      <Glow geometry={GEO.ringGlow} amount={(p) => flash(p, glowAt)} />
    </group>
  );
}
