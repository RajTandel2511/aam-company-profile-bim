"use client";

import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { getMotionPaused } from "@/lib/motion-pause";
import { easeOutBack, easeOutCubic, seg } from "@/lib/timing";
import { getViewer } from "@/lib/viewer-state";
import { droneLink } from "../drone/link";
import { bim } from "../store";
import { CardLayer, HEADER_H, collect, type CardNodes } from "./Card";
import { SIDE, WIDE, leader, place, rect, region, type Frame, type Rect } from "./layout";
import { CARDS, anchorAt, type CardSpec } from "./registry";

/**
 * Mid-screen BIM element cards. As the drone camera flies the story, a card pops
 * up beside the element going in — a dot on the element, an elbowed leader out
 * to the card — and fades as the flow moves on. At most two at once (one on
 * phones), kept in the free band between the story panel and the HUD / legend
 * (layout.ts), timed to the STORY windows (registry.ts).
 *
 * One DOM overlay over the canvas, rendered by its own React root only when the
 * set of cards near their window changes; every frame the anchors are projected
 * and the cards positioned and revealed imperatively — no per-frame React state.
 * Hidden in drone mode and under reduced motion (the still model has no story to follow).
 */

/** Story progress over which a card fades in at the start of its window and out at the end. */
const FADE = 0.005;
/** A card mounts this far (story) ahead of its window, so its DOM is attached before it shows. */
const MOUNT = 0.012;
/** Seconds for the reveal: the dot lands, the leader draws out, the card opens along it, then its body. */
const POP_S = 0.8;
/** 1/s — a card glides to a new spot (camera moving, the other card leaving) instead of jumping. */
const GLIDE = 10;
/** px — an anchor fades out over EDGE at the screen edges and over UNDER beneath a panel. */
const EDGE = 56;
const UNDER = 24;
/** Frames between re-measuring the story panel, HUD and legend. */
const MEASURE_EVERY = 20;
/** Status chip dot: going in (BIM cyan) / done (running green). */
const DOING = "#38E1FF";
const DONE = "#2BFF88";
/** Where the card opens from, per SIDE (left, right, top, bottom): the face its leader lands on. */
const ORIGIN = [`0px ${HEADER_H / 2}px`, `100% ${HEADER_H / 2}px`, "50% 0%", "50% 100%"] as const;

if (CARDS.length > 30) throw new Error("ElementCards keeps its mounted set in a 30-bit mask");

type Live = {
  placed: boolean;
  /** 0..1 reveal, in real seconds / POP_S since the card last appeared */
  pop: number;
  /** smoothed card position (px) and scale */
  x: number;
  y: number;
  s: number;
  /** side of its element the card took last frame (layout.place reads and writes it), 0 when just placed */
  side: number;
  /** -1 unknown, 0 going in, 1 done */
  done: number;
  pts: Float32Array;
  /** last values written, so idle frames touch no DOM */
  o: string;
  d: string;
  css: string;
  clip: string;
  body: string;
};

type Overlay = {
  root: Root | null;
  /** bumped per overlay root: ref callbacks from a root being torn down are ignored */
  gen: number;
  mask: number;
  measureIn: number;
  frame: Frame;
  nodes: (CardNodes | null)[];
  live: Live[];
  bind: ((el: HTMLDivElement | null) => void)[];
};

function makeOverlay(): Overlay {
  return {
    root: null,
    gen: 0,
    mask: 0,
    measureIn: 0,
    frame: { w: 0, h: 0, top: 0, bottom: 0, gutter: 20, avoid: [] },
    nodes: CARDS.map(() => null),
    live: CARDS.map(
      (): Live => ({ placed: false, pop: 0, x: 0, y: 0, s: 1, side: 0, done: -1, pts: new Float32Array(6), o: "", d: "", css: "", clip: "", body: "" }),
    ),
    bind: [],
  };
}

