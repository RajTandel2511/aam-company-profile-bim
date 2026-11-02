"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo, type Variants } from "motion/react";
import { motionTokens } from "@/lib/motion-tokens";
import { Arrow, Cross, RoundButton, Ticks, pad, type ReelPhoto } from "./parts";

/** A short drag still counts as a swipe when it is flicked at least this fast (px/s). */
const FLICK_VELOCITY = 400;

const SLIDE: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * motionTokens.distance.xl }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: -d * motionTokens.distance.xl }),
};

type Props = { photos: ReelPhoto[]; start: number; onClose: () => void };

/**
 * Full-screen photo viewer, mounted (in a portal, inside AnimatePresence) only while
 * open: focus trap, Esc closes, arrow keys and swipe step through, page scroll locked.
 * The opener restores focus in its onClose.
 */
export default function Lightbox({ photos, start, onClose }: Props) {
  const reduce = useReducedMotion();
  const [[index, dir], setView] = useState<[number, number]>([start, 0]);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragged = useRef(false);
  const n = photos.length;
  const photo = photos[index];
  const timing = reduce
    ? { duration: motionTokens.duration.fast }
    : { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth };
  // Reduced motion: slides crossfade in place (an x offset would jump, not glide).
  const slideDir = reduce ? 0 : dir;

  const step = useCallback((d: 1 | -1) => setView(([i]) => [(i + d + n) % n, d]), [n]);

  // Scroll lock (with scrollbar compensation, so the page behind does not shift) + initial focus.
  useEffect(() => {
    const { body, documentElement } = document;
    const prev = [body.style.overflow, body.style.paddingRight];
    const gap = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    closeRef.current?.focus();
    return () => {
      body.style.overflow = prev[0];
      body.style.paddingRight = prev[1];
    };
  }, []);

  // Keys are read on the document so they work wherever focus sits, even after a click on the photo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "Tab") {
        const root = rootRef.current;
        const nodes = root?.querySelectorAll<HTMLElement>("button");
        if (!root || !nodes?.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const inside = root.contains(document.activeElement);
        if (e.shiftKey && (!inside || document.activeElement === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const onDragEnd = (_: unknown, { offset, velocity }: PanInfo) => {
    const travel = Math.abs(offset.x);
    const flicked = travel > motionTokens.distance.sm && Math.abs(velocity.x) > FLICK_VELOCITY;
    if (travel > motionTokens.distance.xl || flicked) step(offset.x < 0 ? 1 : -1);
  };

  // A click on the empty stage closes; the click that ends a swipe does not.
  const onStageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragged.current && e.target === e.currentTarget) onClose();
  };

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-lightbox-title"
      className="fixed inset-0 z-[100] flex flex-col bg-void/[0.97]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={timing}
    >
      <div aria-hidden className="blueprint pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative flex items-center justify-between gap-4 px-[var(--gutter)] pb-3 pt-4">
        <p id="work-lightbox-title" className="hud text-mist">
          <span aria-hidden>
            <span className="text-cyan">Ref. {pad(index + 1)}</span> <span className="text-fog">/ {pad(n)}</span>
          </span>
          <span className="sr-only">
            Field photo {index + 1} of {n}
          </span>
        </p>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close photo viewer"
          onClick={onClose}
          className="hud inline-flex h-11 items-center gap-3 rounded-full border border-hair bg-void/40 px-4 text-chalk transition-colors hover:border-cyan/60"
        >
          Close
          <span aria-hidden className="text-fog">
            Esc
          </span>
          <Cross />
        </button>
      </div>

      <motion.div
        className="relative mx-[var(--gutter)] min-h-0 flex-1"
        initial={{ scale: motionTokens.scale.subtle }}
        animate={{ scale: 1 }}
        exit={{ scale: reduce ? 1 : motionTokens.scale.subtle }}
        transition={timing}
      >
        <Ticks className="inset-0 text-cyan/50" />
        <AnimatePresence initial={false} custom={slideDir}>
          <motion.div
            key={index}
            custom={slideDir}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={timing}
            drag="x"
            dragSnapToOrigin
            onPointerDownCapture={() => {
              dragged.current = false;
            }}
            onDragStart={() => {
              dragged.current = true;
            }}
            onDragEnd={onDragEnd}
            onClick={onStageClick}
            className="absolute inset-0 flex cursor-grab touch-pan-y select-none items-center justify-center p-3 active:cursor-grabbing md:p-6"
          >
            <img
              src={photo.url}
              alt={photo.alt}
              width={photo.w}
              height={photo.h}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-auto max-h-full w-auto max-w-full rounded-[3px] object-contain"
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="relative flex items-end justify-between gap-6 px-[var(--gutter)] pb-6 pt-4">
        <div className="min-w-0">
          {/* Shown for sighted visitors; screen readers already get it as the image's alt text. */}
          <p aria-hidden className="max-w-2xl text-[15px] leading-snug text-mist">
            {photo.alt}
          </p>
          <p className="hud mt-2 text-fog">{photo.project}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <RoundButton label="Previous photo" onClick={() => step(-1)}>
            <Arrow dir={-1} />
          </RoundButton>
          <RoundButton label="Next photo" onClick={() => step(1)}>
            <Arrow dir={1} />
          </RoundButton>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {`Photo ${index + 1} of ${n}: ${photo.alt}. ${photo.project}.`}
      </p>
    </motion.div>
  );
}
