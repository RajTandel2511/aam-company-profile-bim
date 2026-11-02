"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { BASE, photos } from "@/lib/content";
import { motionTokens, springs } from "@/lib/motion-tokens";
import { Reveal } from "@/components/ui/Reveal";
import Lightbox from "./Lightbox";
import { Plus, Ticks, pad, type ReelPhoto } from "./parts";

/**
 * Intrinsic pixel sizes of /public/photos (content.ts carries none).
 * ponytail: a photo missing here renders at 4:3; add its size when content.ts gains one.
 */
const SIZE: Record<string, readonly [number, number]> = {
  "/photos/rooftop-ductwork.jpg": [1200, 1600],
  "/photos/rooftop-units.jpg": [1600, 900],
  "/photos/rtu-disconnect.jpg": [1200, 1600],
  "/photos/rtu-install.jpg": [1200, 1600],
  "/photos/duct-transition.jpg": [1200, 1600],
};
const FALLBACK_SIZE = [1600, 1200] as const;

const ITEMS: ReelPhoto[] = photos.map((p) => {
  const [w, h] = SIZE[p.src] ?? FALLBACK_SIZE;
  return { ...p, url: `${BASE}${p.src}`, w, h };
});

/** When every photo comes from one job it is named once, above the sheet, instead of under each frame. */
const JOBS = [...new Set(photos.map((p) => p.project))];
const SHARED_JOB = JOBS.length === 1 ? JOBS[0] : null;

/**
 * Justified rows: each frame's basis is the row height times its aspect ratio and it
 * grows to fill the row, but never past this multiple, so a lone last frame stays small.
 */
const MAX_GROW = 1.6;

// Rest states are constant (they are the SSR markup); ZOOM_STILL drops the transform under reduced motion.
const ZOOM: Variants = { rest: { scale: 1 }, hover: { scale: motionTokens.scale.pop } };
const ZOOM_STILL: Variants = { rest: { scale: 1 }, hover: { scale: 1 } };
const SHOW: Variants = { rest: { opacity: 0, y: motionTokens.distance.xs }, hover: { opacity: 1, y: 0 } };

/**
 * Reference images: field photos as a sheet of framed references, each with a callout
 * number and caption. Frames sit in justified rows at their own aspect ratios (one row
 * on desktop, wrapping on smaller screens). A frame opens the lightbox.
 */
export default function ReferenceSheet() {
  const reduce = useReducedMotion();
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setIsMounted(true), []);

  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus();
  }, []);

  const fast = { duration: motionTokens.duration.fast };
  const tagTiming = reduce ? fast : springs.snappy;
  const zoomTiming = reduce ? fast : { duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth };
  const enter = (i: number) =>
    reduce ? fast : { duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth, delay: i * motionTokens.stagger };

  return (
    <div className="mt-20 md:mt-28">
      <Reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hair pb-4">
        <div>
          <h3 className="display text-[clamp(1.6rem,3.2vw,2.4rem)] text-chalk">Reference images</h3>
          <p className="hud mt-2.5 text-fog">
            Field photos of our installed work
            {SHARED_JOB && (
              <>
                {" · "}
                <span className="text-mist">{SHARED_JOB}</span>
              </>
            )}
          </p>
        </div>
        <p aria-hidden className="hud text-fog">
          {pad(ITEMS.length)} refs · select to enlarge
        </p>
      </Reveal>

      <ul aria-label="Reference images" className="mt-8 flex flex-wrap gap-4 [--row:clamp(140px,17vw,240px)]">
        {ITEMS.map((p, i) => {
          const ratio = p.w / p.h;
          return (
            <motion.li
              key={p.src}
              data-reveal
              initial={{ opacity: 0, y: motionTokens.distance.md }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={enter(i)}
              style={{
                flexGrow: ratio,
                flexBasis: `calc(var(--row) * ${ratio})`,
                maxWidth: `calc(var(--row) * ${ratio * MAX_GROW})`,
              }}
            >
              <figure>
                <motion.button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setOpen(i);
                  }}
                  initial="rest"
                  animate="rest"
                  whileHover="hover"
                  whileFocus="hover"
                  style={{ aspectRatio: `${p.w} / ${p.h}` }}
                  className="group relative block w-full overflow-hidden rounded-[3px] border border-hair bg-panel transition-colors hover:border-cyan/50"
                >
                  <span className="sr-only">Open larger view: </span>
                  <motion.span variants={reduce ? ZOOM_STILL : ZOOM} transition={zoomTiming} className="block h-full w-full">
                    <img
                      src={p.url}
                      alt={p.alt}
                      width={p.w}
                      height={p.h}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  </motion.span>
                  <span
                    aria-hidden
                    className="absolute inset-2.5 text-cyan opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <Ticks className="inset-0" />
                  </span>
                  {/* Callout bubble: the reference number, as on a drawing. */}
                  <span
                    aria-hidden
                    className="mono absolute left-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full border border-cyan/80 bg-void/85 text-[12px] font-semibold text-chalk"
                  >
                    {i + 1}
                  </span>
                  <motion.span aria-hidden variants={SHOW} transition={tagTiming} className="bim-tag absolute bottom-2.5 right-2.5">
                    View <Plus />
                  </motion.span>
                </motion.button>
                <figcaption className="mt-2.5 flex gap-2.5">
                  <span className="hud shrink-0 pt-px text-cyan">Ref. {pad(i + 1)}</span>
                  {/* With one shared job the caption repeats the image's alt text, so screen readers skip it. */}
                  <span aria-hidden={SHARED_JOB ? true : undefined} className="line-clamp-2 text-[13px] leading-snug text-mist">
                    {SHARED_JOB ? p.alt : p.project}
                  </span>
                </figcaption>
              </figure>
            </motion.li>
          );
        })}
      </ul>

      {isMounted &&
        createPortal(
          <AnimatePresence>
            {open !== null && <Lightbox key="work-lightbox" photos={ITEMS} start={open} onClose={close} />}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
