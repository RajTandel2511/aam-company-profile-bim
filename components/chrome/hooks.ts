"use client";

import { useEffect, useRef, useState } from "react";
import { useWebGL2 } from "@/components/GLBoundary";
import { flyTo, useViewer } from "@/lib/viewer-state";
import { VIEWS, type ViewId } from "./views";

/** The view whose section crosses a thin band just above mid-screen is the current one. */
export function useActiveView(): ViewId {
  const [active, setActive] = useState<ViewId>("hero");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id as ViewId);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const v of VIEWS) {
      const el = document.getElementById(v.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return active;
}

/**
 * Whether to offer the drone view. WebGL2 is assumed until it has been checked,
 * so the controls are in the first paint for nearly everyone (no layout shift),
 * and they drop out once the browser turns out not to have it. Pair the control
 * with the class "hidden [.js_&]:inline-flex" so a page without JS never shows it.
 */
export function useCanFly(): boolean {
  const webgl = useWebGL2();
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(true), []);
  return !checked || webgl;
}

/**
 * Enters the drone view from a control, and hands keyboard focus back to that
 * control when the drone view closes (the ribbon hides while flying, so the
 * browser drops focus on the way in).
 */
export function useDroneLauncher<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const armed = useRef(false);
  const { drone } = useViewer();
  useEffect(() => {
    if (drone || !armed.current) return;
    armed.current = false;
    ref.current?.focus({ preventScroll: true });
  }, [drone]);
  const launch = () => {
    armed.current = true;
    flyTo("aerial");
  };
  return { ref, launch };
}
