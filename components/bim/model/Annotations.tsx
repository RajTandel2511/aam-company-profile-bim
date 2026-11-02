"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { lerp } from "@/lib/timing";
import {
  CLAD_X,
  CURTAIN_Z,
  GRID_X,
  GRID_X_LABELS,
  GRID_Z,
  GRID_Z_LABELS,
  LEVELS,
  PARAPET,
  type V3,
} from "../geometry";
import { ARCH, COLORS } from "../materials";
import { bim } from "../store";
import { INTRO, STORY, ease, stagger, type Window } from "../timeline";
import { dashGeometry, dashLine, revealed, type Dash } from "./structure/build";

/**
 * The BIM annotation layer: dash-dot column grid lines on the ground with grid
 * bubbles, drawn on first (INTRO.grid), and level datums east of the building
 * (INTRO.annotations). Bubbles and datums are screen-aligned DOM tags; any tag
 * whose sightline passes through the building hides, as if drawn in the model.
 * Once the story goes inside, the whole layer steps back to 40%.
 */

const GRID_Y = 0.02;
/** Dash-dot: the centre-line type BIM tools draw grids with (metres: dash, gap, dot, gap). */
const GRID_DASH = [0.9, 0.22, 0.14, 0.22] as const;
const DATUM_DASH = [0.28, 0.16] as const;
/** A grid line runs this far past the outer grid line at its bubble end... */
const BUBBLE_RUN = 5.5;
/** ...and this far at its plain end, stopping short of the level datums. */
const TAIL_RUN = 1.5;
/** Level datums: a short line x0 -> x1 at each level, mid-bay between grids 2 and 3, head at x1. */
const DATUM = { x0: 19, x1: 21, z: 5 } as const;
const LINE_OPACITY = 0.42;
/** The layer's opacity once the story is inside. */
const DIM = 0.4;
/** Tag opacity is written in 1/250 steps — finer than the eye can see, coarse enough to skip idle frames. */
const OPACITY_STEPS = 250;
const Z_RANGE = [20, 0];
const NO_POINTER = { pointerEvents: "none" } as const;
const HIDDEN = { opacity: 0, visibility: "hidden" } as const;

const at = (w: Window, t: number) => w[0] + (w[1] - w[0]) * t;
const tuple = (v: V3): THREE.Vector3Tuple => [v[0], v[1], v[2]];

type Mark = { readonly kind: "bubble" | "datum"; readonly label: string; readonly at: THREE.Vector3Tuple; readonly w: Window };

/** Grids A-E (bubbles south, toward the camera) then 1-3 (bubbles west, clear of the datums in the east). */
const GRID_LINES: readonly { label: string; a: V3; b: V3 }[] = [
  ...GRID_X.map((x, i) => ({
    label: GRID_X_LABELS[i],
    a: [x, GRID_Y, GRID_Z[GRID_Z.length - 1] + BUBBLE_RUN] as V3,
    b: [x, GRID_Y, GRID_Z[0] - TAIL_RUN] as V3,
  })),
  ...GRID_Z.map((z, i) => ({
    label: GRID_Z_LABELS[i],
    a: [GRID_X[0] - BUBBLE_RUN, GRID_Y, z] as V3,
    b: [GRID_X[GRID_X.length - 1] + TAIL_RUN, GRID_Y, z] as V3,
  })),
];

const DASHES: Dash[] = [];
const MARKS: Mark[] = [];
GRID_LINES.forEach((line, k) => {
  // each line draws from its bubble across the site; the bubble appears as it starts
  const w = stagger(INTRO.grid, k, GRID_LINES.length, 0.65);
  dashLine(DASHES, line.a, line.b, GRID_DASH, w);
  MARKS.push({ kind: "bubble", label: line.label, at: tuple(line.a), w: [w[0], at(w, 0.35)] });
});
LEVELS.forEach((level, i) => {
  // bottom-up: the level line draws outward, then its head and label arrive
  const w = stagger(INTRO.annotations, i, LEVELS.length, 0.5);
  dashLine(DASHES, [DATUM.x0, level.y, DATUM.z], [DATUM.x1, level.y, DATUM.z], DATUM_DASH, [w[0], at(w, 0.6)]);
  MARKS.push({ kind: "datum", label: level.label, at: [DATUM.x1, level.y, DATUM.z], w: [at(w, 0.45), w[1]] });
});

