"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { motion, useInView, useReducedMotion, useSpring, type Variants } from "motion/react";
import { BUILD_YEAR, company, contact } from "@/lib/content";
import { useMotionPaused } from "@/lib/motion-pause";
import { motionTokens, springs } from "@/lib/motion-tokens";
import { clamp } from "@/lib/timing";
import { LOGO_TAILS, LOGO_VIEWBOX } from "@/components/brand/LogoMark";
import { Panel } from "@/components/bimui/Panel";
import { ViewFrame } from "@/components/bimui/ViewFrame";
import { Reveal } from "@/components/ui/Reveal";
import { BrandMark } from "@/components/shell/BrandMark";
import { Stamp } from "@/components/shell/Stamp";
import { BID_HREF, STREAM_FILLS, viewFrame } from "@/components/shell/site";

const VIEW = viewFrame("contact");

/*
 * The streams band. The three streams and the mark share one coordinate system
 * (the band is locked to its viewBox's aspect ratio and the mark is placed in
 * band units), so each stream lands exactly on its ribbon's tail — LOGO_TAILS —
 * at every screen width. The streams draw on, then the mark draws itself.
 */
const BAND_W = 1200;
const BAND_H = 360;
const MARK_W = 420;
const [VB_X, VB_Y, VB_W, VB_H] = LOGO_VIEWBOX.split(" ").map(Number);
const K = MARK_W / VB_W; // logo units -> band units
const MARK_X = BAND_W - MARK_W;
const MARK_Y = (BAND_H - VB_H * K) / 2;
const MARK_BOX = {
  left: `${(MARK_X / BAND_W) * 100}%`,
  top: `${(MARK_Y / BAND_H) * 100}%`,
  width: `${(MARK_W / BAND_W) * 100}%`,
};
// ponytail: streams start 900 units left of the band and lean on overflow-visible to reach the viewport edge — enough for screens up to ~3000px wide; lengthen RUN_IN past that.
const RUN_IN = -900;
const ENTRY = [0.12, 0.5, 0.88]; // where each stream enters, as a share of the band height
const COLORS = ["var(--blue)", "var(--green)", "var(--red)"];
/** The logo's streams read as the model's three airflows (STREAM_FILLS order). */
const STREAM_TAGS = ["Supply air", "Exhaust / outside air", "Return air"];
const STREAM_W = 15 * K; // a ribbon's thickness at its tail, in band units
const r1 = (n: number) => Math.round(n * 10) / 10;

const STREAMS = LOGO_TAILS.map(([tx, ty], i) => {
  const x = MARK_X + (tx - VB_X) * K;
  const y = MARK_Y + (ty - VB_Y) * K;
  const y0 = ENTRY[i] * BAND_H;
  // run in level, ease across to the tail's height, then tuck under the ribbon
  const d = `M${RUN_IN} ${r1(y0)}H${r1(x * 0.33)}C${r1(x * 0.6)} ${r1(y0)} ${r1(x * 0.55)} ${r1(y)} ${r1(x * 0.82)} ${r1(y)}H${r1(x + 6 * K)}`;
  return { color: COLORS[i], d };
});

const STREAM_DRAW = motionTokens.duration.crawl * 1.6;
const FLOW_W = 2.5;
const FLOW_PERIOD = 48; // one dash + gap, in band units
const FLOW_DASH = `10 ${FLOW_PERIOD - 10}`;
const FLOW_OPACITY = 0.5;
const FLOW: Variants = {
  still: { strokeDashoffset: 0, transition: { duration: 0 } },
  flow: {
    strokeDashoffset: [0, -FLOW_PERIOD],
    transition: { duration: motionTokens.duration.crawl, ease: motionTokens.easing.linear, repeat: Infinity },
  },
};

const PULL = 0.3; // share of the pointer's offset the magnetic button follows

