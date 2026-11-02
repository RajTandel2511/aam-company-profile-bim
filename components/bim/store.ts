/**
 * The one channel between the page (scroll, pointer) and the WebGL scene.
 * The DOM writes *targets*; the scene eases toward them once per frame, and every
 * model part reads the eased values inside useFrame — no React state, no
 * re-render per frame. Read it, never cache it: values change every frame.
 */
export type Quality = "high" | "low";

export const bim = {
  /** 0..1 — the load-time 4D construction sequence (time-driven; jumps to 1 under reduced motion). */
  intro: 0,
  /** 0..1 — eased progress through the systems story. `storyTarget` is the raw scroll value. */
  story: 0,
  storyTarget: 0,
  /** 0..1 — eased: how far the hero has scrolled away (orbit -> story camera). */
  hero: 0,
  heroTarget: 0,
  /** -1..1 normalised pointer, for camera parallax. */
  pointer: { x: 0, y: 0 },
  /** Camera orientation in degrees, written by CameraRig, read by the DOM view cube. */
  view: { azimuth: 0, elevation: 0 },
  /** Camera position in model metres, written by CameraRig every frame, read by the DOM status bar. */
  cam: { x: 0, y: 0, z: 0 },
  /** Look-at point in model metres, written by CameraRig every frame (drone readout: distance = |cam - target|). */
  target: { x: 0, y: 0, z: 0 },
  /** Scene seconds — advances only while the stage renders. Drive ambient loops (flows, pulses) from this. */
  time: 0,
  /** 0..1 derived each frame: architecture ghosting (X-ray). */
  xray: 0,
  /** 0..1 derived each frame: section box engagement (south face cut away). */
  cut: 0,
  /** prefers-reduced-motion: the finished model, no camera moves, no flows. */
  reduced: false,
  /** Shaders compiled and the canvas faded in — the 4D intro waits for this so nobody misses it. */
  stageReady: false,
  /** "low" on small / low-end devices: fewer particles, no post effects. */
  quality: "high" as Quality,
};

export type BimStore = typeof bim;
