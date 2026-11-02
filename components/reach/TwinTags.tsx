"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { motionTokens } from "@/lib/motion-tokens";
import { clamp, seg } from "@/lib/timing";
import { CHOREO, CITIES, LEVEL, SLAB, STREAMS, type Focus, type ReachCity, type TwinClock } from "./data";

/**
 * Screen-aligned annotations over the site plan: keynoted tags on HQ and the busiest
 * cities, and a properties card for the active city. Opacity and placement are
 * written imperatively and only when they change: no React state per frame, and no
 * layout reads per frame (a ResizeObserver supplies the sizes).
 */

const TAG_LIFT = 0.12; // world units above the pillar top
// ponytail: permanent tags only where they cannot collide — the 3-job cities (Oakland and
// Alameda sit ~14 px apart) get the hover card instead. Lower this if the map grows sparser.
const TAG_MIN_COUNT = 4;
const TAG_GAP = 6; // px between the pillar top and its tag
const TAG_RIGHT = `translate(${TAG_GAP}px, -50%)`;
const TAG_LEFT = `translate(calc(-100% - ${TAG_GAP}px), -50%)`;
const TOOLTIP_NAMES = 4; // the readout beside the map lists every named project
const GAP = 14; // px between the pillar top and the card
const EDGE = 10; // px kept clear of the canvas edge
const FADE = `opacity ${motionTokens.duration.fast}s cubic-bezier(${motionTokens.easing.smooth.join(",")})`;

const PARKED: [number, number, number] = [0, 0, 0];
const topY = (c: ReachCity) => SLAB + c.count * LEVEL + TAG_LIFT;
const topOf = (c: ReachCity): [number, number, number] => [c.x, topY(c), c.z];
/** Scratch for projecting anchors; frame callbacks run one at a time, so sharing it is safe. */
const ndc = new THREE.Vector3();

type Measured = { node: HTMLDivElement | null; w: number; h: number };

/**
 * Callback ref for an overlay node. A ResizeObserver caches its size (first layout,
 * font swap, new content), so frames never read layout, and asks for a frame when the
 * size changes, since the canvas may be drawing on demand. A callback ref because Html
 * renders its children in a root of its own, after this component's effects (and swaps
 * the node once while the canvas connects its events).
 */
