"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { easeOutCubic } from "@/lib/timing";
import { DUCT, RETURN, SUPPLY, supplyY, type V3 } from "../../geometry";
import { COLORS, MEP } from "../../materials";
import { bim } from "../../store";
import { win } from "../../timeline";
import {
  CANVAS,
  COLLARS,
  DROPS,
  FLOOR_INDEX,
  MAIN_W,
  TRANSITIONS,
  W_CANVAS,
  W_FD_RETURN,
  W_FD_SUPPLY,
  W_SHOE,
  W_TRANSITION,
  W_VANES,
  W_VAV,
  returnFd,
  shoeAt,
  supplyFd,
  vavAt,
} from "./layout";
import { inDuct } from "./parts";
import { Flashes, Placed, flashesFor, glowAdd, growDown, pop, rise, type Item, type Part } from "./placed";
import {
  FD_W,
  canvasShape,
  collarShape,
  diffuserShape,
  dropShape,
  fireDamperShape,
  shoeShape,
  transitionShape,
  vanesShape,
  vavShape,
} from "./shapes";

/**
 * The coordination layer of the air side: connector pieces (45° shoe takeoffs,
 * concentric transitions, turning vanes, canvas flexible connectors, fire
 * dampers, return tee collars), VAV terminal boxes, round spiral drops with flex
 * and round-neck diffusers. Every piece lands inside its STORY.hvac window with a
 * placement flash; pure function of bim.story (scrubbing back removes it).
 */

/* --------------------------------------------------------------- items -- */

const SHOES: Item[] = FLOOR_INDEX.flatMap((i) => SUPPLY.lateralsX.map((x, j): Item => ({ at: shoeAt(i, x), window: W_SHOE[i][j] })));
const TRANSITION_ITEMS: Item[] = FLOOR_INDEX.flatMap((i) =>
  TRANSITIONS.map((t, k): Item => ({ at: [t.x0, supplyY(i), SUPPLY.mainZ], window: W_TRANSITION[i][k], scale: [1, 1, t.from] })),
);
const FD_ITEMS: Item[] = FLOOR_INDEX.flatMap((i): Item[] => [
  { at: supplyFd(i), window: W_FD_SUPPLY[i], scale: [(MAIN_W[0] + 0.04) / (FD_W + 0.04), 1, 1] },
  { at: returnFd(i), window: W_FD_RETURN[i] },
]);
const COLLAR_ITEMS: Item[] = COLLARS.map((c): Item => ({ at: c.at, window: c.window }));
const CANVAS_Y = CANVAS.top - CANVAS.h / 2;
const CANVAS_ITEMS: Item[] = [
  { at: [SUPPLY.trunkX, CANVAS_Y, SUPPLY.trunkZ], window: W_CANVAS, scale: [DUCT.supplyTrunk[0] / DUCT.returnTrunk[0], 1, 1] },
  { at: [RETURN.trunkX, CANVAS_Y, RETURN.trunkZ], window: W_CANVAS },
];
const VAV_ITEMS: Item[] = FLOOR_INDEX.flatMap((i) => SUPPLY.lateralsX.map((x, j): Item => ({ at: vavAt(i, x), window: W_VAV[i][j] })));
const DROP_ITEMS: Item[] = DROPS.map((d): Item => ({ at: d.top, window: d.drop }));
const DIFFUSER_ITEMS: Item[] = DROPS.map((d): Item => ({ at: d.face, window: d.diffuser }));
const VANE_AT: V3[] = FLOOR_INDEX.map((i) => [SUPPLY.trunkX, supplyY(i), SUPPLY.mainZ]);

const VAV_RISE = rise(0.45);

function makeShapes() {
  return {
    shoe: shoeShape(),
    transition: transitionShape(),
    fd: fireDamperShape(),
    collar: collarShape(),
    canvas: canvasShape(),
    vanes: vanesShape(),
    vav: vavShape(),
    drop: dropShape(),
    diffuser: diffuserShape(),
  };
}

/* --------------------------------------------------------------- vanes -- */

