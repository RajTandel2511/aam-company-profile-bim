"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import ViewCube from "@/components/bim/ViewCube";
import { bim } from "@/components/bim/store";
import { CHAPTERS, STORY, chapterAt, type ChapterId } from "@/components/bim/timeline";
import { Panel, PropRow } from "@/components/bimui/Panel";
import { CropMarks, ViewTitle } from "@/components/bimui/ViewFrame";
import { DroneGlyph } from "@/components/chrome/DroneGlyph";
import { useCanFly, useDroneLauncher } from "@/components/chrome/hooks";
import { BID_HREF, viewFrame } from "@/components/shell/site";
import { services, type ServiceId } from "@/lib/content";
import { useMotionPaused } from "@/lib/motion-pause";
import { motionTokens } from "@/lib/motion-tokens";
import { useSplitReveal } from "@/lib/use-split-reveal";

type Tone = "ice" | "supply" | "copper" | "exhaust" | "amber" | "violet";

/** System colours: the model's linework (fill) and a text-safe twin (AA on the panels, over the canvas). */
const TONE: Record<Tone, { text: string; fill: string }> = {
  ice: { text: "text-chalk", fill: "bg-[#C9E7F6]" }, // galvanised sheet metal, iced
  supply: { text: "text-blue-glow", fill: "bg-supply" },
  copper: { text: "text-[#FF8A4C]", fill: "bg-[#FF8A4C]" }, // refrigerant copper, ~8:1 on the panel
  exhaust: { text: "text-green-glow", fill: "bg-exhaust" },
  amber: { text: "text-amber", fill: "bg-amber" },
  violet: { text: "text-[#B9B0FF]", fill: "bg-violet" }, // violet itself is too dark for small text over the canvas
};

type Trade = { id: ServiceId & ChapterId; tone: Tone; category: string; doneAt: number; done: string; doing: string };

/** The six trades in build order — chapter ids match content.services ids, and CHAPTERS[1..6]. */
const TRADES: Trade[] = [
  { id: "sheetmetal", tone: "ice", category: "Architectural · Envelope", doneAt: STORY.sheetmetal.glint[1], doing: "Installing", done: "Installed" },
  { id: "hvac", tone: "supply", category: "Mechanical · Supply / Return", doneAt: STORY.hvac.run, doing: "Installing", done: "Running" },
  { id: "vrf", tone: "copper", category: "Mechanical · VRF / Splits", doneAt: STORY.vrf.run, doing: "Installing", done: "Running" },
  { id: "exhaust", tone: "exhaust", category: "Mechanical · Exhaust / OA", doneAt: STORY.exhaust.run, doing: "Installing", done: "Running" },
  { id: "controls", tone: "amber", category: "Controls · EMS network", doneAt: STORY.controls.run, doing: "Commissioning", done: "Online" },
  { id: "maintenance", tone: "violet", category: "Service · Preventative", doneAt: STORY.maintenance.stops[2][1], doing: "Inspecting", done: "PM complete" },
];
const COUNT = String(TRADES.length).padStart(2, "0");

const serviceOf = (id: ServiceId) => {
  const s = services.find((x) => x.id === id);
  if (!s) throw new Error(`content.services is missing "${id}"`);
  return s;
};

const chapterIndex = (id: ChapterId) => CHAPTERS.findIndex((c) => c.id === id);

/** Visibility / Graphics: each model category, its linework, and the chapter it switches on in. */
const LEGEND = [
  { label: "Arch. sheet metal", swatch: TONE.ice.fill, from: chapterIndex("sheetmetal") },
  { label: "Supply air", swatch: "bg-supply", from: chapterIndex("hvac") },
  { label: "Return air", swatch: "bg-return", from: chapterIndex("hvac") },
  { label: "Duct wrap · FSK", swatch: "wrap", from: chapterIndex("hvac") },
  { label: "VRF / split units", swatch: "unit", from: chapterIndex("vrf") },
  { label: "Refrigerant piping", swatch: "pipe", from: chapterIndex("vrf") },
  { label: "Exhaust · outside air", swatch: "bg-exhaust", from: chapterIndex("exhaust") },
  { label: "EMS / controls", swatch: "dashed", from: chapterIndex("controls") },
  { label: "Preventative maintenance", swatch: "ring", from: chapterIndex("maintenance") },
] as const;

