"use client";

import { useMemo, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { project } from "@/lib/bayarea";
import { LATS, LAT_SPAN, LONS, LON_SPAN, MI_PER_WORLD, SCALE_W, toWorld, type MapFurniture } from "./data";
import { HIDDEN, crossing, pxPerUnit, screenAngle, type Segment } from "./geo";

/**
 * Places the site plan's DOM furniture (ReachExplorer's MapHud) from the live camera on
 * every frame the map renders, so it stays true while the view drifts and pushes in:
 *  - a coordinate label wherever a graticule line meets the neatline — parallels on the
 *    left edge, meridians on the bottom edge;
 *  - the north arrow, turned to where world north points on screen;
 *  - the graphic scale bar: a round number of miles, measured at the map's centre depth.
 * The DOM is written only when a rounded value changes, and layout is never read.
 * Mount it after the camera rig, so it reads this frame's camera.
 */

/** Neatline inset from the canvas edge (px) — MapHud draws it at inset-3. */
const NEATLINE = 12;
/** Ticks keep this clear of the corners (px): the title (top-left) and the scale bar (bottom-left, 48–72 px up) sit there. */
const CLEAR_SIDE = 84;
const CLEAR_FOOT = 44;
/** Lengths the scale bar may show (miles). */
const NICE_MILES = [1, 2, 5, 10, 20, 50, 100];

const ground = (lat: number, lon: number) => {
  const [x, z] = toWorld(...project(lat, lon));
  return new THREE.Vector3(x, 0, z);
};
const PARALLELS: Segment[] = LATS.map((lat) => ({ a: ground(lat, LON_SPAN[0]), b: ground(lat, LON_SPAN[1]) }));
const MERIDIANS: Segment[] = LONS.map((lon) => ({ a: ground(LAT_SPAN[0], lon), b: ground(LAT_SPAN[1], lon) }));
const NORTH = new THREE.Vector3(0, 0, -1);

/** Slides a tick label along its edge, or hides it; touches the DOM only when the whole-pixel position changes. */
function place(node: HTMLElement | null, cache: number[], i: number, at: number, axis: "x" | "y") {
  if (!node) return;
  const v = at === HIDDEN ? HIDDEN : Math.round(at);
  if (v === cache[i]) return;
  if (v === HIDDEN) node.style.visibility = "hidden";
  else {
    if (!(cache[i] >= 0)) node.style.visibility = "visible";
    node.style.transform = axis === "y" ? `translate(0, ${v}px) translateY(-50%)` : `translate(${v}px, 0) translateX(-50%)`;
  }
  cache[i] = v;
}

type Written = { north: number; miles: number; k: number; lat: number[]; lon: number[] };

export function Furniture({ furniture, target }: { furniture: MutableRefObject<MapFurniture>; target: THREE.Vector3 }) {
  // what the DOM shows now (NaN: never written)
  const last = useMemo<Written>(() => ({ north: NaN, miles: NaN, k: NaN, lat: LATS.map(() => NaN), lon: LONS.map(() => NaN) }), []);

  useFrame(({ camera, size }) => {
    const f = furniture.current;
    const { width: w, height: h } = size;
    camera.updateMatrixWorld();

    for (let i = 0; i < PARALLELS.length; i++) {
      const y = crossing(PARALLELS[i], "x", NEATLINE, camera, w, h);
      place(f.lat[i], last.lat, i, y > CLEAR_SIDE && y < h - CLEAR_SIDE ? y : HIDDEN, "y");
    }
    for (let i = 0; i < MERIDIANS.length; i++) {
      const x = crossing(MERIDIANS[i], "y", h - NEATLINE, camera, w, h);
      place(f.lon[i], last.lon, i, x > CLEAR_FOOT && x < w - CLEAR_FOOT ? x : HIDDEN, "x");
    }

    const north = Math.round(screenAngle(target, NORTH, camera, w, h) * 10) / 10;
    if (north !== last.north && f.north) {
      f.north.style.transform = `rotate(${north}deg)`;
      last.north = north;
    }

    const pxPerMile = pxPerUnit(camera as THREE.PerspectiveCamera, target, h) / MI_PER_WORLD;
    let miles = NICE_MILES[0];
    for (let i = 1; i < NICE_MILES.length; i++) if (NICE_MILES[i] * pxPerMile <= SCALE_W) miles = NICE_MILES[i];
    const k = Math.round(((miles * pxPerMile) / SCALE_W) * 200) / 200;
    if (k === last.k && miles === last.miles) return;
    if (f.scaleBar) f.scaleBar.style.transform = `scaleX(${k})`;
    if (f.scaleText) {
      f.scaleText.style.transform = `translateX(${Math.round(k * SCALE_W)}px) translateX(-50%)`;
      if (miles !== last.miles) f.scaleText.textContent = `${miles} mi`;
    }
    if (f.scale && Number.isNaN(last.k)) f.scale.style.visibility = "visible";
    last.k = k;
    last.miles = miles;
  });
  return null;
}
