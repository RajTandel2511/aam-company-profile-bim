import * as THREE from "three";
import { lerp } from "@/lib/timing";
import { getViewer, type VisualStyle } from "@/lib/viewer-state";

/**
 * Shared palette and materials for the BIM scene. Parts never create their own
 * materials for these categories — they import from here, so the visual style,
 * X-ray ghosting and the section box apply to everything at once.
 *
 *   ARCH  — structure, envelope, sheet metal. Clipped by the section box, X-ray capable.
 *   MEP   — ducts, equipment, controls. Never clipped; they are what the cut reveals.
 *   GLOW  — particles, pulses, highlights. Unlit, toneMapped off, colour pushed > 1 so bloom catches it.
 *
 * Visual styles (getViewer().style) — applyXray() repaints ARCH and MEP when the
 * style changes, then sets the X-ray opacity every frame. Only uniforms and GL
 * state change (colour, emissive, roughness, opacity, depthWrite, visible), so a
 * switch never recompiles a shader. GLOW is the same in every style.
 *   holo   — the hero look: glowing cyan linework over faint navy fills, neon MEP
 *   shaded — light concrete, glass and metal, vivid MEP
 *   wire   — architecture as edges only, MEP solid
 *
 * Client-only module (creates THREE objects at import) — import it only from
 * files under components/bim, which load via next/dynamic with ssr: false.
 */

export const COLORS = {
  void: "#04070D",
  ground: "#0A1526",
  gridCell: "#0E3A50",
  gridSection: "#1A7AA0",
  concrete: "#98A2AD",
  concreteShade: "#76808C",
  roof: "#36404C",
  glass: "#8CCBF0",
  mullion: "#AEBFD0",
  /** ice-silver galvanised sheet metal */
  sheetMetal: "#C9D7E4",
  sheetMetalShade: "#8A9BAD",
  equipment: "#D3DDE7",
  equipmentShade: "#556274",
  /** shaded-style linework and the annotation layer */
  edge: "#CFE6FA",
  /** BIM accent: holo linework, selection, section box */
  cyan: "#38E1FF",
  ice: "#A8EEFF",
  amber: "#FFB547",
  /** maintenance; violetGlow is the lighter tint for glowing lines */
  violet: "#8B7CFF",
  violetGlow: "#A99CFF",
  supply: "#2E8BFF",
  supplyGlow: "#4DA0FF",
  ret: "#FF4D6D",
  retGlow: "#FF5C7A",
  exhaust: "#2BFF88",
  exhaustGlow: "#4DFF9C",
  /** EMS / controls: amber (lines, pulses, sensor LEDs) */
  signal: "#FFB547",
  sectionBox: "#38E1FF",
  /** VRF / split refrigerant piping: copper, glowing copper for flow */
  refrigerant: "#FF8A4C",
  refrigerantGlow: "#FFA36E",
  /** closed-cell pipe insulation (black) and FSK foil duct wrap */
  insulation: "#1C2633",
  wrap: "#DCE8F2",
} as const;

/** Section box: geometry with z > constant is clipped. Constant is animated by SectionBox (1e4 = no cut). */
export const sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4);
export const CLIP = [sectionPlane];

type StdOpts = THREE.MeshStandardMaterialParameters;

function archMat(opts: StdOpts = {}) {
  return new THREE.MeshStandardMaterial({ transparent: true, clippingPlanes: CLIP, clipShadows: true, ...opts });
}
function mepMat(color: string, opts: StdOpts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.35, emissive: color, emissiveIntensity: 0.22, ...opts });
}
function glowMat(color: string, boost: number, opts: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(boost), toneMapped: false, ...opts });
}

