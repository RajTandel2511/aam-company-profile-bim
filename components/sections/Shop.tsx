"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  type MotionValue,
  type Variants,
} from "motion/react";
import { GLBoundary, useWebGL2 } from "@/components/GLBoundary";
import { Panel } from "@/components/bimui/Panel";
import { CropMarks, ViewFrame } from "@/components/bimui/ViewFrame";
import { Reveal } from "@/components/ui/Reveal";
import { services } from "@/lib/content";
import { motionTokens, springs } from "@/lib/motion-tokens";
import { PIECES, SEQUENCE_LABEL, SPECS, STEPS, keynote, stepAt } from "@/components/shop/sequence";

/** three.js / R3F stay out of the server bundle: the canvas loads on the client only. */
const ShopStage = dynamic(() => import("@/components/shop/ShopStage"), {
  ssr: false,
  loading: () => <p className="hud absolute inset-0 grid place-items-center text-fog">Loading model</p>,
});

const fab = services.find((s) => s.id === "fabrication");
const TOTAL = keynote(STEPS.length - 1);

/**
 * 02 · Detail 5 on sheet M-501 — how the shop makes rectangular duct, as a detail of
 * the drawing set: a pinned, scroll-scrubbed 3D sequence inside a detail callout, its
 * steps as the keynote legend beside it (desktop) or under it (mobile). Layout switches
 * on the prefers-reduced-motion media query in CSS, so server and client markup always
 * match: reduced motion gets no pin, the finished run drawn once, and every keynote's text.
 */
export default function Shop() {
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  // critically damped: tracks the (already Lenis-smoothed) scroll without overshooting a step boundary
  const progress = useSpring(scrollYProgress, springs.follow);
  const webgl = useWebGL2();
  const [active, setActive] = useState(0);
  useMotionValueEvent(progress, "change", (v) => setActive(stepAt(v)));

  if (!fab) return null;

  const fade = reduce
    ? { duration: motionTokens.duration.fast }
    : { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth };
  const chip: Variants = {
    hidden: { opacity: 0, y: motionTokens.distance.sm },
    visible: { opacity: 1, y: 0, transition: fade },
  };

  return (
    <ViewFrame
      id="shop"
      titleId="shop-title"
      number="02"
      sheet="M-501"
      name="Detail 5 · Rectangular duct"
      kind="Detail"
      scale="1:10"
      intro={fab.body}
    >
      {/* The pinned sequence: a tall track with a sticky box inside, sized to the screen between the
          ribbon and the status bar (--status-h, 0 until the chrome sets it); on desktop the grid's one
          row is held to that box, so the canvas and its legend never run below the fold. */}
      <div ref={track} className="relative motion-safe:h-[320vh]">
        <div className="motion-safe:sticky motion-safe:top-[var(--nav-h)] motion-safe:h-[calc(100svh_-_var(--nav-h)_-_var(--status-h,0px))]">
          <div className="flex h-full flex-col gap-5 py-4 lg:grid lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)] lg:gap-10 lg:py-8">
            {/* the detail callout: a dashed, round-cornered boundary with its head on a leader */}
            <div className="relative order-first shrink-0 motion-safe:h-[58%] motion-reduce:h-[62vh] lg:order-none lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:motion-safe:h-full">
              <span aria-hidden className="pointer-events-none absolute -inset-1.5 rounded-[14px] border border-dashed border-cyan/40" />
              <div
                role="img"
                aria-label={SEQUENCE_LABEL}
                className="relative isolate h-full overflow-hidden rounded-md border border-hair bg-void"
              >
                {webgl && (
                  <GLBoundary>
                    <ShopStage progress={progress} />
                  </GLBoundary>
                )}
                <DetailHud active={active} progress={progress} />
              </div>
              <CalloutHead />
            </div>
            <div className="lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:self-center">
              <KeynoteLegend active={active} />
              <StepReadout active={active} />
              <MobileStep active={active} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-12 pt-16 md:pt-24 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <Panel title="Properties" meta="Shop standard" bodyClassName="[&>dl:last-child>div:last-child]:border-b-0">
            <PropGroup
              label="Identity data"
              rows={[
                { k: "Service", v: fab.title },
                { k: "Scope", v: fab.items.join(" · ") },
              ]}
            />
            <PropGroup label="Construction" rows={SPECS} />
          </Panel>
        </Reveal>
        <div className="lg:col-span-7">
          <h3 className="eyebrow text-fog">Typical pieces</h3>
          <motion.ul
            className="mt-5 flex flex-wrap gap-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ visible: { transition: { staggerChildren: reduce ? 0 : motionTokens.stagger } } }}
          >
            {PIECES.map((piece, i) => (
              <motion.li
                key={piece}
                data-reveal
                variants={chip}
                className="mono inline-flex items-center gap-2.5 rounded-[3px] border border-cyan/20 bg-panel/80 px-3 py-2 text-[12px] uppercase tracking-[0.1em] text-chalk"
              >
                <span className="text-cyan">{keynote(i)}</span>
                {piece}
              </motion.li>
            ))}
          </motion.ul>
          <p className="mt-6 max-w-md text-[14px] leading-relaxed text-fog">The shop builds rectangular duct only.</p>
        </div>
      </div>
    </ViewFrame>
  );
}

