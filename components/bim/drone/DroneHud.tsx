"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { motion } from "motion/react";
import { CropMarks } from "@/components/bimui/ViewFrame";
import { StyleSwitch } from "@/components/chrome/StyleSwitch";
import { motionTokens } from "@/lib/motion-tokens";
import { DRONE_PRESETS, flyTo, setViewer, useViewer, type DronePreset } from "@/lib/viewer-state";
import { bim } from "../store";
import { droneLink } from "./link";

/** One key press: 12° of orbit, 6° of tilt, a fifth of the distance. */
const STEP = { orbit: Math.PI / 15, tilt: Math.PI / 30, zoom: 0.2 } as const;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";
const enter = { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth };
/** Leave drone view; the shot is forgotten so a later plain re-entry shows none pressed. */
const exit = () => setViewer({ drone: false, preset: null });

/** Arrow keys orbit and tilt, + / − zoom — the keyboard twin of drag and wheel. */
function steer(key: string): boolean {
  const c = droneLink.controls;
  if (!c) return false;
  const glide = !bim.reduced;
  switch (key) {
    case "ArrowLeft":
      void c.rotate(-STEP.orbit, 0, glide);
      return true;
    case "ArrowRight":
      void c.rotate(STEP.orbit, 0, glide);
      return true;
    case "ArrowUp":
      void c.rotate(0, -STEP.tilt, glide);
      return true;
    case "ArrowDown":
      void c.rotate(0, STEP.tilt, glide);
      return true;
    case "+":
    case "=":
      void c.dolly(c.distance * STEP.zoom, glide);
      return true;
    case "-":
    case "_":
      void c.dolly(-c.distance * STEP.zoom, glide);
      return true;
    default:
      return false;
  }
}