/** Colour, emissive and opacity come from the visual style (LOOKS), painted below and on every switch. */
export const ARCH = {
  concrete: archMat(),
  concreteShade: archMat(),
  roof: archMat(),
  glass: archMat({ depthWrite: false, side: THREE.DoubleSide }),
  mullion: archMat(),
  /** galvalume / zinc: coping, flashing, gutters, wall panels, roofing */
  sheetMetal: archMat(),
  sheetMetalShade: archMat(),
  /** BIM linework over the architecture (use with LineSegments / EdgesGeometry). Holo boosts it past 1 so bloom catches it. */
  edge: new THREE.LineBasicMaterial({ transparent: true, clippingPlanes: CLIP, depthWrite: false, toneMapped: false }),
} as const;

export const MEP = {
  supply: mepMat(COLORS.supply),
  ret: mepMat(COLORS.ret),
  exhaust: mepMat(COLORS.exhaust),
  equipment: mepMat(COLORS.equipment, { roughness: 0.5, metalness: 0.55, emissiveIntensity: 0.04 }),
  equipmentShade: mepMat(COLORS.equipmentShade, { roughness: 0.6, metalness: 0.5, emissiveIntensity: 0.02 }),
  signal: mepMat(COLORS.signal, { roughness: 0.6, metalness: 0.1, emissiveIntensity: 0.35 }),
  /** VRF / split refrigerant piping (copper); its emissive follows the style like the air systems */
  refrigerant: mepMat(COLORS.refrigerant, { roughness: 0.35, metalness: 0.7 }),
  /** closed-cell insulation on refrigerant lines */
  insulation: mepMat(COLORS.insulation, { roughness: 0.85, metalness: 0, emissiveIntensity: 0.06 }),
  /** FSK foil duct wrap: a translucent sleeve over insulated duct, so the system colour still reads through */
  wrap: new THREE.MeshStandardMaterial({
    color: COLORS.wrap,
    roughness: 0.42,
    metalness: 0.55,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    emissive: COLORS.wrap,
    emissiveIntensity: 0.06,
  }),
  /** duct / equipment linework */
  edge: new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.55, depthWrite: false }),
} as const;

export const GLOW = {
  supply: glowMat(COLORS.supplyGlow, 3.2),
  ret: glowMat(COLORS.retGlow, 3.4),
  // the green is already bright: a small boost lands it on the bloom threshold with the others
  exhaust: glowMat(COLORS.exhaustGlow, 1.5),
  signal: glowMat(COLORS.signal, 2.0),
  refrigerant: glowMat(COLORS.refrigerantGlow, 2.2),
  white: glowMat("#ffffff", 2.6),
  /** the extrusion head / placement spark on a growing part */
  spark: glowMat("#E8FBFF", 4.0, { transparent: true }),
} as const;

/* Visual styles ----------------------------------------------------------- */

const ARCH_KEYS = ["concrete", "concreteShade", "roof", "glass", "mullion", "sheetMetal", "sheetMetalShade"] as const;
type ArchKey = (typeof ARCH_KEYS)[number];
const SYSTEMS = ["supply", "ret", "exhaust", "refrigerant"] as const;
/** Each system's emissive at gain 1; a style scales it. The green reads far brighter, so it glows less. */
const MEP_GLOW = { supply: 0.22, ret: 0.22, exhaust: 0.1, refrigerant: 0.2 } as const;

type Finish = Pick<THREE.MeshStandardMaterial, "color" | "emissive" | "emissiveIntensity" | "roughness" | "metalness" | "envMapIntensity">;
/** A painted ARCH surface: its finish plus opacity solid (no X-ray) and ghosted (full X-ray). */
type Surface = Finish & { solid: number; ghost: number };
type Line = { color: THREE.Color; solid: number; ghost: number };
type Look = {
  arch: Record<ArchKey, Surface>;
  edge: Line;
  /** gain on MEP_GLOW */
  mepGlow: number;
  equipment: Finish;
  equipmentShade: Finish;
  mepEdge: { color: THREE.Color; opacity: number };
};

