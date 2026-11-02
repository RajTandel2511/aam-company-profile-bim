import { activeByCity, equipmentBrands, pastProjects, stats } from "@/lib/content";
import { ViewFrame } from "@/components/bimui/ViewFrame";
import { Reveal } from "@/components/ui/Reveal";
import { viewFrame } from "@/components/shell/site";
import ProjectSchedule from "@/components/work/ProjectSchedule";
import ReferenceSheet from "@/components/work/ReferenceSheet";

/** All active jobs; the schedule lists a curated, clearly named subset of them. */
const activeTotal = Object.values(activeByCity).reduce((a, b) => a + b, 0);
/** "As of …" for the job data, read from the stat that counts the same jobs (dropped if they diverge). */
const asOf = stats.find((s) => s.value === activeTotal)?.note;
const and = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** The sheet's general notes. Brand NAMES only, as plain text — never logos. */
const NOTES = [
  { label: "Completed work", text: `Includes ${and.format(pastProjects)}.` },
  { label: "Manufacturers", text: `We install equipment from ${and.format(equipmentBrands)}.` },
];

/**
 * 04 · Saved view "Project schedule" (G-201): the current projects as a sortable,
 * filterable BIM schedule, the field photos as reference images, then the sheet's
 * general notes. Opaque (ViewFrame), so it scrolls over the fixed 3D stage.
 */
export default function Work() {
  return (
    <ViewFrame
      {...viewFrame("work")}
      intro={`A selection of the ${activeTotal} jobs our crews have in progress right now — hotels, stores, schools, housing, restaurants and civic work. Filter by sector or sort any column.`}
    >
      <ProjectSchedule asOf={asOf} />
      <ReferenceSheet />

      <Reveal className="mt-20 md:mt-24">
        <h3 className="hud text-chalk">General notes</h3>
        <ol className="mt-4 grid gap-px border border-hair bg-hair md:grid-cols-2">
          {NOTES.map((n, i) => (
            <li key={n.label} className="flex gap-4 bg-void p-5 md:p-6">
              <span
                aria-hidden
                className="mono grid h-7 w-7 shrink-0 place-items-center border border-cyan/70 text-[12px] font-semibold text-cyan"
              >
                {i + 1}
              </span>
              <p>
                <span className="hud block text-fog">{n.label}</span>
                <span className="mt-2 block text-lg font-semibold leading-snug text-chalk">{n.text}</span>
              </p>
            </li>
          ))}
        </ol>
      </Reveal>
    </ViewFrame>
  );
}