/** One group of the properties palette (Revit's "Identity data", "Construction"…) as key / value rows. */
function PropGroup({ label, rows }: { label: string; rows: readonly { k: string; v: string }[] }) {
  return (
    <>
      <p className="hud border-b border-hair bg-raised/50 px-4 py-2 text-mist">{label}</p>
      <dl>
        {rows.map((r) => (
          <div key={r.k} className="grid grid-cols-[8.5rem_1fr] gap-4 border-b border-hair/70 px-4 py-3.5">
            <dt className="hud pt-[3px] text-fog">{r.k}</dt>
            <dd className="text-[14px] leading-snug text-chalk">{r.v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * The keynote legend: desktop, and the reduced-motion list on every width; on mobile it
 * stays in the accessibility tree only. Desktop shows one row per step — every keynote and
 * title, the current one lit — with its text in StepReadout, so all seven fit the pinned
 * box on a laptop. Reduced motion lists every step's text. Inactive titles step down a
 * colour tier rather than fading, so every row keeps AA contrast; the highlight carries the motion.
 */
function KeynoteLegend({ active }: { active: number }) {
  return (
    <div>
      <p className="hud flex items-center justify-between gap-4 border-b border-hair pb-2.5 text-fog">
        <span>
          <span className="text-chalk">Keynotes</span> · Detail 5
        </span>
        <span className="motion-reduce:hidden">Scroll to build</span>
      </p>
      <ol className="sr-only mt-2 lg:not-sr-only motion-reduce:not-sr-only">
        {STEPS.map((s, i) => {
          const isActive = i === active;
          return (
            <li key={s.id} className="relative flex items-start gap-3 py-2.5 pl-2.5 pr-2 lg:motion-safe:py-[7px]">
              {isActive && (
                <motion.span
                  layoutId="shop-keynote"
                  aria-hidden
                  className="absolute inset-0 rounded-[3px] border-l-2 border-cyan bg-cyan/[0.07] motion-reduce:hidden"
                  transition={springs.snappy}
                />
              )}
              <span
                aria-hidden
                className={`mono relative grid h-6 w-7 shrink-0 place-items-center rounded-[2px] border border-hair text-[11px] text-fog ${
                  isActive ? "motion-safe:border-cyan motion-safe:text-cyan" : ""
                }`}
              >
                {keynote(i)}
              </span>
              <div className="relative pt-[3px]">
                <h3 className={`text-[16px] font-bold leading-tight text-chalk ${isActive ? "" : "motion-safe:text-mist"}`}>{s.title}</h3>
                {/* with motion the readout shows this visually; it stays here for screen readers */}
                <p className="mt-1 text-[14px] leading-snug text-mist motion-safe:sr-only">{s.line}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Readout swap: the old line clears quickly, the new one settles in just behind it. */
const LINE_IN = {
  opacity: 1,
  y: 0,
  transition: { duration: motionTokens.duration.normal, delay: motionTokens.duration.instant, ease: motionTokens.easing.smooth },
};
const LINE_OUT = {
  opacity: 0,
  y: -motionTokens.distance.xs,
  transition: { duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth },
};

/**
 * Desktop: the current keynote's text under the legend. Every line shares one grid cell,
 * so the readout is always as tall as the longest and nothing reflows as the steps change.
 * A visual duplicate of the legend, so hidden from assistive tech.
 */
function StepReadout({ active }: { active: number }) {
  return (
    <div aria-hidden className="mt-4 hidden border-t border-hair pt-4 lg:motion-safe:grid">
      {STEPS.map((s, i) => (
        <motion.p
          key={s.id}
          className="col-start-1 row-start-1 text-[14px] leading-snug text-mist"
          initial={false}
          animate={i === active ? LINE_IN : LINE_OUT}
        >
          {s.line}
        </motion.p>
      ))}
    </div>
  );
}

/** Mobile: the active keynote under the canvas. A visual duplicate of the legend, so hidden from assistive tech. */
function MobileStep({ active }: { active: number }) {
  const step = STEPS[active];
  return (
    <div aria-hidden className="mt-3 lg:hidden motion-reduce:hidden">
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <span key={s.id} className={`h-[2px] flex-1 ${i <= active ? "bg-cyan" : "bg-hair"}`} />
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.id}
          className="mt-4"
          initial={{ opacity: 0, y: motionTokens.distance.sm }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -motionTokens.distance.sm }}
          transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth }}
        >
          <p className="hud text-fog">
            Keynote <span className="text-cyan">{keynote(active)}</span> / {TOTAL}
          </p>
          <p className="mt-1 text-[17px] font-bold leading-tight text-chalk">{step.title}</p>
          <p className="mt-1 text-[14px] leading-snug text-mist">{step.line}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** The callout head: a leader off the dashed boundary into a detail bubble (detail 5 over sheet M-501). */
function CalloutHead() {
  return (
    <div aria-hidden className="pointer-events-none absolute -left-1.5 top-5 z-40 flex items-center">
      <span className="h-px w-3.5 bg-cyan/70" />
      <span className="grid h-11 w-11 shrink-0 grid-rows-2 rounded-full border border-cyan/80 bg-void text-center">
        <span className="mono flex items-end justify-center border-b border-cyan/50 pb-0.5 text-[13px] font-semibold leading-none text-chalk">
          5
        </span>
        <span className="mono flex items-start justify-center pt-1 text-[8.5px] leading-none tracking-[0.04em] text-cyan">M-501</span>
      </span>
      <span className="hud ml-3 hidden text-fog sm:block">
        <span className="text-chalk">Shop sequence</span>
        <br />
        Detail 5 · 1:10
      </span>
    </div>
  );
}

/** Detail chrome over the canvas: cyan crop marks, the duct size, and the scrubbed keynote progress. */
function DetailHud({ active, progress }: { active: number; progress: MotionValue<number> }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      <CropMarks className="m-2.5" />
      <p className="hud absolute right-5 top-5 hidden text-fog sm:block">Typ. 24 × 12 in duct · illustrative</p>
      <div className="absolute inset-x-5 bottom-4 flex items-center gap-3 motion-reduce:hidden">
        <span className="hud text-cyan">{keynote(active)}</span>
        <span className="relative h-px flex-1 overflow-hidden bg-hair">
          <motion.span className="absolute inset-0 origin-left bg-cyan" style={{ scaleX: progress }} />
        </span>
        <span className="hud text-fog">{TOTAL}</span>
      </div>
    </div>
  );
}