type Spec = { color: string; rough: number; metal: number; emissive?: string; glow?: number; env?: number };
const finish = ({ color, rough, metal, emissive = "#000000", glow = 0, env = 1 }: Spec): Finish => ({
  color: new THREE.Color(color),
  emissive: new THREE.Color(emissive),
  emissiveIntensity: glow,
  roughness: rough,
  metalness: metal,
  envMapIntensity: env,
});
const surface = (spec: Spec, solid: number, ghost: number): Surface => ({ ...finish(spec), solid, ghost });
const line = (hex: string, boost: number, solid: number, ghost: number): Line => ({
  color: new THREE.Color(hex).multiplyScalar(boost),
  solid,
  ghost,
});

/** Curtain-wall frame as glowing cyan members — in wire it is the only architecture besides the edges. */
const HOLO_MULLION = surface({ color: "#5FD8FF", emissive: "#1FA6CC", glow: 0.9, rough: 0.4, metal: 0.2, env: 0.5 }, 0.5, 0.16);
const HIDDEN = surface({ color: COLORS.concrete, rough: 1, metal: 0 }, 0, 0);

const LOOKS: Record<VisualStyle, Look> = {
  holo: {
    arch: {
      concrete: surface({ color: "#1C5A8A", emissive: "#0C3557", glow: 0.8, rough: 0.6, metal: 0.1, env: 0.5 }, 0.2, 0.07),
      concreteShade: surface({ color: "#1A4E7A", emissive: "#0B2F4D", glow: 0.8, rough: 0.6, metal: 0.1, env: 0.5 }, 0.24, 0.08),
      roof: surface({ color: "#16466E", emissive: "#0A2C48", glow: 0.8, rough: 0.7, metal: 0.1, env: 0.5 }, 0.28, 0.07),
      glass: surface({ color: "#7FE6FF", emissive: "#0E4A63", glow: 0.6, rough: 0.1, metal: 0.2, env: 0.6 }, 0.08, 0.03),
      mullion: HOLO_MULLION,
      // still reads as metal (near-opaque, so it writes depth) but cool, with a faint cyan self-light
      sheetMetal: surface({ color: "#A9C9E3", emissive: "#0F3B5A", glow: 0.45, rough: 0.3, metal: 0.65, env: 1.2 }, 0.92, 0.3),
      sheetMetalShade: surface({ color: "#7895B0", emissive: "#0B2D47", glow: 0.4, rough: 0.36, metal: 0.55, env: 1.1 }, 0.92, 0.3),
    },
    edge: line(COLORS.cyan, 2.4, 0.75, 0.4),
    mepGlow: 2.4,
    equipment: finish({ color: "#B9D3EA", emissive: "#3D7FAE", glow: 0.25, rough: 0.45, metal: 0.5 }),
    equipmentShade: finish({ color: "#3E5A78", emissive: "#173A5A", glow: 0.3, rough: 0.55, metal: 0.45 }),
    mepEdge: { color: new THREE.Color("#A8F0FF").multiplyScalar(1.5), opacity: 0.7 },
  },
  shaded: {
    arch: {
      concrete: surface({ color: COLORS.concrete, rough: 0.92, metal: 0 }, 1, 0.13),
      concreteShade: surface({ color: COLORS.concreteShade, rough: 0.95, metal: 0 }, 1, 0.16),
      roof: surface({ color: COLORS.roof, rough: 0.85, metal: 0.05 }, 1, 0.12),
      glass: surface({ color: COLORS.glass, rough: 0.08, metal: 0.6 }, 0.28, 0.06),
      mullion: surface({ color: COLORS.mullion, rough: 0.4, metal: 0.7 }, 1, 0.22),
      // half-metallic so galvanised panels still catch the key light, not only reflections
      sheetMetal: surface({ color: COLORS.sheetMetal, rough: 0.32, metal: 0.58, env: 1.35 }, 1, 0.3),
      sheetMetalShade: surface({ color: COLORS.sheetMetalShade, rough: 0.4, metal: 0.5, env: 1.2 }, 1, 0.3),
    },
    edge: line(COLORS.edge, 1, 0.32, 0.5),
    mepGlow: 1,
    equipment: finish({ color: COLORS.equipment, emissive: COLORS.equipment, glow: 0.04, rough: 0.5, metal: 0.55 }),
    equipmentShade: finish({ color: COLORS.equipmentShade, emissive: COLORS.equipmentShade, glow: 0.02, rough: 0.6, metal: 0.5 }),
    mepEdge: { color: new THREE.Color(COLORS.edge), opacity: 0.55 },
  },
  wire: {
    arch: {
      concrete: HIDDEN,
      concreteShade: HIDDEN,
      roof: HIDDEN,
      glass: HIDDEN,
      mullion: HOLO_MULLION,
      sheetMetal: HIDDEN,
      sheetMetalShade: HIDDEN,
    },
    edge: line("#D9F6FF", 1.6, 0.85, 0.55),
    mepGlow: 1.6,
    equipment: finish({ color: COLORS.equipment, emissive: COLORS.equipment, glow: 0.08, rough: 0.5, metal: 0.55 }),
    equipmentShade: finish({ color: COLORS.equipmentShade, emissive: COLORS.equipmentShade, glow: 0.04, rough: 0.6, metal: 0.5 }),
    mepEdge: { color: new THREE.Color("#E3F7FF").multiplyScalar(1.3), opacity: 0.8 },
  },
};

