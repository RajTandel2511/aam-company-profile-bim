"use client";

import { useEffect, useRef } from "react";
import { bim } from "./store";

const FACES = [
  { label: "S", t: "translateZ(var(--h))" },
  { label: "N", t: "rotateY(180deg) translateZ(var(--h))" },
  { label: "E", t: "rotateY(90deg) translateZ(var(--h))" },
  { label: "W", t: "rotateY(-90deg) translateZ(var(--h))" },
  { label: "TOP", t: "rotateX(90deg) translateZ(var(--h))" },
  { label: "", t: "rotateX(-90deg) translateZ(var(--h))" },
] as const;

/** Faint cyan glow inside each navy face, like a selected element's halo. */
const FACE_GLOW = "inset 0 0 10px rgb(var(--cyan-rgb) / 0.14)";

/**
 * The BIM view cube: a small CSS 3D cube on a compass ring that turns with the
 * WebGL camera (bim.view, written by CameraRig) so you always know which face
 * you're seeing. Navy faces, cyan edges; the top face is lit.
 */
export default function ViewCube({ size = 46 }: { size?: number }) {
  const cube = useRef<HTMLDivElement>(null);

  // Ticks only while on screen (a display:none parent never intersects, so hidden cubes never run).
  useEffect(() => {
    const el = cube.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    const tick = () => {
      el.style.transform = `rotateX(${(-bim.view.elevation).toFixed(2)}deg) rotateY(${(-bim.view.azimuth).toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="relative shrink-0" style={{ width: size, height: size, perspective: size * 6 }}>
      <div ref={cube} className="absolute inset-0" style={{ transformStyle: "preserve-3d", ["--h" as string]: `${size / 2}px` }}>
        {/* compass ring on the ground plane under the cube, with a north tick */}
        <div
          className="absolute -inset-[28%] rounded-full border border-cyan/30"
          style={{ transform: "rotateX(90deg) translateZ(calc(var(--h) * -1))" }}
        >
          <span className="absolute left-1/2 top-0 h-[22%] w-px -translate-x-1/2 bg-cyan/80" />
        </div>
        {FACES.map((f) => (
          <div
            key={f.t}
            className={`hud absolute inset-0 grid place-items-center border text-[9px] ${
              f.label === "TOP" ? "border-cyan/70 bg-raised/90 text-cyan" : "border-cyan/40 bg-panel/85 text-mist"
            }`}
            style={{ transform: f.t, backfaceVisibility: "hidden", boxShadow: FACE_GLOW }}
          >
            {f.label}
          </div>
        ))}
      </div>
    </div>
  );
}