/** Ref callbacks for one overlay root: a card registers its nodes on mount and clears them on unmount. */
function binders(ov: Overlay, gen: number) {
  return CARDS.map((_, i) => (el: HTMLDivElement | null) => {
    if (gen !== ov.gen) return; // the old root's late unmount must not clear the new root's nodes
    ov.nodes[i] = el ? collect(el) : null;
    const st = ov.live[i];
    st.placed = false;
    st.pop = 0;
    st.side = 0;
    st.done = -1;
    st.o = st.d = st.css = st.clip = st.body = "";
  });
}

const v = new THREE.Vector3();
const slot = rect();
const goal = rect();
const held = rect();
const spare = rect();

/** 0..1 — the card's window, fading in over FADE at its start and out over FADE at its end. */
const life = (s: number, w: CardSpec["show"]) => Math.min(seg(s, w[0], w[0] + FADE), 1 - seg(s, w[1] - FADE, w[1]));
const fract = (x: number) => x - Math.floor(x);

/** 0..1 — the anchor is on screen and clear of the panels. */
function inView(f: Frame, ax: number, ay: number): number {
  let k = Math.min(1, Math.min(ax, f.w - ax, ay - f.top, f.h - f.bottom - ay) / EDGE);
  for (let i = 0; i < f.avoid.length; i++) {
    const r = f.avoid[i];
    const depth = Math.min(ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay);
    if (depth > 0) k = Math.min(k, 1 - depth / UNDER);
  }
  return Math.max(0, k);
}

/** The panels to keep clear of (marked data-cards-avoid in Story), the nav, the status bar and the gutter. */
function measure(f: Frame, canvas: HTMLCanvasElement) {
  const c = canvas.getBoundingClientRect();
  const css = getComputedStyle(document.documentElement);
  f.top = parseFloat(css.getPropertyValue("--nav-h")) || 64;
  f.bottom = parseFloat(css.getPropertyValue("--status-h")) || 0;
  f.gutter = parseFloat(css.getPropertyValue("--gutter")) || 20;
  f.avoid.length = 0;
  document.querySelectorAll("[data-cards-avoid]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) f.avoid.push({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height });
  });
}

function hide(ov: Overlay, i: number): false {
  const st = ov.live[i];
  st.placed = false;
  st.pop = 0;
  st.side = 0;
  const n = ov.nodes[i];
  if (n && n.root.style.visibility !== "hidden") {
    n.root.style.visibility = "hidden";
    n.root.style.opacity = "0";
    st.o = "0";
  }
  return false;
}

