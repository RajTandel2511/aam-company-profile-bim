"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { springs } from "@/lib/motion-tokens";
import { setViewer, useViewer, VISUAL_STYLES } from "@/lib/viewer-state";

type Props = {
  /** "sm": the ribbon's compact control · "lg": full-width, touch-sized (menu sheet, drone HUD) */
  size?: "sm" | "lg";
  className?: string;
};

/**
 * The model's visual style — Holo / Shaded / Wire — as a group of toggle
 * buttons (aria-pressed); the lit segment slides to the chosen one. Inside a
 * fixed bar, render it under a motion `layoutRoot` so page scroll never skews
 * the slide.
 */
export function StyleSwitch({ size = "sm", className = "" }: Props) {
  const { style } = useViewer();
  const reduce = useReducedMotion() ?? false;
  const id = useId(); // one sliding segment per instance (the ribbon and the sheet can both be mounted)
  const big = size === "lg";

  return (
    <div role="group" aria-label="Visual style" className={`flex items-center rounded-[5px] border border-hair bg-void/70 p-[2px] ${className}`}>
      {VISUAL_STYLES.map((s) => {
        const on = style === s.id;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={() => setViewer({ style: s.id })}
            className={`hud relative rounded-[3px] transition-colors focus-visible:outline-offset-0 ${big ? "h-11 flex-1 px-4" : "h-6 px-2.5"} ${
              on ? "text-cyan" : "text-fog hover:text-mist"
            }`}
          >
            {on && (
              <motion.span
                layoutId={`style-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-[3px] border border-cyan/45 bg-cyan/10 shadow-[0_0_14px_-4px_rgb(var(--cyan-rgb)/0.6)]"
                transition={reduce ? { duration: 0 } : springs.snappy}
              />
            )}
            <span className="relative">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