/* ---- occlusion: the building as a box; a tag hides behind HIDE_DEPTH of it, grazing an edge only dims it ---- */
const BOX_MIN = [-CLAD_X - 0.1, 0, -CURTAIN_Z - 0.15] as const;
const BOX_MAX = [CLAD_X + 0.1, PARAPET.top, CURTAIN_Z + 0.15] as const;
const HIDE_DEPTH = 1.5;
const EYE = new THREE.Vector3();

/** 0..1: how much building lies between the eye and q (length of the sightline inside the box, eased). */
function hiddenBy(eye: THREE.Vector3, q: THREE.Vector3Tuple): number {
  let t0 = 0;
  let t1 = 1;
  for (let a = 0; a < 3; a++) {
    const o = eye.getComponent(a);
    const d = q[a] - o;
    if (Math.abs(d) < 1e-9) {
      if (o < BOX_MIN[a] || o > BOX_MAX[a]) return 0;
      continue;
    }
    const ta = (BOX_MIN[a] - o) / d;
    const tb = (BOX_MAX[a] - o) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 >= t1) return 0;
  }
  const depth = (t1 - t0) * Math.hypot(q[0] - eye.x, q[1] - eye.y, q[2] - eye.z);
  return THREE.MathUtils.smoothstep(depth, 0, HIDE_DEPTH);
}

export default function Annotations() {
  const layer = useMemo(() => dashGeometry(DASHES), []);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: LINE_OPACITY, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      layer.geometry.dispose();
      material.dispose();
    },
    [layer, material],
  );

  const lines = useRef<THREE.LineSegments>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  /** Latest opacity per tag, and what was last written to its DOM node. */
  const want = useRef(new Float32Array(MARKS.length));
  const shown = useRef(new Float32Array(MARKS.length).fill(-1));

  // Tags mount in drei's own React root, possibly after a frame has run (frameloop "demand"
  // under reduced motion renders once) — so a node takes the latest value the moment it mounts.
  const write = (i: number) => {
    const el = nodes.current[i];
    const o = Math.round(want.current[i] * OPACITY_STEPS) / OPACITY_STEPS; // touch the DOM only on a visible change
    if (!el || o === shown.current[i]) return;
    shown.current[i] = o;
    el.style.opacity = String(o);
    el.style.visibility = o > 0 ? "visible" : "hidden";
  };
  const bind = (i: number) => (el: HTMLDivElement | null) => {
    nodes.current[i] = el;
    shown.current[i] = -1;
    write(i);
  };

  useFrame(({ camera }) => {
    const p = bim.intro;
    const dim = lerp(1, DIM, ease(bim.story, STORY.xray));
    const n = revealed(layer.times, p);
    layer.geometry.setDrawRange(0, 2 * n);
    material.opacity = LINE_OPACITY * dim;
    if (lines.current) lines.current.visible = n > 0;

    camera.getWorldPosition(EYE);
    // a ghosted building hides nothing; nor does a see-through visual style (holo fills, wire)
    const solid = Math.min(1 - bim.xray, ARCH.concrete.opacity);
    for (let i = 0; i < MARKS.length; i++) {
      const m = MARKS[i];
      want.current[i] = ease(p, m.w) * dim * (1 - hiddenBy(EYE, m.at) * solid);
      write(i);
    }
  });

  return (
    <group name="annotations">
      <lineSegments ref={lines} geometry={layer.geometry} material={material} frustumCulled={false} />
      {MARKS.map((m, i) => (
        <Html key={`${m.kind}-${m.label}`} position={m.at} center={m.kind === "bubble"} zIndexRange={Z_RANGE} style={NO_POINTER}>
          {m.kind === "bubble" ? (
            <div
              ref={bind(i)}
              aria-hidden="true"
              style={HIDDEN}
              className="grid h-[22px] w-[22px] place-items-center rounded-full border border-chalk/50 bg-void/85 font-mono text-[10.5px] font-semibold leading-none text-chalk"
            >
              {m.label}
            </div>
          ) : (
            <div
              ref={bind(i)}
              aria-hidden="true"
              // datum triangle's tip on the level line, label above the line to its right
              style={{ ...HIDDEN, transform: "translate(-5px, -100%)" }}
              className="flex items-end gap-1.5"
            >
              <svg width="10" height="8" viewBox="0 0 10 8" className="shrink-0 text-chalk">
                <path d="M0 0H10L5 8Z" fill="currentColor" />
              </svg>
              <span className="bim-tag" style={{ whiteSpace: "pre" }}>
                {m.label}
              </span>
            </div>
          )}
        </Html>
      ))}
    </group>
  );
}