/** Writes one visible card: opacity, leader + dot, position, the reveal, and its status chip. */
function draw(n: CardNodes, st: Live, c: CardSpec, ax: number, ay: number, o: number) {
  const p = st.pop;
  const dotIn = easeOutBack(seg(p, 0, 0.3));
  const drawn = easeOutCubic(seg(p, 0.08, 0.45));
  const open = easeOutCubic(seg(p, 0.38, 0.8));
  const body = easeOutCubic(seg(p, 0.6, 1));
  const side = leader(ax, ay, st.x, st.y, n.w * st.s, n.h * st.s, (HEADER_H / 2) * st.s, st.pts);

  const opacity = o.toFixed(3);
  if (opacity !== st.o) {
    n.root.style.opacity = opacity;
    n.root.style.visibility = "visible";
    st.o = opacity;
  }

  // the leader draws out from the dot; the dot's halo breathes on bim.time (it freezes with Pause motion)
  const P = st.pts;
  const d = side === SIDE.none ? "" : `M${P[0].toFixed(1)} ${P[1].toFixed(1)}L${P[2].toFixed(1)} ${P[3].toFixed(1)}L${P[4].toFixed(1)} ${P[5].toFixed(1)}`;
  if (d !== st.d) {
    n.line.setAttribute("d", d);
    st.d = d;
  }
  n.line.style.strokeDashoffset = (1 - drawn).toFixed(3);
  const cx = ax.toFixed(1);
  const cy = ay.toFixed(1);
  n.dot.setAttribute("cx", cx);
  n.dot.setAttribute("cy", cy);
  n.dot.setAttribute("r", (3.6 * dotIn).toFixed(2));
  const pulse = fract(bim.time * 0.7);
  n.ring.setAttribute("cx", cx);
  n.ring.setAttribute("cy", cy);
  n.ring.setAttribute("r", (5 + 8 * pulse).toFixed(2));
  n.ring.style.opacity = ((1 - pulse) * 0.7 * Math.min(1, dotIn)).toFixed(3);

  // the card: placed, then opened along the leader from the face it lands on (clip off once open, so its glow shows)
  const css = `translate3d(${st.x.toFixed(1)}px,${st.y.toFixed(1)}px,0) scale(${st.s.toFixed(3)})`;
  if (css !== st.css) {
    n.card.style.transform = css;
    st.css = css;
  }
  const cut = `${((1 - open) * 100).toFixed(1)}%`;
  const clip =
    open > 0.999
      ? "none"
      : side === SIDE.right
        ? `inset(0 0 0 ${cut})`
        : side === SIDE.top
          ? `inset(0 0 ${cut} 0)`
          : side === SIDE.bottom
            ? `inset(${cut} 0 0 0)`
            : `inset(0 ${cut} 0 0)`;
  if (clip !== st.clip) {
    n.clip.style.clipPath = clip;
    n.clip.style.transformOrigin = ORIGIN[Math.max(0, side)];
    n.clip.style.transform = `scale(${(0.94 + 0.06 * open).toFixed(3)})`;
    st.clip = clip;
  }
  const b = body.toFixed(3);
  if (b !== st.body) {
    n.body.style.opacity = b;
    n.body.style.transform = `translateY(${((1 - body) * 6).toFixed(1)}px)`;
    n.corners.style.opacity = b;
    st.body = b;
  }

  // status chip: flips at doneAt; its dot breathes while the element is going in
  const done = bim.story >= c.doneAt ? 1 : 0;
  if (done !== st.done) {
    st.done = done;
    n.chip.textContent = done ? c.status[1] : c.status[0];
    n.chipDot.style.background = done ? DONE : DOING;
  }
  n.chipDot.style.opacity = done ? "1" : (0.55 + 0.45 * Math.sin(bim.time * 5)).toFixed(2);
}

/** Projects card i's anchor, places the card (clear of `taken`) and draws it; writes its on-screen rect into `out`. */
function show(ov: Overlay, i: number, taken: Rect | null, out: Rect, camera: THREE.Camera, compact: boolean, dt: number): boolean {
  const c = CARDS[i];
  const n = ov.nodes[i];
  const st = ov.live[i];
  const f = ov.frame;
  if (!n) return false;
  anchorAt(c, bim.target.x, bim.target.y, bim.target.z, v); // a linear element: the point nearest the look-at target
  v.applyMatrix4(camera.matrixWorldInverse);
  const front = v.z < -0.1; // the camera looks down its -z
  v.applyMatrix4(camera.projectionMatrix);
  const ax = (v.x + 1) * 0.5 * f.w;
  const ay = (1 - v.y) * 0.5 * f.h;
  const o = front ? life(bim.story, c.show) * inView(f, ax, ay) : 0;
  const room = o > 0.004 ? region(f, n.w, n.h, slot) : 0;
  const k = room ? place(ax, ay, n.w, n.h, room, slot, compact, taken, st, goal) : 0;
  if (!k) return hide(ov, i);

  if (!st.placed) {
    st.placed = true;
    st.x = goal.x;
    st.y = goal.y;
    st.s = k;
  } else {
    const g = 1 - Math.exp(-GLIDE * dt);
    st.x += (goal.x - st.x) * g;
    st.y += (goal.y - st.y) * g;
    st.s += (k - st.s) * g;
  }
  // a short one-shot reveal, not an ambient loop — still, Pause motion skips it
  st.pop = getMotionPaused() ? 1 : Math.min(1, st.pop + dt / POP_S);
  out.x = st.x;
  out.y = st.y;
  out.w = n.w * st.s;
  out.h = n.h * st.s;
  draw(n, st, c, ax, ay, o);
  return true;
}

