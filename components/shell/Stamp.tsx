"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/lib/motion-tokens";

/** A stamp starts this far oversize and this far over-turned, then lands. */
const LIFT_SCALE = 1.3;
const LIFT_TURN = -9; // degrees

type Props = {
  /** resting rotation in degrees: rubber stamps never land square */
  tilt?: number;
  /** seconds before it lands (stagger) */
  delay?: number;
  /** ink colour + layout classes; the face draws in currentColor */
  className?: string;
  children: ReactNode;
};

/**
 * A rubber stamp landing on the sheet the first time it scrolls into view: it
 * drops from oversize and over-turned, squashes past flat (the bounce easing)
 * and settles at its tilt. Reduced motion: a short fade, already at rest.
 */
export function Stamp({ tilt = 0, delay = 0, className = "", children }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, scale: LIFT_SCALE, rotate: tilt + LIFT_TURN }}
      whileInView={{ opacity: 1, scale: 1, rotate: tilt }}
      viewport={{ once: true, margin: "-80px" }}
      transition={
        reduce
          ? { duration: motionTokens.duration.fast }
          : { duration: motionTokens.duration.normal, ease: motionTokens.easing.bounce, delay }
      }
    >
      {children}
    </motion.div>
  );
}