/** Turning vanes glow through the elbow's walls while the X-ray is on (the air lives inside the duct, like the flows). */
const vaneMat = glowAdd(COLORS.ice, 1.6);
vaneMat.side = THREE.DoubleSide;
vaneMat.depthTest = false;
const VANE_GAIN = 0.55;
const VM = new THREE.Matrix4();
const VC = new THREE.Color();

function Vanes({ geometry }: { geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => new Float32Array(VANE_AT.length * 3), []);
  const last = useRef({ story: NaN, xray: NaN });
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || (bim.story === last.current.story && bim.xray === last.current.xray)) return;
    last.current.story = bim.story;
    last.current.xray = bim.xray;
    const see = inDuct();
    let lit = false;
    for (let i = 0; i < VANE_AT.length; i++) {
      const t = easeOutCubic(win(bim.story, W_VANES[i]));
      if (t * see > 0.001) lit = true;
      const p = VANE_AT[i];
      VM.makeScale(1, t > 0 ? t : 0, 1).setPosition(p[0], p[1], p[2]);
      mesh.setMatrixAt(i, VM);
      mesh.setColorAt(i, VC.setScalar(t * see * VANE_GAIN));
    }
    mesh.visible = lit;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, vaneMat, VANE_AT.length]} frustumCulled={false} visible={false} renderOrder={2}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/* ----------------------------------------------------------- component -- */

export function Coordination() {
  const g = useMemo(() => makeShapes(), []);
  useEffect(
    () => () => {
      for (const shape of Object.values(g)) for (const geo of Object.values(shape)) (geo as THREE.BufferGeometry).dispose();
    },
    [g],
  );

  const sets = useMemo(() => {
    const p = (geometry: THREE.BufferGeometry, material: THREE.Material): Part => ({ geometry, material });
    return {
      shoe: [p(g.shoe.supply, MEP.supply)],
      transition: [p(g.transition.supply, MEP.supply)],
      fd: [p(g.fd.equipment, MEP.equipment), p(g.fd.shade, MEP.equipmentShade)],
      collar: [p(g.collar.ret, MEP.ret)],
      canvas: [p(g.canvas.shade, MEP.equipmentShade)],
      vav: [p(g.vav.equipment, MEP.equipment), p(g.vav.shade, MEP.equipmentShade), p(g.vav.signal, MEP.signal), p(g.vav.supply, MEP.supply)],
      drop: [p(g.drop.equipment, MEP.equipment), p(g.drop.supply, MEP.supply), p(g.drop.shade, MEP.equipmentShade)],
      diffuser: [p(g.diffuser.equipment, MEP.equipment), p(g.diffuser.shade, MEP.equipmentShade)],
    };
  }, [g]);

  const flashes = useMemo(
    () => [
      ...flashesFor(sets.shoe, SHOES),
      ...flashesFor(sets.transition, TRANSITION_ITEMS),
      ...flashesFor(sets.fd, FD_ITEMS),
      ...flashesFor(sets.collar, COLLAR_ITEMS),
      ...flashesFor(sets.canvas, CANVAS_ITEMS),
      ...flashesFor(sets.vav, VAV_ITEMS),
      ...flashesFor(sets.drop, DROP_ITEMS),
    ],
    [sets],
  );

  return (
    <group>
      <Placed parts={sets.shoe} edges={g.shoe.edges} items={SHOES} motion={pop} />
      <Placed parts={sets.transition} edges={g.transition.edges} items={TRANSITION_ITEMS} motion={pop} />
      <Placed parts={sets.fd} edges={g.fd.edges} items={FD_ITEMS} motion={pop} />
      <Placed parts={sets.collar} edges={g.collar.edges} items={COLLAR_ITEMS} motion={pop} />
      <Placed parts={sets.canvas} items={CANVAS_ITEMS} motion={pop} />
      <Placed parts={sets.vav} edges={g.vav.edges} items={VAV_ITEMS} motion={VAV_RISE} />
      <Placed parts={sets.drop} items={DROP_ITEMS} motion={growDown} />
      <Placed parts={sets.diffuser} items={DIFFUSER_ITEMS} motion={pop} />
      <Vanes geometry={g.vanes.glow} />
      <Flashes flashes={flashes} />
    </group>
  );
}
