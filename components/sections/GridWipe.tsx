"use client";

import { useEffect, useRef, useState } from "react";
import { createTimeline, stagger } from "animejs";
import { animeTokens, motionTokens } from "@/lib/motion-tokens";
import { useSplitReveal } from "@/lib/use-split-reveal";

const ROWS = 6;
const COLS = { wide: 24, narrow: 12 } as const;
const ms = animeTokens.ms;
/** The scan line's sweep across the sheets (s); every column flashes as the line crosses it. */
const SWEEP = motionTokens.duration.crawl * 1.6;
/** anime's name for motionTokens.easing.linear: the line moves at constant speed so the per-column stagger stays under it. */
const LINEAR = "linear";

/**
 * View switch: the hand-off from the 3D coordination model to the drawing set, built on
 * anime.js's grid stagger. A sheaf of blank sheets lands from the centre out, then a cyan
 * scan line sweeps across it — each column flashes as the line passes and comes out a
 * drawing sheet — and the caption rises. Plays once, on first view. The flash and the
 * sheet linework are pre-coloured overlay spans whose opacity animates (never a colour).
 * Reduced motion, or no JS: the finished sheets, static.
 */
export default function GridWipe() {
  const root = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  // armed: the sheets hide half a screen before they scroll in, so the landing never pops visible sheets away
  const [armed, setArmed] = useState(false);
  const [play, setPlay] = useState(false);
  useSplitReveal(caption, { play, delay: motionTokens.duration.crawl });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setPlay(true);
      return;
    }
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const arm = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        if (animate) setArmed(true);
        arm.disconnect();
      },
      { rootMargin: "50% 0px" },
    );
    const go = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setPlay(true);
        go.disconnect();
      },
      { threshold: 0.35 },
    );
    arm.observe(el);
    go.observe(el);
    return () => {
      arm.disconnect();
      go.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!play || !armed || !el) return;
    const cols = window.innerWidth < 768 ? COLS.narrow : COLS.wide;
    const pick = (sel: string) => Array.from(el.querySelectorAll<HTMLElement>(sel)).slice(0, cols * ROWS);
    const grid = [cols, ROWS];
    const perColumn = stagger(ms(SWEEP / cols), { grid, axis: "x", from: "first" });
    const tl = createTimeline({ defaults: { ease: animeTokens.ease.smooth } })
      .add(pick("[data-tile]"), {
        scale: [0, 1],
        rotate: ["-90deg", "0deg"],
        opacity: [0, 1],
        duration: ms(motionTokens.duration.crawl),
        delay: stagger(ms(motionTokens.charStagger * 1.4), { grid, from: "center" }),
      })
      .add(
        pick("[data-scan]"),
        {
          x: ["0%", "100%"],
          opacity: [
            { to: 1, duration: ms(motionTokens.duration.fast) },
            { to: 1, duration: ms(SWEEP - motionTokens.duration.fast - motionTokens.duration.normal) },
            { to: 0, duration: ms(motionTokens.duration.normal) },
          ],
          duration: ms(SWEEP),
          ease: LINEAR,
        },
        `-=${ms(motionTokens.duration.slow)}`,
      )
      .add(
        pick("[data-flash]"),
        {
          opacity: [
            { to: 1, duration: ms(motionTokens.duration.fast) },
            { to: 0, duration: ms(motionTokens.duration.slow) },
          ],
          delay: perColumn,
        },
        "<<",
      )
      .add(pick("[data-sheet]"), { opacity: [0, 1], duration: ms(motionTokens.duration.normal), delay: perColumn }, "<<");
    return () => {
      tl.revert();
    };
  }, [play, armed]);

  return (
    <section aria-labelledby="gridwipe-caption" className="blueprint relative overflow-hidden bg-void py-20 md:py-28">
      <div ref={root} data-armed={armed || undefined} className="group container-x">
        <p aria-hidden className="hud mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-fog">
          <span>View switch</span>
          <span className="h-px w-6 bg-hair" />
          <span className="text-mist">01 · Coordination model</span>
          <span className="text-cyan">→</span>
          <span className="text-chalk">02 · Detail 5 · Rectangular duct</span>
        </p>
        <div aria-hidden className="relative overflow-hidden">
          <div className="grid grid-cols-12 gap-1.5 md:grid-cols-[repeat(24,minmax(0,1fr))] md:gap-2">
            {Array.from({ length: COLS.wide * ROWS }, (_, i) => (
              <span
                key={i}
                data-tile
                className={`relative aspect-[3/2] rounded-[2px] border border-hair bg-panel group-data-[armed]:opacity-0 ${
                  i >= COLS.narrow * ROWS ? "max-md:hidden" : ""
                }`}
              >
                {/* the drawing each blank becomes: an inner border and a title-block line */}
                <span data-sheet className="absolute inset-[3px] rounded-[1px] border border-cyan/40 group-data-[armed]:opacity-0">
                  <span className="absolute bottom-[18%] right-[10%] h-px w-[42%] bg-cyan/60" />
                </span>
                <span data-flash className="absolute inset-0 rounded-[2px] bg-cyan/60 opacity-0" />
              </span>
            ))}
          </div>
          {/* the scan: a full-width strip parked off the left edge; its right edge is the line */}
          <span
            data-scan
            className="pointer-events-none absolute inset-y-0 right-full w-full border-r-2 border-cyan bg-gradient-to-r from-transparent from-70% to-cyan/15 opacity-0"
          />
        </div>
        <p
          id="gridwipe-caption"
          ref={caption}
          data-split
          className="display mx-auto mt-12 max-w-[22ch] text-center text-[clamp(1.6rem,3.6vw,3rem)] text-chalk"
        >
          Every duct in that model starts as a flat sheet in our shop.
        </p>
      </div>
    </section>
  );
}
