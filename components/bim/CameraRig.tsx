"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getMotionPaused } from "@/lib/motion-pause";
import { clamp, easeInOutCubic, lerp } from "@/lib/timing";
import { DRONE_LENS, PORTRAIT_LENS, droneLink } from "./drone/link";
import { sampleTrack } from "./drone/track";
import { bim } from "./store";

/** Hero establishing orbit, spherical around its target (radius m, polar and azimuth rad). */
const HERO = { target: new THREE.Vector3(0, 8.5, 0), r: 91.6, phi: 1.323, theta: 0.698 } as const;
/** Reduced motion: the finished model framed once, no camera moves. */
const STILL = { pos: new THREE.Vector3(50, 32, 60), target: new THREE.Vector3(0, 10, 0) } as const;
/** Building envelope half-extents; within `fade` m of it the lens widens and the near plane pulls in. */
const SHELL = { x: 16.6, top: 17.8, z: 10.6, fade: 3.5 } as const;
const NEAR = { out: 0.5, in: 0.12 } as const;
/** Vertical fov in degrees: scroll-track base, and the extra inside the building (track / drone). */
const LENS = { base: 30, inside: 20, droneInside: 15 } as const;
/** Seconds for the camera to glide from the drone back onto the scroll track. */
const GLIDE_S = 1.6;
/** The finale plan turns slowly once overhead: eases toward `max` rad at `rate` 1/s, unwinds at `back`. */
const SPIN = { max: 0.7, rate: 0.1, back: 1.2 } as const;
/** Hover drift amplitude per metre of camera distance — a drone never sits perfectly still. */
const HOVER = 0.0035;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const tgt = new THREE.Vector3();
const heroPos = new THREE.Vector3();
const offset = new THREE.Vector3();
const exitPos = new THREE.Vector3();
const exitTgt = new THREE.Vector3();
const dir = new THREE.Vector3();
const flat = new THREE.Vector3(0, 0, -1);
const up = new THREE.Vector3();
const look = new THREE.Matrix4();
const sph = new THREE.Spherical();

/** 1 inside the building envelope, fading to 0 `fade` metres outside it. */
function insideness(p: THREE.Vector3): number {
  const dx = Math.max(Math.abs(p.x) - SHELL.x, 0);
  const dy = Math.max(p.y - SHELL.top, -p.y, 0);
  const dz = Math.max(Math.abs(p.z) - SHELL.z, 0);
  return 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dy, dz), 0, SHELL.fade);
}

/** Orient the camera at the target. Looking nearly straight down, "up" becomes the last horizontal heading, so the plan never flips. */
function aim(cam: THREE.PerspectiveCamera, target: THREE.Vector3) {
  dir.subVectors(target, cam.position);
  const along = Math.hypot(dir.x, dir.z);
  if (along > 1e-5) flat.set(dir.x / along, 0, dir.z / along);
  const steep = dir.y < 0 && along < -dir.y * 0.45; // within ~24° of straight down
  look.lookAt(cam.position, target, steep ? flat : up.copy(WORLD_UP));
  cam.quaternion.setFromRotationMatrix(look);
}

/** Lens, near plane and the copy-panel framing (right-shift on wide screens, up-shift on portrait); `fly` hands it all to the drone. */
function frame(cam: THREE.PerspectiveCamera, w: number, h: number, inside: number, fly: number) {
  const aspect = w / Math.max(1, h);
  const portrait = aspect >= 1 ? 0 : (1 - aspect) * PORTRAIT_LENS;
  const fov = lerp(LENS.base, DRONE_LENS, fly) + portrait + inside * lerp(LENS.inside, LENS.droneInside, fly);
  cam.fov = fov;
  cam.near = lerp(NEAR.out, NEAR.in, inside);
  const heroK = clamp(bim.hero);
  const wide = w >= 1024;
  const sx = (wide ? w * lerp(0.19, 0.16, heroK) : 0) * (1 - fly);
  const sy = (wide ? 0 : h * lerp(0.28, 0.17, heroK)) * (1 - fly);
  cam.setViewOffset(w, h, -sx, sy, w, h); // also updates the projection matrix
}

/** Readouts for the DOM: view cube, status bar, drone HUD. */
function publish(p: THREE.Vector3, t: THREE.Vector3) {
  bim.cam.x = p.x;
  bim.cam.y = p.y;
  bim.cam.z = p.z;
  bim.target.x = t.x;
  bim.target.y = t.y;
  bim.target.z = t.z;
  dir.subVectors(p, t);
  const len = dir.length() || 1;
  bim.view.azimuth = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
  bim.view.elevation = THREE.MathUtils.radToDeg(Math.asin(clamp(dir.y / len, -1, 1)));
}

