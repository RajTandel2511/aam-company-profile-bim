import { Counter } from "@/components/ui/Counter";
import { ViewFrame } from "@/components/bimui/ViewFrame";
import { ReachExplorer } from "@/components/reach/ReachExplorer";
import { AS_OF, CITIES, HQ_CITY, NORTHMOST, SOUTHMOST, TOTAL } from "@/components/reach/data";
import { company } from "@/lib/content";

const FIGURE = "display text-[clamp(2.6rem,5vw,4rem)]";

/**
 * 03 · Site plan G-101 — the Bay Area as a GIS site plan in 3D: counties rise, a pillar
 * grows at every city with work in progress, and an arc runs from HQ to each one; the
 * frame carries coordinate ticks, a north arrow and a graphic scale bar.
 */
export default function Reach() {
  const asOf = AS_OF.charAt(0).toLowerCase() + AS_OF.slice(1);
  return (
    <ViewFrame
      id="reach"
      titleId="reach-title"
      number="03"
      sheet="G-101"
      name="Site plan · Bay Area"
      kind="Site plan"
      scale="1:250,000"
      intro={`Headquartered in ${HQ_CITY} since ${company.founded}. Every arc on the map leaves our door and ends at work in progress — from ${NORTHMOST} in the north to ${SOUTHMOST} in the south.`}
    >
      {/* A title-block strip that reads as one line: "49 in progress · 23 cities · as of Aug 2026". */}
      <p className="grid grid-cols-2 border-y border-hair sm:grid-cols-[auto_auto_1fr]">
        <span className="flex flex-col gap-2 border-r border-hair py-5 pr-6 sm:pr-10">
          <Counter to={TOTAL} className={`${FIGURE} text-cyan`} />
          <span className="hud text-fog">in progress</span>
        </span>
        <span className="sr-only"> · </span>
        <span className="flex flex-col gap-2 py-5 pl-6 sm:border-r sm:border-hair sm:pl-10 sm:pr-10">
          <Counter to={CITIES.length} className={`${FIGURE} text-chalk`} />
          <span className="hud text-fog">cities</span>
        </span>
        <span className="sr-only"> · </span>
        <span className="hud col-span-2 border-t border-hair py-3 text-fog sm:col-span-1 sm:self-end sm:border-t-0 sm:py-5 sm:pl-10">
          {asOf}
        </span>
      </p>
      <ReachExplorer />
    </ViewFrame>
  );
}
