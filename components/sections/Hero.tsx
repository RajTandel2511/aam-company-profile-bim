"use client";

import { useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { animate, stagger, svg } from "animejs";
import { useWebGL2 } from "@/components/GLBoundary";
import ViewCube from "@/components/bim/ViewCube";
import { bim } from "@/components/bim/store";
import { Panel, PropRow } from "@/components/bimui/Panel";
import { CropMarks } from "@/components/bimui/ViewFrame";
import { DroneGlyph } from "@/components/chrome/DroneGlyph";
import { useCanFly, useDroneLauncher } from "@/components/chrome/hooks";
import { BID_HREF, viewFrame } from "@/components/shell/site";
import { Counter } from "@/components/ui/Counter";
import { company, stats } from "@/lib/content";
import { animeTokens, motionTokens, springs } from "@/lib/motion-tokens";
import { scrollToTarget } from "@/lib/smooth-scroll";
import { useSplitReveal } from "@/lib/use-split-reveal";
import { useViewer, VISUAL_STYLES } from "@/lib/viewer-state";

/** This sheet's entry in the drawing set ("{3D}" · Default 3D view) — the ribbon's Model tab. */
const VIEW = viewFrame("hero");
/** CSS first-paint entrance delay (see .rise in globals.css) — runs before hydration, no JS needed. */
const at = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;
/** Phones: three CTAs fit in two rows. */
const CTA_FIT = "max-sm:px-4 max-sm:py-3 max-sm:text-[14px]";
const press = {
  whileHover: { y: -motionTokens.distance.xs },
  whileTap: { scale: motionTokens.scale.press },
  transition: springs.snappy,
} as const;

/** The logo's three streams as the model's airflows — supply, exhaust, return — drawn on under the headline with anime.js. */
function Streams() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lines = svg.createDrawable(el.querySelectorAll("path"));
    const anim = animate(lines, {
      draw: ["0 0", "0 1"],
      duration: animeTokens.ms(motionTokens.duration.crawl * 1.4),
      delay: stagger(animeTokens.ms(motionTokens.stagger * 2), { start: animeTokens.ms(motionTokens.duration.crawl * 1.2) }),
      ease: animeTokens.ease.sharp,
    });
    return () => {
      anim.revert();
    };
  }, []);
  return (
    <svg ref={ref} aria-hidden className="mt-6 h-auto w-[210px] md:w-[260px]" viewBox="0 0 240 32" fill="none" strokeWidth={3.5} strokeLinecap="round">
      <path d="M 3 6 C 80 2 170 4 234 12" stroke="rgb(var(--supply-rgb))" />
      <path d="M 3 15 C 80 11 170 13 234 21" stroke="rgb(var(--exhaust-rgb))" />
      <path d="M 3 24 C 80 20 170 22 234 30" stroke="rgb(var(--return-rgb))" />
    </svg>
  );
}

/** Live readout of the load-time 4D sequence (bim.intro), updated off React; stops when it completes. */
function IntroReadout() {
  const pct = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = Math.round(bim.intro * 100);
      if (pct.current) pct.current.textContent = `${v}%`;
      if (bar.current) bar.current.style.transform = `scaleX(${bim.intro.toFixed(3)})`;
      if (bim.intro < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="mt-3 border-t border-hair pt-3">
      <p className="hud flex items-center justify-between gap-4 text-fog">
        <span>Phase · 4D sequence</span>
        <span ref={pct} className="text-cyan">
          0%
        </span>
      </p>
      <span aria-hidden className="mt-2 block h-[3px] overflow-hidden rounded-full bg-hair">
        <span ref={bar} className="block h-full origin-left scale-x-0 bg-gradient-to-r from-supply via-cyan to-exhaust" />
      </span>
    </div>
  );
}

/** The model's properties palette — only when there is a model to describe (no WebGL, no stage). */
function ModelHud() {
  const webgl = useWebGL2();
  const { style } = useViewer();
  if (!webgl) return null;
  const styleLabel = VISUAL_STYLES.find((s) => s.id === style)?.label ?? style;
  return (
    <Panel title="Properties" meta="3D view" className="absolute right-[var(--gutter)] top-5 hidden w-[320px] lg:block">
      <div className="flex items-center justify-between gap-4 pb-3">
        <div>
          <p className="hud text-cyan">{VIEW.sheet}</p>
          <p className="mt-1 text-[15px] font-bold text-chalk">{VIEW.name}</p>
        </div>
        <ViewCube />
      </div>
      <PropRow k="Model" v="4-storey commercial" />
      <PropRow k="Visual style" v={<span className="text-cyan">{styleLabel}</span>} />
      <PropRow k="Camera" v="Drone flyover" />
      <PropRow k="Scale" v="Illustrative · NTS" />
      <IntroReadout />
    </Panel>
  );
}

/** Revit-style view tag for the sheet: which view of the model this is. */
function ViewTag() {
  return (
    <div className="container-x relative pt-5">
      <p className="rise hud flex flex-wrap items-center gap-x-3 gap-y-2 text-fog" style={at(0.1)}>
        <span className="bim-tag border-cyan/40 text-cyan">
          <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-cyan" />
          {VIEW.kind}: {VIEW.sheet}
        </span>
        <span className="text-mist">{VIEW.name}</span>
        <span aria-hidden className="max-sm:hidden">
          ·
        </span>
        <span className="max-sm:hidden">Drone flyover</span>
      </p>
    </div>
  );
}