/**
 * Drives the camera. The hero is an aerial establishing orbit while the 4D
 * sequence plays, then a slow sway; scrolling it away hands over to the drone
 * track (drone/track.ts), which flies the whole systems story. When drone mode
 * takes the camera (droneLink.controls), this only keeps the lens and readouts,
 * and when it lets go the camera glides back onto the track.
 */
export default function CameraRig() {
  const rig = useRef({ flying: false, glide: GLIDE_S, fly: 0, spin: 0, px: 0, py: 0 }).current;

  useFrame(({ camera, size }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.1);
    const controls = droneLink.controls;

    if (controls) {
      controls.getTarget(tgt, false);
      exitPos.copy(cam.position);
      exitTgt.copy(tgt);
      rig.flying = true;
      rig.fly = bim.reduced ? 1 : THREE.MathUtils.damp(rig.fly, 1, 6, dt);
      droneLink.weight = 1;
      frame(cam, size.width, size.height, insideness(cam.position), rig.fly);
      publish(cam.position, tgt);
      return;
    }
    if (rig.flying) {
      rig.flying = false;
      rig.glide = bim.reduced ? GLIDE_S : 0;
    }

    // 1. where the shot is: hero orbit -> drone track, or the still frame
    if (bim.reduced) {
      pos.copy(STILL.pos);
      tgt.copy(STILL.target);
    } else {
      const e = easeInOutCubic(bim.intro);
      const sway = Math.sin(bim.time * 0.11) * 0.09;
      sph.set(HERO.r * lerp(1.3, 1, e), lerp(0.98, HERO.phi, e), HERO.theta - 0.75 * (1 - e) + sway);
      heroPos.setFromSpherical(sph).add(HERO.target);
      sampleTrack(bim.story, pos, tgt);
      const w = easeInOutCubic(clamp(bim.hero));
      if (w < 1) {
        pos.lerpVectors(heroPos, pos, w);
        tgt.lerpVectors(HERO.target, tgt, w);
      }
    }

    // 2. frame it for the viewport: pull back on narrow screens (never inside the building), finale spin, parallax, hover
    const inside = insideness(pos);
    const aspect = size.width / Math.max(1, size.height);
    const reach = aspect >= 1.25 ? 1 : 1 + (1.25 - aspect) * 0.62;
    const portraitHero = aspect < 1 ? lerp(1.14, 1, clamp(bim.hero)) : 1;
    offset.subVectors(pos, tgt).multiplyScalar(lerp(reach * portraitHero, 1, inside));

    const plan = THREE.MathUtils.smoothstep(offset.y / (offset.length() || 1), 0.97, 0.995);
    if (bim.reduced) rig.spin = 0;
    else if (!getMotionPaused()) {
      const held = plan > 0.99;
      rig.spin = THREE.MathUtils.damp(rig.spin, held ? SPIN.max : 0, held ? SPIN.rate : SPIN.back, dt);
    }
    offset.applyAxisAngle(WORLD_UP, rig.spin * plan);

    const k = 1 - Math.exp(-3 * dt);
    rig.px += (bim.pointer.x - rig.px) * k;
    rig.py += (bim.pointer.y - rig.py) * k;
    const g = 1 - inside;
    sph.setFromVector3(offset);
    sph.theta -= rig.px * 0.04 * g;
    sph.phi = clamp(sph.phi - rig.py * 0.025 * g, 0.02, Math.PI - 0.02);
    offset.setFromSpherical(sph);
    pos.addVectors(tgt, offset);
    if (!bim.reduced) {
      const a = HOVER * sph.radius * (1 - 0.85 * inside) * clamp(bim.hero);
      pos.x += Math.sin(bim.time * 0.53 + 1.3) * a;
      pos.y += Math.sin(bim.time * 0.81) * a;
      pos.z += Math.sin(bim.time * 0.37 + 2.1) * a;
    }

    // 3. coming back from the drone: glide from where it left the camera onto the track
    let fly = 0;
    if (rig.glide < GLIDE_S) {
      rig.glide += dt;
      fly = 1 - easeInOutCubic(clamp(rig.glide / GLIDE_S));
      pos.lerp(exitPos, fly);
      tgt.lerp(exitTgt, fly);
    }
    rig.fly = fly;
    droneLink.weight = fly;

    cam.position.copy(pos);
    aim(cam, tgt);
    frame(cam, size.width, size.height, insideness(pos), fly);
    publish(pos, tgt);
  });
  return null;
}
