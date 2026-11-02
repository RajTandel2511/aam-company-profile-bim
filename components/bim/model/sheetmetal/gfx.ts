import * as THREE from "three";
import { ARCH } from "../../materials";
import { COPING_PROFILE, CRICKET, EDGES, FLASH_PROFILE, PANEL } from "./plan";

/**
 * Chapter 01 graphics: unit geometries for the instanced sheet-metal parts, and the
 * glint — a band of light swept over ARCH.sheetMetal / sheetMetalShade by patching
 * their shaders (this chapter is the only user of those materials). Client-only.
 */

type Section = readonly (readonly [number, number])[];

const shape = (s: Section) => new THREE.Shape(s.map(([u, v]) => new THREE.Vector2(u, v)));

/** A closed section extruded 1 m: section (u, v) -> local (Z, Y); length on local X, centred. */
function extrudeX(s: Section): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape(s), { depth: 1, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(0.5, 0, 0);
  return geo;
}

/** Ribbed wall panel, 1 m tall (scaled per tier): across = local X (centred), up = local Y, outward = local Z. */
function ribbedPanel(): THREE.BufferGeometry {
  const { w, pan: t, rib: r } = PANEL;
  const m = w / 2;
  const geo = new THREE.ExtrudeGeometry(
    shape([
      [0, 0], [w, 0], [w, t],
      [m + 0.04, t], [m + 0.025, t + r / 2], [m - 0.025, t + r / 2], [m - 0.04, t], // minor rib
      [0.085, t], [0.065, t + r], [0.02, t + r], [0, t], // major (lap) rib
    ]),
    { depth: 1, bevelEnabled: false },
  );
  geo.rotateX(Math.PI / 2); // extrusion -> -Y, outward -> +Z
  geo.translate(-m, 1, 0);
  return geo;
}

/** Two sloped faces of the cricket, base at y 0 (the mesh sits at CRICKET.y and scales up in y). */
function cricket(): THREE.BufferGeometry {
  const { x0, x1, z, h, run } = CRICKET;
  const xm = (x0 + x1) / 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([x0, 0, z, xm, h, z, xm, 0, z - run, xm, h, z, x1, 0, z, xm, 0, z - run], 3),
  );
  geo.computeVertexNormals();
  return geo;
}

export function buildGeometries() {
  const edges = new THREE.BufferGeometry();
  edges.setAttribute("position", new THREE.BufferAttribute(EDGES.pos, 3));
  edges.setDrawRange(0, 0);
  const set = {
    panel: ribbedPanel(),
    coping: extrudeX(COPING_PROFILE),
    flashing: extrudeX(FLASH_PROFILE),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    cricket: cricket(),
    edges,
  };
  return { ...set, dispose: () => Object.values(set).forEach((g) => g.dispose()) };
}

/* ------------------------------------------------------------------ glint -- */

const glint = { uSmGlintPos: { value: -1e4 }, uSmGlintAmt: { value: 0 } };

/** The band runs mostly west -> east, tilted so it also slides diagonally across the end-wall cladding. */
const VERT_DECL = "#include <common>\nvarying float vSmGlint;";
const VERT_MAIN = `#include <worldpos_vertex>
{
  vec4 smWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    smWorld = batchingMatrix * smWorld;
  #endif
  #ifdef USE_INSTANCING
    smWorld = instanceMatrix * smWorld;
  #endif
  smWorld = modelMatrix * smWorld;
  vSmGlint = dot( smWorld.xyz, vec3( 1.0, 0.35, -0.45 ) );
}`;
const FRAG_DECL = "#include <common>\nuniform float uSmGlintPos;\nuniform float uSmGlintAmt;\nvarying float vSmGlint;";
const FRAG_MAIN = `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3( 0.8, 0.94, 1.0 ) * uSmGlintAmt * ( 1.0 - smoothstep( 0.0, 1.6, abs( vSmGlint - uSmGlintPos ) ) );`;

function patchGlint(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, glint);
  shader.vertexShader = shader.vertexShader.replace("#include <common>", VERT_DECL).replace("#include <worldpos_vertex>", VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", FRAG_DECL)
    .replace("#include <emissivemap_fragment>", FRAG_MAIN);
}

/**
 * Idempotent. Only adds an emissive term — clipping, transparency and the X-ray opacity
 * keep working. Both materials share patchGlint, so they share one program cache key.
 */
export function installGlint() {
  for (const m of [ARCH.sheetMetal, ARCH.sheetMetalShade]) {
    if (m.onBeforeCompile === patchGlint) continue;
    m.onBeforeCompile = patchGlint;
    m.needsUpdate = true;
  }
}

/** pos: band centre along the sweep axis (m); amt: emissive strength (0 = off). */
export function setGlint(pos: number, amt: number) {
  glint.uSmGlintPos.value = pos;
  glint.uSmGlintAmt.value = amt;
}
