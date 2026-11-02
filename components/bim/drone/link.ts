import type { CameraControls } from "@react-three/drei";

/** Drone-mode lens: vertical fov in degrees, widened by PORTRAIT_LENS × (1 - aspect) on portrait screens. */
export const DRONE_LENS = 40;
export const PORTRAIT_LENS = 32;

/**
 * The runtime link between the drone pieces. DroneControls (inside the canvas)
 * publishes its controls here while drone mode is on; CameraRig drives the
 * camera only while `controls` is null and glides it back onto the scroll track
 * after; the scene clocks read the X-ray / section the drone asks for; the HUD's
 * keys steer the controls. Plain mutable fields read inside frame loops — never cache them.
 */
export const droneLink = {
  controls: null as CameraControls | null,
  /** X-ray and section-box targets while flying, 0..1 (set per preset shot) */
  xray: 0,
  cut: 0,
  /** 1 while the drone flies; eases 1 -> 0 while the camera glides back onto the track (written by CameraRig) */
  weight: 0,
  /** the viewer's presetNonce already flown, so re-entering drone mode never replays an old request */
  nonce: 0,
};
