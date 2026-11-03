import * as THREE from "three";
import { DUCT, SUPPLY } from "../../geometry";
import { box, cylinder, merge, outline } from "./geo";
import { CANVAS, COLLAR, DIFF, DROP, DROP_LEN, FD, MAIN_H, RETURN_NECK, SHOE, VAV } from "./layout";

/**
 * Geometry for the HVAC connector pieces and terminal equipment, each in its
 * own local frame (origin + axes noted per builder) so one geometry instances
 * across every floor. Client-only (THREE). Illustrative proportions.
 */

type Geo = THREE.BufferGeometry;
export type Shape = { [material: string]: Geo };

/** A plan polygon (x, z) extruded from y0 to y1 — shoe bodies, transitions. */
function prism(pts: readonly (readonly [number, number])[], y0: number, y1: number): Geo {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
}

/** A ring standing `proud` out of a w (x) by h (y) section, `depth` long on local z, centred at z. */
function ring(w: number, h: number, proud: number, depth: number, z = 0): Geo[] {
  const W = w + 2 * proud;
  return [
    box(W, proud, depth, 0, (h + proud) / 2, z),
    box(W, proud, depth, 0, -(h + proud) / 2, z),
    box(proud, h, depth, (w + proud) / 2, 0, z),
    box(proud, h, depth, -(w + proud) / 2, 0, z),
  ];
}

/** Cylinder along local z. */
const tube = (r: number, len: number, z: number) => cylinder(r, len).rotateX(Math.PI / 2).translate(0, 0, z);

/** Manual volume damper quadrant on a standoff, rising along +y from the duct skin. */
function quadrant(): Geo {
  return merge([
    box(0.07, 0.008, 0.05, 0, 0.004, 0),
    box(0.02, 0.03, 0.02, 0, 0.023, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.006, 8, 1, false, 0, Math.PI / 2).translate(0, 0.041, 0),
    box(0.1, 0.012, 0.014, 0.04, 0.05, 0).rotateY(-Math.PI / 4),
  ]);
}

/* ------------------------------------------------------------ fittings -- */

/** 45° shoe takeoff. Origin: the main's south face at the lateral's centreline; +z out of the main, flare on the upstream (-x) side. */
export function shoeShape() {
  const { w, h, flare, len, plate, plateW, plateH } = SHOE;
  const parts = () => [
    box(plateW, plateH, plate, -flare / 2, 0, plate / 2),
    prism(
      [
        [-w / 2 - flare, 0],
        [w / 2, 0],
        [w / 2, len],
        [-w / 2, len],
        [-w / 2, flare],
      ],
      -h / 2,
      h / 2,
    ),
  ];
  return { supply: merge(parts()), edges: outline(parts()) };
}

/** Concentric transition, inlet width 1 (scale z per item by the real inlet width). Origin: inlet centre; +x downstream. */
export const TRANSITION_RATIO = 0.82;
export const TRANSITION_LEN = 0.45;
export function transitionShape() {
  const r = TRANSITION_RATIO / 2;
  const parts = () => [
    prism(
      [
        [0, -0.5],
        [TRANSITION_LEN, -r],
        [TRANSITION_LEN, r],
        [0, 0.5],
      ],
      -MAIN_H / 2,
      MAIN_H / 2,
    ),
    // inlet flange, built along z then turned onto x
    ...ring(1, MAIN_H, 0.045, 0.06).map((g) => g.rotateY(Math.PI / 2).translate(0.03, 0, 0)),
  ];
  return { supply: merge(parts()), edges: outline(parts()) };
}

/**
 * Curtain fire damper sized for the return main (scale x for the supply). Origin: centre; duct along z.
 * Blade-pack housing on the -x side, fusible-link access box on +x — nothing above, since the
 * return main runs 0.1 m under the slab.
 */
export const FD_W = DUCT.returnMain[0];
export const FD_ANGLE = 0.06;
export function fireDamperShape() {
  const W = FD_W + 0.04;
  const Hs = DUCT.returnMain[1] + 0.04;
  const sleeve = () => box(W, Hs, FD.len);
  const housing = () => box(0.09, Hs, 0.16, -W / 2 - 0.045, 0, 0);
  const link = () => box(0.07, 0.2, 0.24, W / 2 + 0.035, -0.02, 0.1);
  const angles = () => [...ring(W, Hs, FD_ANGLE, 0.025, -0.07), ...ring(W, Hs, FD_ANGLE, 0.025, 0.07)];
  return {
    equipment: sleeve(),
    shade: merge([housing(), link(), ...angles()]),
    edges: outline([sleeve(), housing(), link(), ...angles()]),
  };
}