const VIEW = viewFrame("systems");
const INTRO =
  "Follow a typical commercial building as each system goes in — the envelope, the air, VRF and split systems, the exhaust and fresh air, the controls, and the care that keeps them all running.";

/* ------------------------------------------------------------------ parts -- */

/** The six systems as the palette's "Views" rail: each cell fills in its system's colour as it goes in. */
function Rail({ p, active }: { p: MotionValue<number>; active: number }) {
  return (
    <div>
      <p className="hud text-fog">Views · Systems in this model</p>
      <ol className="mt-2.5 grid grid-cols-6 gap-1.5" aria-label="Systems in this model">
        {TRADES.map((t, i) => (
          <RailStep key={t.id} p={p} index={i} trade={t} on={active === i + 1} />
        ))}
      </ol>
    </div>
  );
}

function RailStep({ p, index, trade, on }: { p: MotionValue<number>; index: number; trade: Trade; on: boolean }) {
  const [a, b] = CHAPTERS[index + 1].range;
  const fill = useTransform(p, [a, b], [0, 1], { clamp: true });
  return (
    <li
      aria-current={on ? "step" : undefined}
      className={`rounded-[3px] border px-1.5 pb-1.5 pt-2 transition-colors duration-300 ${on ? "border-cyan/50 bg-cyan/[0.07]" : "border-hair/70"}`}
    >
      <span className="block h-[3px] overflow-hidden rounded-full bg-hair">
        <motion.span className={`block h-full origin-left ${TONE[trade.tone].fill}`} style={{ scaleX: fill }} />
      </span>
      <span className={`hud mt-1.5 block transition-colors duration-300 ${on ? "text-chalk" : "text-fog"}`}>
        0{index + 1}
        <span className="mt-0.5 hidden truncate xl:block">{serviceOf(trade.id).short}</span>
      </span>
    </li>
  );
}