/** Keeps Tab inside the dialog (also pulls focus back in after a click on the bare canvas). */
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!active || active === root || !root.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Live telemetry, written straight to the DOM every frame (no React state per frame). */
function Telemetry() {
  const alt = useRef<HTMLElement>(null);
  const hdg = useRef<HTMLElement>(null);
  const dist = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    const put = (el: HTMLElement | null, text: string) => {
      if (el && el.textContent !== text) el.textContent = text;
    };
    const tick = () => {
      const { cam, target, view } = bim;
      const heading = Math.round((((-view.azimuth % 360) + 360) % 360)) % 360;
      put(alt.current, `${cam.y.toFixed(1)} m`);
      put(hdg.current, `${String(heading).padStart(3, "0")}° ${COMPASS[Math.round(heading / 45) % 8]}`);
      put(dist.current, `${Math.hypot(cam.x - target.x, cam.y - target.y, cam.z - target.z).toFixed(1)} m`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const row = (label: string, ref: RefObject<HTMLElement>) => (
    <div className="flex items-baseline gap-2 md:justify-between md:gap-6">
      <dt className="text-fog">{label}</dt>
      <dd ref={ref} className="tabular-nums text-chalk">
        —
      </dd>
    </div>
  );
  return (
    <dl aria-label="Telemetry" className="hud glass flex flex-wrap gap-x-5 gap-y-1 rounded-md px-4 py-3 md:block md:min-w-[190px] md:space-y-1.5">
      {row("Alt", alt)}
      {row("Hdg", hdg)}
      {row("Dist", dist)}
    </dl>
  );
}

/** Tiny line glyphs for the preset shots (decorative). */
const GLYPHS: Record<DronePreset, ReactNode> = {
  aerial: <path d="M3 6l5-3 5 3v5l-5 3-5-3zM3 6l5 3 5-3M8 9v5" />,
  roof: <path d="M2 13.5h12M3 13.5V7.5h10v6M5 7.5V5h3v2.5M10 7.5V4h2v3.5" />,
  plenum: <path d="M1.5 5.5h13v3h-13zM9 8.5v5h3v-5" />,
  plan: <path d="M2.5 2.5h11v11h-11zM2.5 7.5h11M7.5 2.5v11" />,
  section: <path d="M3 4h10v9H3zM8 1.5v2M8 5.5v2M8 9.5v2M8 13.5v1.5" />,
};

/** A segment of the shot switch — the same control language as the ribbon's StyleSwitch. */
const seg =
  "hud relative inline-flex h-11 shrink-0 items-center gap-2 rounded-[3px] border border-transparent px-3.5 text-fog transition-colors hover:text-mist focus-visible:outline-offset-0 aria-pressed:border-cyan/45 aria-pressed:bg-cyan/10 aria-pressed:text-cyan aria-pressed:shadow-[0_0_14px_-4px_rgb(var(--cyan-rgb)/0.6)]";

/**
 * The drone view's HUD: a modal dialog over the fullscreen stage. Preset shots,
 * the visual style, live telemetry, how to fly it, and the way out (Escape too).
 * Focus moves in on open, Tab stays inside, and focus returns to the opener on exit.
 * The panels take pointer events; the bare canvas between them stays flyable.
 */
export default function DroneHud() {
  const root = useRef<HTMLDivElement>(null);
  const { preset } = useViewer();

  useEffect(() => {
    const el = root.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      } else if (e.key === "Tab") {
        if (el) trapTab(e, el);
      } else if (!e.altKey && !e.ctrlKey && !e.metaKey && steer(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drone-title"
      aria-describedby="drone-help"
      tabIndex={-1}
      // above the model's Html tags (z-index up to 20 in this stacking context)
      className="pointer-events-none absolute inset-0 z-30 outline-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: motionTokens.duration.fast } }}
      transition={enter}
    >
      <CropMarks className="m-3 md:m-5" />

      {/* reticle */}
      <div aria-hidden className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-0 top-1/2 h-px w-4 bg-cyan/70" />
        <span className="absolute right-0 top-1/2 h-px w-4 bg-cyan/70" />
        <span className="absolute left-1/2 top-0 h-4 w-px bg-cyan/70" />
        <span className="absolute bottom-0 left-1/2 h-4 w-px bg-cyan/70" />
        <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan" />
      </div>

      <motion.header
        className="absolute inset-x-4 top-4 flex items-start justify-between gap-3 md:inset-x-7 md:top-7"
        initial={{ y: -motionTokens.distance.md }}
        animate={{ y: 0 }}
        transition={enter}
      >
        <div className="glass pointer-events-auto max-w-[min(30rem,calc(100vw-9rem))] rounded-md px-4 py-3 md:px-5 md:py-4">
          <p className="hud flex items-center gap-2 text-cyan">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_rgb(var(--cyan-rgb))]" />
            3D view · Free flight
          </p>
          <h2 id="drone-title" className="display mt-1.5 text-[1.45rem] text-chalk md:text-[1.75rem]">
            Drone view
          </h2>
          <p id="drone-help" className="hud mt-2 text-mist">
            Drag to orbit · scroll / pinch to zoom · right-drag to pan
            <span className="mt-1 block text-fog max-md:hidden">Arrow keys orbit · + / − zoom · Esc exits</span>
          </p>
        </div>
        <button
          type="button"
          onClick={exit}
          className="hud glass pointer-events-auto inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-chalk transition-colors hover:border-cyan/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
          Exit<span className="sr-only"> drone view</span>
          <kbd aria-hidden className="rounded-sm border border-hair px-1.5 py-0.5 text-[9px] text-fog max-md:hidden">
            Esc
          </kbd>
        </button>
      </motion.header>

      <motion.div
        className="absolute inset-x-4 bottom-4 flex flex-col items-start gap-2.5 md:inset-x-7 md:bottom-7 md:grid md:grid-cols-[1fr_auto_1fr] md:items-end md:gap-4"
        initial={{ y: motionTokens.distance.md }}
        animate={{ y: 0 }}
        transition={enter}
      >
        <div className="pointer-events-auto">
          <Telemetry />
        </div>

        <div className="glass pointer-events-auto max-w-full rounded-md p-1.5">
          <div
            role="group"
            aria-label="Preset shots"
            className="flex max-w-full items-center overflow-x-auto rounded-[5px] border border-hair bg-void/70 p-[2px] [scrollbar-width:none]"
          >
            {DRONE_PRESETS.map((p) => (
              <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => flyTo(p.id)} className={seg}>
                <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 max-sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
                  {GLYPHS[p.id]}
                </svg>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* the page is locked while flying, so the switch's sliding segment never skews */}
        <motion.div layoutRoot className="glass pointer-events-auto self-stretch rounded-md p-1.5 md:w-[19rem] md:self-end md:justify-self-end">
          <StyleSwitch size="lg" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
