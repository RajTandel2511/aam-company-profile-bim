"use client";

import { useSyncExternalStore } from "react";

/**
 * The BIM viewer's UI state, shared by the DOM chrome (ribbon, status bar,
 * drone HUD) and the WebGL scene. React reads it with useViewer(); render
 * loops read getViewer() inside useFrame (no re-render). Visual style is
 * remembered per browser (best effort).
 */

export type VisualStyle = "holo" | "shaded" | "wire";
export const VISUAL_STYLES: readonly { id: VisualStyle; label: string }[] = [
  { id: "holo", label: "Holo" },
  { id: "shaded", label: "Shaded" },
  { id: "wire", label: "Wire" },
];

export type DronePreset = "aerial" | "roof" | "plenum" | "plan" | "section";
export const DRONE_PRESETS: readonly { id: DronePreset; label: string }[] = [
  { id: "aerial", label: "Aerial" },
  { id: "roof", label: "Roof" },
  { id: "plenum", label: "Plenum" },
  { id: "plan", label: "Plan" },
  { id: "section", label: "Section" },
];

export type ViewerState = {
  style: VisualStyle;
  /** fullscreen free-flight mode: the visitor flies the model, page scroll is locked */
  drone: boolean;
  /** last preset shot requested in drone mode; presetNonce bumps on every request (same preset twice still flies) */
  preset: DronePreset | null;
  presetNonce: number;
};

const KEY = "aam-visual-style";
const SERVER: ViewerState = { style: "holo", drone: false, preset: null, presetNonce: 0 };
let state: ViewerState = SERVER;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const s = window.localStorage.getItem(KEY);
    if (s === "holo" || s === "shaded" || s === "wire") state = { ...state, style: s };
  } catch {
    // storage blocked: defaults stand
  }
}

export function getViewer(): ViewerState {
  load();
  return state;
}

export function setViewer(patch: Partial<ViewerState>) {
  load();
  state = { ...state, ...patch };
  if (patch.style) {
    try {
      window.localStorage.setItem(KEY, patch.style);
    } catch {
      // ignore
    }
  }
  listeners.forEach((l) => l());
}

/** Ask the drone camera to fly to a preset shot (also enters drone mode). */
export function flyTo(preset: DronePreset) {
  setViewer({ drone: true, preset, presetNonce: getViewer().presetNonce + 1 });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding; the server snapshot is the default state so markup always hydrates the same. */
export function useViewer(): ViewerState {
  return useSyncExternalStore(subscribe, getViewer, () => SERVER);
}