function Title({ text, play, as: As = "h3" }: { text: string; play: boolean; as?: "h3" | "p" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useSplitReveal(ref, { play, delay: motionTokens.duration.fast });
  return (
    <As ref={ref} data-split className="display mt-3 text-[1.6rem] text-chalk md:text-[clamp(1.8rem,2.4vw,2.45rem)]">
      {text}
    </As>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-1.5 md:mt-5">
      {items.map((it) => (
        <li key={it} className="hud rounded-[3px] border border-hair bg-void/60 px-2 py-1 text-mist">
          {it}
        </li>
      ))}
    </ul>
  );
}

function Prop({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="hud grid grid-cols-[7rem_1fr] gap-4 border-b border-hair/60 py-1.5 last:border-b-0">
      <dt className="text-fog">{k}</dt>
      <dd className="flex items-center gap-2 text-mist">{children}</dd>
    </div>
  );
}

type TradePanelProps = {
  trade: Trade;
  index: number;
  on: boolean;
  done: boolean;
  /** the static (reduced-motion) list shows everything; the pinned phone panel keeps to the essentials */
  full?: boolean;
};

function TradePanel({ trade, index, on, done, full = false }: TradePanelProps) {
  const s = serviceOf(trade.id);
  const paused = useMotionPaused();
  const tone = TONE[trade.tone];
  const pulse = on && !done && !paused; // only the system going in right now breathes
  const extra = full ? "" : "max-md:hidden"; // phones keep the model in view: properties and chips are desktop extras
  return (
    <>
      <p className={`eyebrow flex items-center gap-2.5 ${tone.text}`}>
        <span aria-hidden className={`h-[3px] w-4 shrink-0 rounded-full ${tone.fill}`} />
        System 0{index + 1} / {COUNT} · {s.short}
      </p>
      <Title text={s.title} play={on} />
      <dl className={`mt-4 border-y border-hair ${extra}`}>
        <Prop k="Category">{trade.category}</Prop>
        <Prop k="Status">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${done ? "bg-exhaust" : "bg-cyan"} ${pulse ? "animate-pulse" : ""}`} />
          <span className="text-chalk">{done ? trade.done : trade.doing}</span>
        </Prop>
      </dl>
      <p className={`mt-3 text-[15px] leading-relaxed text-mist md:mt-4 md:text-base ${full ? "" : "max-md:line-clamp-3"}`}>{s.body}</p>
      <div className={extra}>
        <Chips items={s.items} />
      </div>
    </>
  );
}

function IntroPanel({ on }: { on: boolean }) {
  return (
    <>
      <p className="eyebrow text-fog">
        <span className="text-cyan">[ {VIEW.number} ]</span> {VIEW.name} · {VIEW.sheet}
      </p>
      <Title text="One building. Six systems." play={on} />
      <p className="mt-3 text-[15px] leading-relaxed text-mist max-md:line-clamp-3 md:mt-4 md:text-base">{INTRO}</p>
      <p className="hud mt-5 text-fog">Scroll to build ↓ · Illustrative model · not to scale</p>
    </>
  );
}

function FinalePanel({ on }: { on: boolean }) {
  const canFly = useCanFly();
  const fly = useDroneLauncher<HTMLButtonElement>();
  // hidden chapters stay readable to screen readers, but their controls leave the Tab order
  const tab = on ? undefined : -1;
  return (
    <>
      <p className="eyebrow flex items-center gap-2 text-green-glow">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-exhaust" /> All systems running
      </p>
      <Title text="Envelope to exhaust, one contractor." play={on} />
      <p className="mt-3 text-[15px] leading-relaxed text-mist md:mt-4 md:text-base">
        Ductwork from our own shop; systems installed, controlled and maintained long after handover.
      </p>
      <div className="mt-5 flex flex-wrap gap-3 md:mt-6">
        <a href={BID_HREF} className="btn btn-primary" tabIndex={tab}>
          Request a bid
        </a>
        {canFly && (
          <button
            ref={fly.ref}
            type="button"
            onClick={fly.launch}
            tabIndex={tab}
            className="btn btn-ghost hidden border-cyan/50 text-cyan hover:border-cyan hover:bg-cyan/10 [.js_&]:inline-flex"
          >
            <DroneGlyph className="h-[18px] w-[18px]" />
            Explore in drone view
          </button>
        )}
        <a href="#shop" className="btn btn-ghost" tabIndex={tab}>
          Inside the shop <span aria-hidden>↓</span>
        </a>
      </div>
    </>
  );
}

const FOIL = { background: "repeating-linear-gradient(135deg, #DCE8F2 0 2px, #7D90B0 2px 3.5px)" } as const;

function Swatch({ kind }: { kind: string }) {
  if (kind === "dashed") return <span className="w-5 border-t-2 border-dashed border-amber" />;
  if (kind === "ring") return <span className="ml-[5px] h-2.5 w-2.5 rounded-full border-[1.5px] border-violet" />;
  // FSK foil sleeve over the duct
  if (kind === "wrap") return <span className="h-[5px] w-5 rounded-[1px]" style={FOIL} />;
  // a VRF / split unit
  if (kind === "unit") return <span className="ml-[3px] h-2.5 w-3.5 rounded-[2px] bg-[#FF8A4C]" />;
  // copper line in black closed-cell insulation
  if (kind === "pipe")
    return (
      <span className="flex h-[6px] w-5 items-center rounded-full bg-[#1C2633] px-[1.5px] ring-1 ring-[#FF8A4C]/45">
        <span className="h-[2px] w-full rounded-full bg-[#FF8A4C]" />
      </span>
    );
  return <span className={`h-[3px] w-5 rounded-full ${kind}`} />;
}

/**
 * The legend as the model's Visibility / Graphics palette: a category switches on as its system goes in.
 * data-cards-avoid (here, on the HUD and on the properties panel) keeps the mid-screen element cards clear of it.
 */
function Legend({ active }: { active: number }) {
  return (
    <div data-cards-avoid className="pointer-events-auto absolute bottom-[54px] right-[var(--gutter)] hidden w-[280px] lg:block">
      <Panel title="Visibility / Graphics" meta="Model" bodyClassName="px-4 py-3">
        <LegendRows active={active} />
      </Panel>
    </div>
  );
}

function LegendRows({ active }: { active: number }) {
  return (
    <>
      <ul className="hud space-y-1.5">
        {LEGEND.map((l) => {
          const shown = active >= l.from;
          return (
            // categories not yet in: muted text at full opacity (stays >= 4.5:1), only the swatch fades
            <li key={l.label} className={`flex items-center gap-3 transition-colors duration-500 ${shown ? "text-mist" : "text-fog"}`}>
              <span aria-hidden className={`flex w-5 shrink-0 transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-30"}`}>
                <Swatch kind={l.swatch} />
              </span>
              <span className="flex-1">{l.label}</span>
              <span className={shown ? "text-cyan" : "text-fog"}>{shown ? "On" : "Off"}</span>
            </li>
          );
        })}
      </ul>
      <p className="hud mt-3 border-t border-hair pt-2 text-fog">Values illustrative · NTS</p>
    </>
  );
}

