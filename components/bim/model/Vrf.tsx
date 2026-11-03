"use client";

import { GLOW } from "../materials";
import { Pulses, polyLength } from "../kit";
import { running } from "./air/parts";
import { Louvres, Streams, Throw } from "./vrf/flow";
import { Pieces } from "./vrf/pieces";
import { planVrf } from "./vrf/plan";
import { H } from "./vrf/schedule";
import { Units } from "./vrf/units";

/**
 * Chapter 03 — VRF & SPLIT SYSTEMS. A steel rail frame grows on the roof's
 * south-east yard and three heat-recovery condensing modules are craned onto
 * it, then the split condenser over the core. Insulated refrigerant lines leave
 * the modules (copper liquid, insulated discharge and suction), run west along a
 * header and north on sleepers into a roof portal, and the riser drops floor by
 * floor with refnet tees, clamps and floor plates. On every floor a feed reaches
 * the branch selector box hung on rods, and liquid / gas pairs run on trapeze
 * hangers to five 4-way ceiling cassettes, which lift into the ceiling. The
 * ductless wall split grows out of the core wall at L3 and its line set climbs
 * to the roof condenser. From the run mark refrigerant streaks travel the lines,
 * fans spin, louvres swing and cool air throws from every cassette.
 *
 * Every state is a pure function of bim.story (scrubbing back un-builds it);
 * ambient motion runs on bim.time. Element cards: ./vrf/anchors.ts.
 */

const PLAN = planVrf();
const MAIN_GAP = 1.6;
const flowGate = () => running(H.run);
const mainFlow = (path: typeof PLAN.liquid) => ({
  path,
  count: Math.max(4, Math.round(polyLength(path) / MAIN_GAP)),
  speed: 2.4,
  size: 0.05,
  material: GLOW.refrigerant,
  gate: flowGate,
});
const LIQUID = mainFlow(PLAN.liquid);
const GAS = mainFlow(PLAN.gas);

export default function Vrf() {
  return (
    <group>
      <Pieces plan={PLAN} />
      <Units />
      <Louvres cassettes={PLAN.cassettes} />
      <Pulses {...LIQUID} />
      <Pulses {...GAS} />
      <Streams paths={PLAN.streams} material={GLOW.refrigerant} />
      <Throw cassettes={PLAN.cassettes} />
    </group>
  );
}