function useMeasured() {
  const invalidate = useThree((s) => s.invalidate);
  const box = useRef<Measured>({ node: null, w: 0, h: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      // Detach (null) is ignored: the next node replaces this one, whichever root commits first.
      if (!node) return;
      observer.current?.disconnect();
      box.current.node = node;
      observer.current = new ResizeObserver(() => {
        box.current.w = node.offsetWidth;
        box.current.h = node.offsetHeight;
        invalidate();
      });
      observer.current.observe(node);
    },
    [invalidate],
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  return [box, ref] as const;
}

type TagProps = { city: ReachCity; index: number; clock: TwinClock; focus: Focus };

function CityTag({ city, index, clock, focus }: TagProps) {
  const [box, ref] = useMeasured();
  // What the node shows now, so the DOM is written only on change.
  const last = useRef({ node: null as HTMLDivElement | null, opacity: 0, left: false });

  useFrame(({ camera, size }) => {
    const { node, w } = box.current;
    if (!node) return;
    const was = last.current;
    if (was.node !== node) {
      // a fresh node starts from the inline style below
      was.node = node;
      was.opacity = 0;
      was.left = false;
    }
    const { on, dim } = focus[index];
    const grown = city.pillarAt + CHOREO.pillarGrow;
    // The card replaces the tag while its city is active; other tags step back.
    const o = seg(clock.t, grown, grown + CHOREO.fade) * (1 - on) * (1 - 0.8 * dim);
    const opacity = o < 0.01 ? 0 : Math.round(o * 100) / 100;
    if (opacity !== was.opacity) {
      was.opacity = opacity;
      node.style.opacity = String(opacity);
      node.style.visibility = opacity ? "visible" : "hidden";
    }
    if (!opacity) return;
    // Right of the pillar (HQ: left, out over the ocean) unless that side would leave the canvas.
    const px = (ndc.set(city.x, topY(city), city.z).project(camera).x * 0.5 + 0.5) * size.width;
    const fitsRight = px + TAG_GAP + w <= size.width - EDGE;
    const fitsLeft = px - TAG_GAP - w >= EDGE;
    const left = city.isHQ ? fitsLeft || !fitsRight : !fitsRight && fitsLeft;
    if (left !== was.left) {
      was.left = left;
      node.style.transform = left ? TAG_LEFT : TAG_RIGHT;
    }
  });
  return (
    <Html position={topOf(city)} zIndexRange={[20, 0]} pointerEvents="none">
      {/* Starts hidden inline; useFrame owns opacity, visibility and side from then on. */}
      <div
        ref={ref}
        className="hud flex items-center gap-1.5 whitespace-nowrap text-mist"
        style={{ opacity: 0, visibility: "hidden", transform: TAG_RIGHT }}
      >
        {city.isHQ ? (
          <>
            <span className="flex items-center gap-[2px]">
              {STREAMS.map((s) => (
                <span key={s.glow} className={`block h-2 w-[3px] ${s.fill}`} />
              ))}
            </span>
            <span className="text-chalk">HQ</span>
          </>
        ) : (
          <>
            <span className="border-r border-cyan/40 pr-1.5 text-cyan">{city.note}</span>
            <span>{city.name}</span>
            <span className={STREAMS[city.stream].text}>{city.count}</span>
          </>
        )}
      </div>
    </Html>
  );
}

function Tooltip({ active }: { active: string | null }) {
  const city = CITIES.find((c) => c.name === active) ?? null;
  // Remember the last city so the card can fade out instead of vanishing.
  const [shown, setShown] = useState<ReachCity | null>(city);
  if (city && city !== shown) setShown(city);
  const [box, ref] = useMeasured();
  // The card measured and the offset written last, so the DOM is touched only on change.
  const last = useRef({ node: null as HTMLDivElement | null, city: null as ReachCity | null, dx: NaN, dy: NaN });

  useFrame(({ camera, size }) => {
    const b = box.current;
    const node = b.node;
    // Nothing active, nothing to do: a card fading out keeps its last offset.
    if (!node || !city) return;
    const was = last.current;
    if (was.node !== node || was.city !== city) {
      // One layout read per new card, not per frame; the observer catches content that lands later.
      was.node = node;
      was.city = city;
      was.dx = was.dy = NaN;
      b.w = node.offsetWidth;
      b.h = node.offsetHeight;
    }
    ndc.set(city.x, topY(city), city.z).project(camera);
    const px = (ndc.x * 0.5 + 0.5) * size.width;
    const py = (-ndc.y * 0.5 + 0.5) * size.height;
    // Up-right of the pillar by default; flip when it would leave the canvas, then clamp inside it.
    let x = px + GAP;
    if (x + b.w > size.width - EDGE) x = px - GAP - b.w;
    let y = py - GAP - b.h;
    if (y < EDGE) y = py + GAP;
    x = clamp(x, EDGE, Math.max(EDGE, size.width - b.w - EDGE));
    y = clamp(y, EDGE, Math.max(EDGE, size.height - b.h - EDGE));
    const dx = Math.round((x - px) * 10) / 10;
    const dy = Math.round((y - py) * 10) / 10;
    if (dx === was.dx && dy === was.dy) return;
    was.dx = dx;
    was.dy = dy;
    node.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  // Mounted from the start (empty, transparent) so even the first card fades in.
  return (
    <Html position={shown ? topOf(shown) : PARKED} zIndexRange={[40, 21]} pointerEvents="none">
      <div
        ref={ref}
        className="glass w-52 rounded-[4px] p-3 shadow-[0_18px_48px_rgb(0_0_0/0.55)]"
        style={{ opacity: city ? 1 : 0, visibility: shown ? "visible" : "hidden", transition: FADE }}
      >
        {shown && <Card city={shown} />}
      </div>
    </Html>
  );
}

function Card({ city }: { city: ReachCity }) {
  const names = city.projects.slice(0, TOOLTIP_NAMES);
  const more = city.count - names.length;
  const stream = STREAMS[city.stream];
  return (
    <>
      {/* HQ is its own chip and the row wraps, so a long city name never runs out of its tag. */}
      <p className="flex flex-wrap items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stream.fill}`} />
        {city.isHQ && <span className="bim-tag border-cyan/40 text-cyan">HQ</span>}
        <span className="bim-tag">
          <span className="text-cyan">{city.note}</span>
          {city.name}
        </span>
      </p>
      <p className="mono mt-2 text-[12px] text-mist">
        <span className={`font-semibold ${stream.text}`}>{city.count}</span> in progress
      </p>
      {names.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-hair pt-2 text-[12.5px] leading-snug text-chalk">
          {names.map((p) => (
            <li key={p.name}>{p.name}</li>
          ))}
        </ul>
      )}
      {names.length > 0 && more > 0 && <p className="hud mt-2 text-fog">+ {more} more in progress</p>}
    </>
  );
}

export function Tags({ clock, focus, active }: { clock: TwinClock; focus: Focus; active: string | null }) {
  return (
    <>
      {CITIES.map((c, i) =>
        c.isHQ || c.count >= TAG_MIN_COUNT ? <CityTag key={c.name} city={c} index={i} clock={clock} focus={focus} /> : null,
      )}
      <Tooltip active={active} />
    </>
  );
}