const MAPS_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${contact.street}, ${contact.city}`)}`;
const LINK =
  "rounded-sm underline decoration-chalk/30 underline-offset-4 transition-colors hover:text-cyan hover:decoration-cyan";

/** The transmittal: from the visitor's project team to AAM, with every way to reach the office. */
const TRANSMITTAL: { k: string; v: ReactNode }[] = [
  { k: "To", v: company.name },
  { k: "From", v: "Your project team" },
  { k: "Re", v: "Bid request — drawings & specs" },
  {
    k: "Phone",
    v: (
      <a href={contact.phoneHref} className={LINK}>
        {contact.phone}
      </a>
    ),
  },
  {
    k: "Email",
    v: (
      <a href={`mailto:${contact.email}`} className={`${LINK} [overflow-wrap:anywhere]`}>
        {contact.email}
      </a>
    ),
  },
  {
    k: "Office",
    v: (
      <a href={MAPS_HREF} target="_blank" rel="noopener noreferrer" className={LINK}>
        {contact.street}
        <br />
        {contact.city}
        <span className="sr-only"> (opens map in a new tab)</span>
      </a>
    ),
  },
  { k: "Hours", v: contact.hours },
  { k: "Fax", v: contact.fax },
];

/**
 * 06 · Saved view "Issued for bid" (G-301): the closing line, a big magnetic
 * "Send us the drawings" CTA and a stamped transmittal with every contact route,
 * then the logo's three streams drawing into the mark.
 */
export default function Contact() {
  return (
    <ViewFrame {...VIEW}>
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-7">
          <p className="display max-w-[11ch] text-[clamp(2.9rem,8.4vw,7.25rem)] text-chalk">{company.tagline}.</p>
          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-mist md:text-lg">
            HVAC, exhaust and outside air, EMS controls, maintenance and architectural sheet metal — send the drawings and
            specs, and we will put a bid together.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <MagneticCta href={BID_HREF}>
              Send us the drawings
              <Arrow />
            </MagneticCta>
            <p className="text-mist">
              or call{" "}
              <a href={contact.phoneHref} className={`${LINK} font-semibold text-chalk`}>
                {contact.phone}
              </a>
            </p>
          </div>
        </Reveal>

        <Reveal delay={motionTokens.duration.fast} className="relative lg:col-span-5">
          <Panel title="Transmittal" bodyClassName="px-4 pb-1 sm:px-5">
            <address className="not-italic">
              <dl>
                {TRANSMITTAL.map((row) => (
                  <div key={row.k} className="grid grid-cols-[4.5rem_1fr] gap-4 border-b border-hair/70 py-3.5 last:border-b-0">
                    <dt className="hud pt-[3px] text-fog">{row.k}</dt>
                    <dd className="text-[15px] leading-relaxed text-chalk">{row.v}</dd>
                  </div>
                ))}
              </dl>
            </address>
          </Panel>
          {/*
            Decorative: the view title already says "Issued for bid". pointer-events-none keeps the links under it
            clickable. Below lg it sits in the column gap above the panel, clear of the "Transmittal" label.
          */}
          <Stamp
            tilt={-8}
            delay={motionTokens.duration.normal}
            className="pointer-events-none absolute -top-14 right-1 text-red-glow lg:-right-4 lg:-top-7"
          >
            <div aria-hidden className="rounded-[6px] border-[5px] border-double border-current bg-void/85 px-4 py-2.5 text-center">
              <p className="display text-[1.1rem] leading-none tracking-[0.04em] sm:text-[1.35rem]">ISSUED FOR BID</p>
              <p className="hud mt-1.5">
                {VIEW.sheet} · {BUILD_YEAR}
              </p>
            </div>
          </Stamp>
        </Reveal>
      </div>

      <StreamBand className="mt-20 md:mt-28" />
    </ViewFrame>
  );
}

