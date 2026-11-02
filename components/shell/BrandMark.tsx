"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import LogoMark from "@/components/brand/LogoMark";
import { motionTokens } from "@/lib/motion-tokens";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * LogoMark strokes its ring with var(--graphite): the logo's dark grey, about
 * 3:1 on the navy void, so the ring all but disappears. Scope the variable to
 * the logo's light grey, which reads on every dark surface of the set.
 */
const LIGHT_RING = { "--graphite": "rgb(var(--silver-rgb))" } as CSSProperties;

type Props = {
  /** "load": draws once after hydration · "view": draws the first time it scrolls into view · "none": always finished */
  draw?: "none" | "load" | "view";
  /** seconds before the draw starts */
  delay?: number;
  /** classes for the <svg> itself (size it here) */
  className?: string;
  /** accessible name; omit for a decorative mark */
  title?: string;
};

/**
 * The AAM mark for dark surfaces, optionally drawing itself: ring, then the
 * three streams, then the arrowheads. Server HTML and no-JS show the finished
 * mark; the client rewinds it before first paint only when it is about to draw,
 * and reduced motion always shows it finished.
 */
export function BrandMark({ draw = "none", delay = 0, className, title }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [progress, setProgress] = useState(1);
  const [armed, setArmed] = useState(false);

  // Decided once, at mount.
  useIsoLayoutEffect(() => {
    if (draw === "none" || reduce) return;
    const r = ref.current?.getBoundingClientRect();
    // Never rewind a mark the visitor can already see.
    if (draw === "view" && r && r.top < window.innerHeight && r.bottom > 0) return;
    setProgress(0);
    setArmed(true);
  }, []);

  const go = armed && (draw === "load" || inView);
  useEffect(() => {
    if (!go) return;
    const controls = animate(0, 1, {
      duration: motionTokens.duration.crawl * 2,
      delay,
      ease: motionTokens.easing.linear, // LogoMark eases each stage itself
      onUpdate: setProgress,
    });
    return () => controls.stop();
  }, [go, delay]);

  const isLoad = draw === "load";
  return (
    <motion.span
      ref={ref}
      // "load" stays hidden until hydration so the finished server mark never flashes before it rewinds.
      data-reveal={isLoad ? "" : undefined}
      className="block"
      style={LIGHT_RING}
      initial={isLoad ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? motionTokens.duration.fast : motionTokens.duration.normal }}
    >
      <LogoMark progress={progress} className={className} title={title} />
    </motion.span>
  );
}