function tick(ov: Overlay, camera: THREE.Camera, w: number, h: number, canvas: HTMLCanvasElement, delta: number) {
  const root = ov.root;
  if (!root) return;
  const s = bim.story;
  const off = getViewer().drone || droneLink.weight > 0.01; // flying, or gliding back onto the track

  // 1. mount the cards near their window — the overlay's React tree re-renders only at these edges
  let mask = 0;
  if (!off) {
    for (let i = 0; i < CARDS.length; i++) {
      const win = CARDS[i].show;
      if (s > win[0] - MOUNT && s < win[1] + MOUNT) mask |= 1 << i;
    }
  }
  if (mask !== ov.mask) {
    ov.mask = mask;
    root.render(<CardLayer mask={mask} bind={ov.bind} />);
  }
  if (!mask) return;

  const f = ov.frame;
  if (--ov.measureIn <= 0 || f.w !== w || f.h !== h) {
    const resized = f.w !== w || f.h !== h;
    f.w = w;
    f.h = h;
    measure(f, canvas);
    ov.measureIn = MEASURE_EVERY;
    // crossing lg swaps the slim phone card for the full one: measure the mounted cards again
    if (resized) {
      for (const n of ov.nodes) {
        if (!n) continue;
        n.w = n.card.offsetWidth || n.w;
        n.h = n.card.offsetHeight || n.h;
      }
    }
  }

  // 2. the newest two cards in their window (one on phones); every other card hides
  let newer = -1;
  let older = -1;
  for (let i = CARDS.length - 1; i >= 0; i--) {
    if (!(mask & (1 << i)) || !ov.nodes[i] || life(s, CARDS[i].show) <= 0) continue;
    if (newer < 0) newer = i;
    else {
      older = i;
      break;
    }
  }
  const compact = w < WIDE;
  if (compact) older = -1;
  for (let i = 0; i < CARDS.length; i++) if (i !== newer && i !== older) hide(ov, i);
  if (newer < 0) return;

  // 3. the older card keeps its spot; the newer one finds room around it
  camera.updateMatrixWorld(); // CameraRig is mounted before this part, so the camera has already moved this frame
  const dt = Math.min(delta, 0.1);
  const keep = older >= 0 && show(ov, older, null, held, camera, compact, dt) ? held : null;
  show(ov, newer, keep, spare, camera, compact, dt);
}

export default function ElementCards() {
  const gl = useThree((s) => s.gl);
  const connected = useThree((s) => s.events.connected) as HTMLElement | null | undefined;
  const [ov] = useState(makeOverlay);

  useEffect(() => {
    if (bim.reduced) return; // the still model: no story, no cards
    const host = connected ?? gl.domElement.parentElement;
    if (!host) return;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true"); // decorative: the story panel carries the words
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:strict;z-index:30";
    host.appendChild(el);
    const root = createRoot(el);
    ov.gen++;
    ov.bind = binders(ov, ov.gen);
    ov.nodes.fill(null);
    ov.root = root;
    ov.mask = 0;
    return () => {
      ov.gen++;
      ov.nodes.fill(null);
      ov.root = null;
      ov.mask = 0;
      el.remove();
      setTimeout(() => root.unmount()); // never unmount a root synchronously inside another renderer's commit
    };
  }, [gl, connected, ov]);

  useFrame(({ camera, size }, delta) => tick(ov, camera, size.width, size.height, gl.domElement, delta));
  return null;
}