/** The logo's three streams sweep in from the viewport edge and feed the mark, which then draws itself. */
function StreamBand({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const live = useLive(ref);

  const drawIn = (i: number) =>
    reduce
      ? { pathLength: { duration: 0 }, opacity: { duration: motionTokens.duration.fast } }
      : {
          pathLength: { duration: STREAM_DRAW, ease: motionTokens.easing.smooth, delay: i * motionTokens.stagger },
          opacity: { duration: motionTokens.duration.fast, delay: i * motionTokens.stagger },
        };
  const tagIn = (i: number) =>
    reduce
      ? { duration: motionTokens.duration.fast }
      : { duration: motionTokens.duration.normal, delay: STREAM_DRAW + i * motionTokens.stagger };

  return (
    <div ref={ref} aria-hidden className={`relative ${className}`} style={{ aspectRatio: `${BAND_W} / ${BAND_H}` }}>
      <motion.svg
        viewBox={`0 0 ${BAND_W} ${BAND_H}`}
        fill="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: "-80px" }}
      >
        {STREAMS.map((s, i) => (
          <motion.path
            key={s.color}
            d={s.d}
            stroke={s.color}
            strokeWidth={STREAM_W}
            variants={{ hidden: { pathLength: 0, opacity: 0 }, shown: { pathLength: 1, opacity: 1, transition: drawIn(i) } }}
          />
        ))}
        {/* Air moving along each stream once it has arrived — only while on screen. */}
        <motion.g
          variants={{
            hidden: { opacity: 0 },
            shown: {
              opacity: reduce ? 0 : FLOW_OPACITY,
              transition: { delay: STREAM_DRAW, duration: motionTokens.duration.slow },
            },
          }}
        >
          {STREAMS.map((s) => (
            <motion.path
              key={s.color}
              d={s.d}
              stroke="var(--chalk)"
              strokeWidth={FLOW_W}
              strokeLinecap="round"
              strokeDasharray={FLOW_DASH}
              initial={false}
              animate={live && !reduce ? "flow" : "still"}
              variants={FLOW}
            />
          ))}
        </motion.g>
      </motion.svg>
      {/* BIM tags naming each stream's airflow, once it has drawn on. */}
      {STREAM_TAGS.map((tag, i) => (
        <motion.span
          key={tag}
          className="bim-tag absolute left-[3%] hidden md:inline-flex"
          style={{ top: `calc(${ENTRY[i] * 100}% - 34px)` }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={tagIn(i)}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STREAM_FILLS[i]}`} />
          {tag}
        </motion.span>
      ))}
      <div className="absolute" style={MARK_BOX}>
        <BrandMark draw="view" delay={motionTokens.duration.slow} className="block h-auto w-full" />
      </div>
    </div>
  );
}

/** True while the element is on screen, the tab is visible and motion is not paused: ambient loops run only then. */
function useLive(ref: RefObject<Element>): boolean {
  const inView = useInView(ref);
  const paused = useMotionPaused();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return inView && visible && !paused;
}

/** Primary CTA that leans toward a mouse pointer (springs.snappy). Static under reduced motion. */
function MagneticCta({ href, children }: { href: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useSpring(0, springs.snappy);
  const y = useSpring(0, springs.snappy);

  const handleMove = (e: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (reduce || !el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const max = motionTokens.distance.lg;
    x.set(clamp((e.clientX - r.left - r.width / 2) * PULL, -max, max));
    y.set(clamp((e.clientY - r.top - r.height / 2) * PULL, -max, max));
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    // The padded span is the magnet's field, so the button leans out before the pointer arrives.
    <span className="-m-6 inline-block p-6" onPointerMove={handleMove} onPointerLeave={handleLeave}>
      <motion.a
        ref={ref}
        href={href}
        style={{ x, y }}
        whileTap={{ scale: motionTokens.scale.press }}
        className="btn btn-primary px-8 py-5 text-base md:px-10 md:py-6 md:text-lg"
      >
        {children}
      </motion.a>
    </span>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}