/** Copies a painted finish. Style switches go through here; so do parts' private copies of a shared material. */
export function copyFinish(dst: THREE.MeshStandardMaterial, src: Finish) {
  dst.color.copy(src.color);
  dst.emissive.copy(src.emissive);
  dst.emissiveIntensity = src.emissiveIntensity;
  dst.roughness = src.roughness;
  dst.metalness = src.metalness;
  dst.envMapIntensity = src.envMapIntensity;
}

function repaint(look: Look) {
  for (const key of ARCH_KEYS) copyFinish(ARCH[key], look.arch[key]);
  ARCH.edge.color.copy(look.edge.color);
  for (const key of SYSTEMS) MEP[key].emissiveIntensity = MEP_GLOW[key] * look.mepGlow;
  copyFinish(MEP.equipment, look.equipment);
  copyFinish(MEP.equipmentShade, look.equipmentShade);
  MEP.edge.color.copy(look.mepEdge.color);
  MEP.edge.opacity = look.mepEdge.opacity;
}

/** Materials are always painted: the default style now, the visitor's choice on the first frame. */
let painted: VisualStyle = "holo";
repaint(LOOKS.holo);

/* ACES pre-compensation ------------------------------------------------------ */

/** three's ACES filmic curve (RRT + ODT fit) on the grey axis, exposure 1. */
const acesCurve = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);

/** The linear value that comes out of ACES as `target` (bisection; the curve is monotonic). */
function acesInverse(target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (acesCurve(mid / 0.6) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A colour that renders as `hex` AFTER tone mapping — so the stage's background
 * and fog land exactly on the page's --void instead of a crushed near-black,
 * and the canvas meets the HTML sections without a seam.
 */
export function preToneMapped(hex: string): THREE.Color {
  const c = new THREE.Color(hex); // linear working space
  return new THREE.Color(acesInverse(c.r), acesInverse(c.g), acesInverse(c.b));
}

/**
 * Called once per frame by the scene with bim.xray (0 solid … 1 ghosted):
 * repaints on a visual-style switch, then ghosts the architecture. No allocation.
 */
export function applyXray(x: number) {
  const style = getViewer().style;
  const look = LOOKS[style];
  if (style !== painted) {
    painted = style;
    repaint(look);
  }
  for (let i = 0; i < ARCH_KEYS.length; i++) {
    const key = ARCH_KEYS[i];
    const m = ARCH[key];
    const s = look.arch[key];
    m.opacity = lerp(s.solid, s.ghost, x);
    m.visible = m.opacity > 0.003;
    // only a near-opaque fill may hide what is behind it; glass and translucent fills never write depth
    m.depthWrite = key !== "glass" && s.solid >= 0.9 && x < 0.35;
  }
  ARCH.edge.opacity = lerp(look.edge.solid, look.edge.ghost, x);
}