/** Which view this is, and how it is cut: section box and X-ray switch on as the story goes inside. */
function ChapterHud({ active }: { active: number }) {
  const trade = TRADES[active - 1];
  const inside = active >= chapterIndex("hvac");
  const system = trade ? `0${active} · ${serviceOf(trade.id).short}` : active === 0 ? "Overview" : "All systems";
  const state = (on: boolean, text: string) => <span className={on ? "text-cyan" : "text-fog"}>{on ? text : "Off"}</span>;
  return (
    <div data-cards-avoid className="pointer-events-auto absolute right-[var(--gutter)] top-[calc(var(--nav-h)+20px)] hidden w-[340px] lg:block">
      <Panel title={VIEW.name} meta={`3D view · ${VIEW.sheet}`} bodyClassName="flex items-center gap-5 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <PropRow k="System" v={system} />
          <PropRow k="Section box" v={state(inside, "On · cut A–A")} />
          <PropRow k="X-ray" v={state(inside, "On")} />
        </div>
        <ViewCube size={40} />
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ story -- */

/** Reduced motion: no pinned scroll — the saved view as a plain sheet listing the six systems. */
function StaticStory() {
  return (
    <div className="container-x relative py-24 md:py-32">
      <CropMarks className="mx-[calc(var(--gutter)/2)] my-10 md:my-14" />
      <ViewTitle titleId={VIEW.titleId} number={VIEW.number} sheet={VIEW.sheet} name={VIEW.name} kind={VIEW.kind} />
      <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-mist md:text-lg">
        A typical commercial building with every system in: the envelope, the air, VRF and split systems, the exhaust and fresh
        air, the controls, and the care that keeps them all running.
      </p>
      <div className="mt-12 grid gap-x-10 gap-y-12 md:mt-16 md:grid-cols-2 xl:grid-cols-3">
        {TRADES.map((t, i) => (
          <article key={t.id} className="border-t border-hair pt-6">
            <TradePanel trade={t} index={i} on done full />
          </article>
        ))}
      </div>
    </div>
  );
}

/** Lets the pinned panel scroll on its own only while its content overflows (short or zoomed screens). */
function useOverflowScroll<T extends HTMLElement>(layout: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => el.toggleAttribute("data-lenis-prevent", el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [layout]);
  return ref;
}

/**
 * 01 · Coordination model: the drone-flown model as each trade goes in on
 * scroll. A Properties palette carries the chapter (left on desktop, a compact
 * sheet at the bottom on phones); the view HUD and the Visibility / Graphics
 * palette sit on the right. One <section> element for both layouts, so the
 * observers that watch #systems keep watching the right node.
 */
export default function Story() {
  const reduce = useReducedMotion();
  // the reduced-motion layout swaps in after mount, so the hydration render matches the server's
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const still = mounted && !!reduce;
  const section = useRef<HTMLElement>(null);
  const panel = useOverflowScroll<HTMLDivElement>(still);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  const [done, setDone] = useState(false);

  const sync = (v: number) => {
    if (reduce) return; // the finished model stands still; nothing to follow
    bim.storyTarget = v;
    const c = chapterAt(v);
    setActive(c);
    const trade = TRADES[c - 1];
    setDone(trade ? v >= trade.doneAt : false);
  };
  useMotionValueEvent(scrollYProgress, "change", sync);
  useEffect(() => {
    sync(scrollYProgress.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only reads refs and stable setters
  }, [reduce, scrollYProgress]);

  const panels = [
    <IntroPanel key="model" on={active === 0} />,
    ...TRADES.map((t, i) => <TradePanel key={t.id} trade={t} index={i} on={active === i + 1} done={active === i + 1 && done} />),
    <FinalePanel key="finale" on={active === CHAPTERS.length - 1} />,
  ];

  return (
    <section
      ref={section}
      id={VIEW.id}
      aria-labelledby={VIEW.titleId}
      // ~91 / 109 vh of scroll per chapter (8 chapters)
      className={still ? "blueprint relative isolate bg-void" : "relative h-[730vh] md:h-[870vh]"}
    >
      {still ? (
        <StaticStory />
      ) : (
        <>
          <h2 id={VIEW.titleId} className="sr-only">
            Systems — one building, trade by trade
          </h2>
          <div className="sticky top-0 h-[100svh] overflow-hidden">
            <ChapterHud active={active} />
            <Legend active={active} />

            {/* phones: a compact sheet at the bottom; desktop: centred between the ribbon and the status bar,
                capped to the screen and scrollable when it can't fit — and narrow enough to leave the
                central band to the element cards (data-cards-avoid) */}
            <div
              ref={panel}
              data-cards-avoid
              className="pointer-events-auto absolute inset-x-3 bottom-3 max-h-[46svh] overflow-y-auto overscroll-contain rounded-md [scrollbar-width:thin] md:inset-x-[var(--gutter)] md:bottom-[42px] md:max-h-[52svh] lg:bottom-auto lg:left-[var(--gutter)] lg:right-auto lg:top-[calc(50%+var(--nav-h)/2-15px)] lg:max-h-[calc(100svh-var(--nav-h)-30px-3rem)] lg:w-[min(420px,32vw)] lg:-translate-y-1/2"
            >
              <Panel title="Properties" meta={`${VIEW.sheet} · 3D view`} bodyClassName="p-5 md:p-6">
                <Rail p={scrollYProgress} active={active} />
                {/* every chapter stays in the DOM (screen readers get all of them); only the active one shows,
                    and only the active one takes up space, so the panel fits the chapter on screen */}
                <div className="relative mt-4 md:mt-6">
                  {panels.map((chapter, i) => (
                    <motion.article
                      key={CHAPTERS[i].id}
                      className={i === active ? "relative" : "absolute inset-0 overflow-hidden"}
                      initial={false}
                      animate={i === active ? "on" : "off"}
                      variants={{
                        on: {
                          opacity: 1,
                          y: 0,
                          transition: { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth, delay: motionTokens.duration.fast },
                        },
                        off: { opacity: 0, y: -motionTokens.distance.sm, transition: { duration: motionTokens.duration.fast } },
                      }}
                      style={{ pointerEvents: i === active ? "auto" : "none" }}
                    >
                      {chapter}
                    </motion.article>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