/** The company figures as a schedule: "<Project information>", one column per parameter. */
function ProjectInfo() {
  return (
    <div className="rise relative border-t border-hair bg-deep/90 md:pb-[30px]" style={at(1.2)}>
      <div className="container-x">
        <div className="flex items-center justify-between gap-4 border-b border-hair/70 py-2">
          <p id="project-info" className="hud flex items-center gap-2 text-chalk">
            <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-cyan" />
            &lt;Project information&gt;
          </p>
          <p className="hud hidden text-fog sm:block">Schedule · company figures</p>
        </div>
        {/* phones scroll the schedule sideways — focusable so keyboards can scroll it too */}
        <div
          role="region"
          aria-labelledby="project-info"
          tabIndex={0}
          className="overflow-x-auto [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none] md:overflow-visible md:[mask-image:none]"
        >
          <table className="w-full min-w-[46rem] table-fixed border-collapse md:min-w-0">
            <thead>
              <tr>
                {stats.map((s) => (
                  <th key={s.label} scope="col" className="hud border-r border-hair/60 px-3 pb-1 pt-3 text-left align-top font-medium text-fog first:pl-0 last:border-r-0">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {stats.map((s) => (
                  <td key={s.label} className="border-r border-hair/60 px-3 pb-3 pt-1 align-top first:pl-0 last:border-r-0">
                    <span className="display block text-[1.6rem] text-chalk md:text-[2rem]">
                      <Counter to={s.value} suffix={s.suffix} />
                    </span>
                    <span className="hud mt-1 block text-fog">{s.note}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * The "Default 3D view" sheet over the drone flyover: a crop region around the
 * live model, its view tag and properties palette, the headline, and the
 * company figures as a project-information schedule. Copy is in the server
 * HTML and rises in with CSS — nothing waits for JS to be readable.
 */
export default function Hero() {
  const section = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const canFly = useCanFly();
  const fly = useDroneLauncher<HTMLButtonElement>();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const fade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const rise = useTransform(scrollYProgress, [0, 0.55], [0, -motionTokens.distance.xl]);
  // same style shape on server and client (no hydration mismatch); reduced motion zeroes the lift after mount
  const liftGain = useMotionValue(1);
  useEffect(() => liftGain.set(reduce ? 0 : 1), [reduce, liftGain]);
  const lift = useTransform([rise, liftGain], ([r, g]: number[]) => r * g);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    bim.heroTarget = v;
  });
  useEffect(() => {
    bim.heroTarget = scrollYProgress.get();
  }, [scrollYProgress]);

  useSplitReveal(title, { delay: motionTokens.duration.normal });

  const toModel = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    scrollToTarget("#systems");
  };

  return (
    // grows instead of clipping on short screens; the copy clears the fixed ribbon, the schedule the status bar
    <section ref={section} id={VIEW.id} aria-labelledby={VIEW.titleId} className="relative flex min-h-[max(100svh,680px)] flex-col overflow-hidden pt-[var(--nav-h)]">
      {/* legibility scrim over the model, strongest behind the copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(130%_85%_at_0%_100%,rgb(var(--void-rgb)/0.94)_0%,rgb(var(--void-rgb)/0.6)_42%,transparent_72%)] md:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(var(--void-rgb)/0.96)_0%,rgb(var(--void-rgb)/0.88)_48%,transparent_68%)] md:hidden"
      />

      {/* the viewport: crop region around the live model */}
      <div className="relative flex flex-1 flex-col">
        <CropMarks className="m-3 md:m-4" />
        <ViewTag />
        <ModelHud />

        <motion.div style={{ opacity: fade, y: lift }} className="container-x relative mt-auto pb-8 pt-10 md:pb-10">
          <p className="rise eyebrow text-fog" style={at(0.25)}>
            <span className="text-cyan">[ Est. {company.founded} ]</span> {company.short} · South San Francisco
          </p>

          <h1
            ref={title}
            id={VIEW.titleId}
            data-split
            className="display mt-5 max-w-[13ch] text-[clamp(2.6rem,min(5.6vw,9svh),5.75rem)] text-chalk"
          >
            Every system a building breathes through.
          </h1>
          <Streams />

          <p className="rise mt-6 hidden max-w-[36rem] text-[17px] leading-relaxed text-mist sm:block md:text-lg" style={at(0.9)}>
            HVAC, exhaust and outside air, EMS controls, maintenance and architectural sheet metal for Bay Area builders —
            with ductwork fabricated in our own South San Francisco shop. {company.certification}.
          </p>

          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={at(1.05)}>
            {canFly && (
              <motion.button ref={fly.ref} type="button" onClick={fly.launch} className={`btn btn-primary hidden [.js_&]:inline-flex ${CTA_FIT}`} {...press}>
                <DroneGlyph className="h-[18px] w-[18px]" />
                Explore in drone view
              </motion.button>
            )}
            {/* no WebGL2, no drone view: the scroll story becomes the primary action */}
            <motion.a href="#systems" onClick={toModel} className={`btn ${canFly ? "btn-ghost" : "btn-primary"} ${CTA_FIT}`} {...press}>
              Watch it get built
              <span aria-hidden>↓</span>
            </motion.a>
            <motion.a href={BID_HREF} className={`btn btn-ghost ${CTA_FIT}`} {...press}>
              Request a bid
            </motion.a>
          </div>
        </motion.div>
      </div>

      <ProjectInfo />
    </section>
  );
}
