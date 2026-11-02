"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { bim } from "@/components/bim/store";
import { getMotionPaused, useMotionPaused } from "@/lib/motion-pause";
import { useViewer, VISUAL_STYLES } from "@/lib/viewer-state";
import { useActiveView } from "./hooks";
import { viewOf } from "./views";

const DESKTOP = "(min-width: 768px)";
/** Bar height — Hero and Story clear it with the same 30px (md and up). */
const BAR = "h-[30px]";
const FPS_WINDOW = 500; // ms per frame-rate sample
const STALE = 1500; // a longer gap means the tab slept: skip that sample

/**
 * The viewer's status bar (md and up): live camera position and orientation,
 * the current view, scale, visual style, motion state and frame rate — in the
 * readout voice of a BIM app. It repeats what real controls already state, so
 * it is hidden from assistive tech. Hidden in the drone view (its HUD takes
 * over). A spacer after the footer keeps it from ever covering the page's end.
 */
export default function StatusBar() {
  const { style, drone } = useViewer();
  const paused = useMotionPaused();
  const view = viewOf(useActiveView());
  const desktop = useMedia(DESKTOP);
  const out = useReadout(desktop && !drone);
  const styleLabel = VISUAL_STYLES.find((s) => s.id === style)?.label ?? style;

  return (
    <>
      <div aria-hidden className={`relative z-10 hidden bg-void md:block ${BAR}`} />
      <div
        aria-hidden
        className={`hud fixed inset-x-0 bottom-0 z-40 items-stretch border-t border-hair bg-deep/95 px-2 text-[10px] text-fog shadow-[0_-12px_30px_-20px_rgb(0_0_0/0.9)] xl:px-4 ${BAR} ${
          drone ? "hidden" : "hidden md:flex"
        }`}
      >
        <Cell className="min-w-0 flex-1 gap-2.5 border-l-0">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan shadow-[0_0_8px_rgb(var(--cyan-rgb)/0.9)]" />
          <span className="shrink-0 text-cyan">{view.sheet}</span>
          <span className="truncate text-chalk">{view.name}</span>
        </Cell>
        <Cell>
          X <Num at={out.x} /> Y <Num at={out.y} /> Z <Num at={out.z} />
        </Cell>
        <Cell className="hidden lg:flex">
          Az <Num at={out.az} w="w-[2.2em]" />° El <Num at={out.el} w="w-[2.2em]" />°
        </Cell>
        <Cell className="hidden xl:flex">Scale 1:100 · Illustrative · NTS</Cell>
        <Cell>
          Style <span className="text-cyan">{styleLabel}</span>
        </Cell>
        <Cell className="hidden lg:flex">
          Motion <span className={paused ? "text-amber" : "text-mist"}>{paused ? "Paused" : "Live"}</span>
        </Cell>
        <Cell className="pr-2">
          <Num at={out.fps} w="w-[2.2em]" /> fps
        </Cell>
      </div>
    </>
  );
}

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`flex items-center gap-1.5 whitespace-nowrap border-l border-hair px-3 ${className}`}>{children}</span>;
}

/** Fixed-width readout, so changing digits never shift the bar. Widths in em: each .hud glyph is ~0.72em with its tracking. */
function Num({ at, w = "w-[4.4em]" }: { at: RefObject<HTMLSpanElement>; w?: string }) {
  return (
    <span ref={at} className={`inline-block text-right text-mist ${w}`}>
      —
    </span>
  );
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * One rAF loop while the bar is shown: camera readouts from bim.cam / bim.view
 * (written by the stage every frame) and a frame-rate sample. Writes text only
 * when a rounded value changes, and allocates nothing per frame otherwise.
 * The frame rate is an auto-updating figure, so it rests ("—") while motion is
 * paused and under reduced motion; the camera only moves when the visitor
 * scrolls or points, so it keeps reporting.
 */
function useReadout(live: boolean) {
  const x = useRef<HTMLSpanElement>(null);
  const y = useRef<HTMLSpanElement>(null);
  const z = useRef<HTMLSpanElement>(null);
  const az = useRef<HTMLSpanElement>(null);
  const el = useRef<HTMLSpanElement>(null);
  const fps = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!live) return;
    const nodes = [x, y, z, az, el, fps];
    const last = nodes.map(() => Number.NaN);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const write = (i: number, value: number, digits: number) => {
      if (Object.is(value, last[i])) return;
      last[i] = value;
      const node = nodes[i].current;
      if (node) node.textContent = Number.isNaN(value) ? "—" : value.toFixed(digits);
    };
    const tenth = (v: number) => Math.round(v * 10) / 10;

    let raf = 0;
    let frames = 0;
    let since = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const ready = bim.stageReady;
      write(0, ready ? tenth(bim.cam.x) : Number.NaN, 1);
      write(1, ready ? tenth(bim.cam.y) : Number.NaN, 1);
      write(2, ready ? tenth(bim.cam.z) : Number.NaN, 1);
      write(3, ready ? Math.round(((bim.view.azimuth % 360) + 360) % 360) % 360 : Number.NaN, 0);
      write(4, ready ? Math.round(bim.view.elevation) : Number.NaN, 0);
      frames += 1;
      const span = now - since;
      if (span < FPS_WINDOW) return;
      const resting = reduced || getMotionPaused() || span > STALE;
      write(5, resting ? Number.NaN : Math.round((frames * 1000) / span), 0);
      frames = 0;
      since = now;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  return { x, y, z, az, el, fps };
}