/** Tee collar where a return grille's neck leaves the main. Origin: the main's underside at the neck centre; hangs down. */
export function collarShape() {
  const [nw, nd] = RETURN_NECK;
  const parts = () => [
    box(nw + 2 * COLLAR.proud, COLLAR.h, nd + 2 * COLLAR.proud, 0, -COLLAR.h / 2, 0),
    box(nw + 2 * COLLAR.proud + 0.06, 0.014, nd + 2 * COLLAR.proud + 0.06, 0, -0.007, 0),
  ];
  return { ret: merge(parts()), edges: outline(parts()) };
}

/** Canvas flexible connector: a rippled fabric bellows round a 1.0 x 0.6 trunk (scale x per trunk). Origin: band centre on the trunk axis. */
export function canvasShape() {
  const hx = DUCT.returnTrunk[0] / 2;
  const hz = DUCT.returnTrunk[1] / 2;
  const rows = 24;
  const ripples = 3;
  const pos: number[] = [];
  const idx: number[] = [];
  // the perimeter, counter-clockwise from above, so every face winds outward
  const corners = [
    [hx, -hz, 1, -1],
    [hx, hz, 1, 1],
    [-hx, hz, -1, 1],
    [-hx, -hz, -1, -1],
  ] as const;
  for (let f = 0; f < 4; f++) {
    const a = corners[f];
    const b = corners[(f + 1) % 4];
    const base = pos.length / 3;
    for (let r = 0; r <= rows; r++) {
      const y = -CANVAS.h / 2 + (CANVAS.h * r) / rows;
      const o = 0.014 + 0.02 * Math.abs(Math.sin((Math.PI * ripples * r) / rows));
      pos.push(a[0] + a[2] * o, y, a[1] + a[3] * o, b[0] + b[2] * o, y, b[1] + b[3] * o);
      if (r > 0) {
        const p = base + (r - 1) * 2;
        idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { shade: g };
}

/**
 * Turning vanes for the main's square elbow (flow in along +z, out along +x).
 * Origin: elbow centre. Quarter-circle blades strung along the throat-heel diagonal.
 */
export function vanesShape() {
  const half = DUCT.supplyMain[0] / 2;
  const hy = MAIN_H / 2 - 0.03;
  const n = 5;
  const r = 0.13;
  const steps = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 1; k <= n; k++) {
    const f = k / (n + 1);
    // arc midpoint on the diagonal from the throat (+x, -z) to the heel (-x, +z)
    const mx = half - 2 * half * f;
    const mz = -half + 2 * half * f;
    const ox = mx - r * (1 - Math.SQRT1_2) + r;
    const oz = mz - r * Math.SQRT1_2;
    const base = pos.length / 3;
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * (Math.PI / 2);
      const x = ox - r * Math.cos(t);
      const z = oz + r * Math.sin(t);
      pos.push(x, -hy, z, x, hy, z);
      if (s > 0) {
        const p = base + (s - 1) * 2;
        idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return { glow: g };
}

/* ------------------------------------------------------------ terminals -- */

/**
 * VAV terminal box. Origin: the casing's upstream face centre; +z downstream.
 * Round inlet duct (with its balancing quadrant) and collar upstream, casing,
 * reheat-coil section; actuator, controller enclosure and heater terminal box on the +x side.
 */
export function vavShape() {
  const [cw, ch, cl] = VAV.casing;
  const [kw, kh, kl] = VAV.coil;
  const inletZ = -VAV.collar - VAV.inletLen / 2;
  const casing = () => box(cw, ch, cl, 0, 0, cl / 2);
  const coil = () => box(kw, kh, kl, 0, 0, cl + kl / 2);
  const collar = () => tube(VAV.inletR + 0.015, VAV.collar, -VAV.collar / 2);
  const actuator = () => box(0.1, 0.12, 0.16, cw / 2 + 0.05, 0.08, 0.13);
  const enclosure = () => box(0.05, 0.22, 0.28, cw / 2 + 0.025, -0.03, 0.52);
  const heater = () => box(0.06, 0.18, 0.16, kw / 2 + 0.03, 0.04, cl + kl / 2);
  const fins = Array.from({ length: 6 }, (_, k) => box(kw - 0.06, 0.008, 0.012, 0, kh / 2 + 0.004, cl + 0.03 + k * 0.04));
  return {
    equipment: merge([casing(), coil(), collar(), quadrant().translate(0, VAV.inletR, inletZ)]),
    shade: merge([actuator(), heater(), cylinder(0.014, 0.06).rotateZ(Math.PI / 2).translate(cw / 2 + 0.02, 0.08, 0.13), ...fins]),
    signal: enclosure(),
    supply: tube(VAV.inletR, VAV.inletLen, inletZ),
    edges: outline([casing(), coil(), actuator(), enclosure(), heater(), collar()]),
  };
}

/** A helix on a cylinder of radius R from height y0 to y1 — the spiral duct's lock seam. */
function helix(R: number, y0: number, y1: number, turns: number, phase: number): THREE.Curve<THREE.Vector3> {
  const pts = Array.from({ length: 33 }, (_, k) => {
    const t = k / 32;
    const a = phase + t * turns * Math.PI * 2;
    return new THREE.Vector3(R * Math.cos(a), y0 + (y1 - y0) * t, R * Math.sin(a));
  });
  return new THREE.CatmullRomCurve3(pts);
}

/**
 * Round drop off a lateral's underside. Origin: on the underside at the drop axis; extends down DROP_LEN.
 * Spin-in collar (galvanised), spiral section with helical seams and a balancing quadrant, corrugated flex.
 */
export function dropShape() {
  const ySpiral = -DROP.spin;
  const yFlex = -DROP.spin - DROP.spiral;
  const flex: THREE.Vector2[] = [];
  const rows = 28;
  for (let k = 0; k <= rows; k++) {
    // bottom -> top, so the lathe's normals face out
    const y = -DROP_LEN + ((yFlex + DROP_LEN) * k) / rows;
    flex.push(new THREE.Vector2(DROP.r + 0.006 + 0.008 * Math.abs(Math.sin((Math.PI * 6 * k) / rows)), y));
  }
  const seams = [0, Math.PI].map((p) => new THREE.TubeGeometry(helix(DROP.r + 0.002, ySpiral, yFlex, 1.25, p), 40, 0.0045, 4, false));
  return {
    equipment: merge([
      cylinder(DROP.rim, 0.012, 0, -0.006, 0),
      cylinder(DROP.r + 0.008, DROP.spin - 0.012, 0, -0.012 - (DROP.spin - 0.012) / 2, 0),
      ...seams,
      quadrant()
        .rotateZ(-Math.PI / 2)
        .translate(DROP.r, ySpiral - DROP.spiral / 2, 0),
    ]),
    supply: cylinder(DROP.r, DROP.spiral, 0, ySpiral - DROP.spiral / 2, 0),
    shade: new THREE.LatheGeometry(flex, 28),
  };
}

/** Round-neck square ceiling diffuser. Origin: face centre on the ceiling line; up is +y. */
export function diffuserShape() {
  const face = (outer: number, inner: number, y: number) => {
    const bar = (outer - inner) / 2;
    return [
      box(outer, 0.012, bar, 0, y, (outer - bar) / 2),
      box(outer, 0.012, bar, 0, y, -(outer - bar) / 2),
      box(bar, 0.012, inner, (outer - bar) / 2, y, 0),
      box(bar, 0.012, inner, -(outer - bar) / 2, y, 0),
    ];
  };
  const w = SUPPLY.diffuser;
  return {
    equipment: merge([box(w, DIFF.plate, w, 0, DIFF.plate / 2, 0), ...face(0.44, 0.4, -0.006), ...face(0.26, 0.22, -0.006)]),
    shade: merge([
      box(DIFF.panW, DIFF.pan, DIFF.panW, 0, DIFF.plate + DIFF.pan / 2, 0),
      cylinder(DIFF.neckR, DIFF.neck, 0, DIFF.plate + DIFF.pan + DIFF.neck / 2, 0),
    ]),
  };
}
