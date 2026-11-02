"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens, springs } from "@/lib/motion-tokens";

/** A field photo prepared for the reference sheet and the lightbox: content.ts facts + the served URL and pixel size. */
export type ReelPhoto = { src: string; url: string; alt: string; project: string; w: number; h: number };

/** Two-digit readout, BIM-schedule style: 7 -> "07". */
export const pad = (n: number) => String(n).padStart(2, "0");

/** Viewport crop marks: four L-ticks in the corners of a positioned parent. Colour follows currentColor. */
export function Ticks({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute ${className}`}>
      <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-current" />
      <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-current" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-current" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-current" />
    </span>
  );
}

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  "aria-hidden": true,
} as const;

export const Arrow = ({ dir }: { dir: 1 | -1 }) => (
  <svg {...ICON} className={dir < 0 ? "-scale-x-100" : undefined}>
    <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="square" />
  </svg>
);
export const Plus = () => (
  <svg {...ICON} width={12} height={12}>
    <path d="M8 2.5v11M2.5 8h11" />
  </svg>
);
export const Cross = () => (
  <svg {...ICON} width={14} height={14}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </svg>
);
type RoundButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
};

/** Round hairline icon button (the lightbox's previous / next). */
export function RoundButton({ label, onClick, children }: RoundButtonProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: motionTokens.scale.press }}
      transition={springs.snappy}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hair bg-void/40 text-chalk transition-colors hover:border-cyan/60 hover:bg-cyan/5"
    >
      {children}
    </motion.button>
  );
}
