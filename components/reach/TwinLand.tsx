"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { COUNTIES, project } from "@/lib/bayarea";
import { easeOutCubic, seg } from "@/lib/timing";
import {
  CHOREO,
  HQ,
  LATS,
  LAT_SPAN,
  LONS,
  LON_SPAN,
  MAX_REACH,
  ORIGIN,
  SLAB,
  TWIN_COLORS,
  WORLD_SCALE,
  toWorld,
  type TwinClock,
} from "./data";

/**
 * The ground of the site plan: a quarter-degree graticule (the empty viewport grid),
 * then the counties as thin deep-navy halftone slabs with cyan county lines, rising out
 * of it in a wave from HQ. Water stays the void.
 */

const DOT_CELL = 0.09; // halftone pitch, world units
const DOT_MIX = 0.14;
const EDGE_OPACITY = 0.55;
const EDGE_LIFT = 0.002;
const GRID_OPACITY = 0.55;
const GRID_Y = -0.004;
/** The scan ring that sweeps out from HQ while the counties rise. */
const SCAN_REACH = MAX_REACH * 1.15;
const SCAN_WIDTH = 0.35;

const LAND_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LAND_FRAGMENT = /* glsl */ `
  uniform vec3 uLand;
  uniform vec3 uDot;
  uniform vec3 uScanColor;
  uniform vec2 uHq;
  uniform float uScan;
  uniform float uScanAmt;
  uniform float uOpacity;
  varying vec2 vWorld;
  #include <fog_pars_fragment>
  void main() {
    // Halftone land, as on a drawing: one antialiased dot per cell, faded out
    // where cells shrink to a few pixels so the distance never shimmers.
    vec2 cell = vWorld / ${DOT_CELL.toFixed(3)};
    float px = length(fwidth(cell));
    float d = length(fract(cell) - 0.5);
    float aa = max(px, 1e-4) * 0.5;
    float halftone = (1.0 - smoothstep(0.14 - aa, 0.14 + aa, d)) * (1.0 - smoothstep(0.32, 0.6, px));
    vec3 color = mix(uLand, uDot, halftone * ${DOT_MIX.toFixed(2)});
    float ring = 1.0 - smoothstep(0.0, ${SCAN_WIDTH.toFixed(2)}, abs(length(vWorld - uHq) - uScan));
    color += uScanColor * ring * uScanAmt;
    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

type SharedUniforms = Record<string, THREE.IUniform>;

type County = {
  id: string;
  geometry: THREE.ExtrudeGeometry;
  outline: THREE.BufferGeometry;
  top: THREE.ShaderMaterial;
  side: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  /** [top, side] — ExtrudeGeometry's groups: 0 = caps, 1 = walls */
  materials: THREE.Material[];
  /** seconds: when this county starts rising */
  start: number;
};

function buildCounty(id: string, d: string, loader: SVGLoader, shared: SharedUniforms): County {
  const shapes = loader
    .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`)
    .paths.flatMap((p) => SVGLoader.createShapes(p));

  // Extrude in map units, then lay it on the ground: map y -> world z, extrusion -> up.
  const depth = SLAB / WORLD_SCALE;
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(Math.PI / 2).translate(-ORIGIN[0], depth, -ORIGIN[1]).scale(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE);

  // Hairline outline along the top edge; its centroid sets the county's place in the wave.
  const segs: number[] = [];
  let cx = 0;
  let cz = 0;
  let n = 0;
  for (const shape of shapes) {
    for (const ring of [shape.getPoints(), ...shape.holes.map((h) => h.getPoints())]) {
      ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length];
        const [ax, az] = toWorld(p.x, p.y);
        const [bx, bz] = toWorld(q.x, q.y);
        segs.push(ax, SLAB + EDGE_LIFT, az, bx, SLAB + EDGE_LIFT, bz);
        cx += ax;
        cz += az;
        n += 1;
      });
    }
  }
  const outline = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
  const reach = Math.min(1, Math.hypot(cx / Math.max(n, 1) - HQ[0], cz / Math.max(n, 1) - HQ[1]) / MAX_REACH);

  const top = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared, uOpacity: { value: 0 } },
    vertexShader: LAND_VERTEX,
    fragmentShader: LAND_FRAGMENT,
    transparent: true,
    fog: true,
    // ponytail: DoubleSide so the slab reads whichever way the SVG path winds.
    side: THREE.DoubleSide,
  });
  const side = new THREE.MeshBasicMaterial({ color: TWIN_COLORS.landSide, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const edge = new THREE.LineBasicMaterial({ color: TWIN_COLORS.edge, transparent: true, opacity: 0, depthWrite: false });
  return { id, geometry, outline, top, side, edge, materials: [top, side], start: reach * CHOREO.countyWave };
}

function buildGraticule(): THREE.BufferGeometry {
  const pts: number[] = [];
  const at = (lat: number, lon: number) => {
    const [x, z] = toWorld(...project(lat, lon));
    pts.push(x, GRID_Y, z);
  };
  for (const lat of LATS) {
    at(lat, LON_SPAN[0]);
    at(lat, LON_SPAN[1]);
  }
  for (const lon of LONS) {
    at(LAT_SPAN[0], lon);
    at(LAT_SPAN[1], lon);
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}

export function Land({ clock, reduce }: { clock: TwinClock; reduce: boolean }) {
  const shared = useMemo<SharedUniforms>(
    () => ({
      uLand: { value: new THREE.Color(TWIN_COLORS.land) },
      uDot: { value: new THREE.Color(TWIN_COLORS.dot) },
      uScanColor: { value: new THREE.Color(TWIN_COLORS.scan) },
      uHq: { value: new THREE.Vector2(HQ[0], HQ[1]) },
      uScan: { value: 0 },
      uScanAmt: { value: 0 },
    }),
    [],
  );
  // SVGLoader parses with DOMParser — fine here: this module only ever loads in the browser.
  const counties = useMemo(() => {
    const loader = new SVGLoader();
    return COUNTIES.map((c) => buildCounty(c.id, c.d, loader, shared));
  }, [shared]);
  const grid = useMemo(buildGraticule, []);
  const groups = useRef<(THREE.Group | null)[]>([]);

  useEffect(
    () => () => {
      for (const c of counties) [c.geometry, c.outline, c.top, c.side, c.edge].forEach((r) => r.dispose());
      grid.dispose();
    },
    [counties, grid],
  );

  useFrame(() => {
    const t = clock.t;
    const scan = seg(t, 0, CHOREO.countyWave + CHOREO.countyRise);
    shared.uScan.value = scan * SCAN_REACH;
    shared.uScanAmt.value = reduce ? 0 : Math.sin(Math.PI * scan);
    counties.forEach((c, i) => {
      const p = easeOutCubic(seg(t, c.start, c.start + CHOREO.countyRise));
      const g = groups.current[i];
      if (g) {
        g.visible = p > 0.001;
        g.scale.y = Math.max(p, 0.001);
      }
      c.top.uniforms.uOpacity.value = p;
      c.side.opacity = p;
      c.edge.opacity = p * EDGE_OPACITY;
    });
  });

  return (
    <group>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={TWIN_COLORS.grid} transparent opacity={GRID_OPACITY} depthWrite={false} />
      </lineSegments>
      {counties.map((c, i) => (
        <group
          key={c.id}
          ref={(el) => {
            groups.current[i] = el;
          }}
        >
          <mesh geometry={c.geometry} material={c.materials} />
          <lineSegments geometry={c.outline} material={c.edge} renderOrder={1} />
        </group>
      ))}
    </group>
  );
}
