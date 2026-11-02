"use client";

import { useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { currentProjects, sectors, type Sector } from "@/lib/content";
import { motionTokens, springs } from "@/lib/motion-tokens";
import { pad } from "./parts";

type Filter = Sector | "All";
type SortKey = "mark" | "name" | "city" | "sector";
type SortDir = "ascending" | "descending";
type Sort = { key: SortKey; dir: SortDir };

const FILTERS: Filter[] = ["All", ...sectors];

/** View-filter colours from the model's palette, one per sector (cycled). Swatches only, never text. */
const TONES = ["supply", "exhaust", "return", "amber", "violet", "cyan"] as const;
const toneFor = (s: Sector) => `rgb(var(--${TONES[sectors.indexOf(s) % TONES.length]}-rgb))`;

/** Rows in content order. Mark is the schedule's own row number (P-01 …), never a job number. */
const ROWS = currentProjects.map((p, i) => ({ ...p, order: i, mark: `P-${pad(i + 1)}`, id: `${p.name}|${p.city}` }));
type Row = (typeof ROWS)[number];

const COUNT = Object.fromEntries(
  FILTERS.map((f) => [f, f === "All" ? ROWS.length : ROWS.filter((r) => r.sector === f).length]),
) as Record<Filter, number>;

/** Columns A–E. Every row is in progress, so Status has nothing to sort. */
const COLUMNS: { key: SortKey | null; label: string; letter: string; width?: string }[] = [
  { key: "mark", label: "Mark", letter: "A", width: "lg:w-[6rem]" },
  { key: "name", label: "Project", letter: "B" },
  { key: "city", label: "City", letter: "C" },
  { key: "sector", label: "Sector", letter: "D" },
  { key: null, label: "Status", letter: "E", width: "lg:w-[10rem]" },
];

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** A sorted copy. Ties keep schedule order whichever way the column runs. */
function sortRows(rows: readonly Row[], { key, dir }: Sort): Row[] {
  const sign = dir === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const by = key === "mark" ? a.order - b.order : collator.compare(a[key], b[key]);
    return sign * by || a.order - b.order;
  });
}

/* Table styling applies from lg; below lg every row is a stacked card and these do nothing. */
const HEAD =
  "text-left font-normal lg:sticky lg:top-[var(--nav-h)] lg:z-[1] lg:border-b lg:border-r lg:border-hair lg:bg-raised lg:p-0 lg:first:border-l";
const CELL =
  "text-left lg:border-b lg:border-r lg:border-hair lg:px-4 lg:py-3 lg:align-middle lg:transition-colors lg:group-hover:bg-cyan/[0.06]";
/** The cyan selection outline, drawn inside the hovered row: top + bottom on every cell, the ends on the first and last. */
const SELECT = "lg:group-hover:shadow-[inset_0_1px_0_rgb(var(--cyan-rgb)),inset_0_-1px_0_rgb(var(--cyan-rgb))]";
const SELECT_FIRST =
  "lg:border-l lg:group-hover:shadow-[inset_1px_1px_0_rgb(var(--cyan-rgb)),inset_0_-1px_0_rgb(var(--cyan-rgb))]";
const SELECT_LAST = "lg:group-hover:shadow-[inset_-1px_1px_0_rgb(var(--cyan-rgb)),inset_0_-1px_0_rgb(var(--cyan-rgb))]";

/** Rows past the 9th share the last delay, so any redraw lands within ~0.6 s. */
const STAGGER_CAP = 8;
const HIDDEN = { opacity: 0 };
const SHOWN = { opacity: 1 };
const FADE = { duration: motionTokens.duration.fast };

type Props = { asOf?: string };

/**
 * 04 · The project schedule: every current project (all IN PROGRESS) as a Revit-style
 * schedule — sortable column headers (aria-sort), a sector view filter with a sliding
 * selection pill, a cyan selection outline on hover and a header row that sticks under
 * the ribbon. Each sort or filter regenerates the view: a scan line sweeps the table and
 * the rows redraw top-down (opacity only). Below lg the rows are stacked cards.
 */
export default function ProjectSchedule({ asOf }: Props) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState<Sort>({ key: "mark", dir: "ascending" });
  const [regen, setRegen] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const inView = useInView(tableRef, { once: true, margin: "-80px" });

  const rows = sortRows(filter === "All" ? ROWS : ROWS.filter((r) => r.sector === filter), sort);
  const sortLabel = COLUMNS.find((c) => c.key === sort.key)?.label ?? "";
  const arrow = sort.dir === "ascending" ? "↑" : "↓";

  const handleFilter = (f: Filter) => {
    if (f === filter) return;
    setFilter(f);
    setRegen((n) => n + 1);
  };
  const handleSort = (key: SortKey) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "ascending" ? "descending" : "ascending" }));
    setRegen((n) => n + 1);
  };
  const rowTiming = (i: number) =>
    reduce
      ? FADE
      : {
          duration: motionTokens.duration.normal,
          ease: motionTokens.easing.smooth,
          delay: Math.min(i, STAGGER_CAP) * motionTokens.stagger,
        };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p aria-hidden className="hud text-fog">
            Filter <span className="text-hair">·</span> Sector <span className="text-cyan">=</span>
          </p>
          <div role="group" aria-label="Filter the schedule by sector" className="mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Chip key={f} filter={f} isOn={f === filter} onSelect={handleFilter} />
            ))}
          </div>
        </div>
        <p aria-hidden className="hud shrink-0 text-fog lg:pb-2.5">
          Sort <span className="text-hair">·</span>{" "}
          <span className="text-cyan">
            {sortLabel} {arrow}
          </span>
        </p>
      </div>

      <div className="relative mt-6">
        <table
          ref={tableRef}
          id="work-schedule"
          // Explicit roles: below lg the table is restyled as cards, and Safari drops table semantics on display changes.
          role="table"
          className="w-full border-separate border-spacing-0 text-left max-lg:block"
        >
          <caption className="border border-hair bg-panel px-4 py-3 text-center max-lg:block">
            <span className="mono text-[12.5px] font-semibold tracking-[0.1em] text-chalk">
              <span aria-hidden className="text-cyan">
                &lt;
              </span>
              Current project schedule
              <span aria-hidden className="text-cyan">
                &gt;
              </span>
            </span>
            <span className="sr-only"> — every project in progress</span>
          </caption>

          <thead role="rowgroup" className="max-lg:block">
            <tr aria-hidden className="max-lg:hidden">
              {COLUMNS.map((c) => (
                <td key={c.letter} className="hud border-b border-r border-hair bg-panel py-1 text-center text-fog first:border-l">
                  {c.letter}
                </td>
              ))}
            </tr>
            <tr role="row" className="max-lg:flex max-lg:flex-wrap max-lg:items-center max-lg:gap-1.5 max-lg:py-3">
              {COLUMNS.map((c) => {
                const key = c.key;
                const state = key !== null && key === sort.key ? sort.dir : null;
                return (
                  <th
                    key={c.letter}
                    role="columnheader"
                    scope="col"
                    aria-sort={state ?? undefined}
                    className={`${HEAD} ${c.width ?? ""} ${key ? "" : "max-lg:sr-only"}`}
                  >
                    {key ? (
                      <SortButton label={c.label} state={state} onClick={() => handleSort(key)} />
                    ) : (
                      <span className="hud block px-4 py-3 text-fog">{c.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Re-keyed on every sort / filter: the view regenerates and its rows redraw. */}
          <tbody key={regen} role="rowgroup" className="max-lg:grid max-lg:gap-2 md:max-lg:grid-cols-2">
            {rows.map((p, i) => (
              <motion.tr
                key={p.id}
                role="row"
                data-reveal
                initial={HIDDEN}
                animate={inView ? SHOWN : HIDDEN}
                transition={rowTiming(i)}
                className="group max-lg:flex max-lg:flex-wrap max-lg:items-center max-lg:gap-x-3 max-lg:gap-y-1.5 max-lg:rounded-[4px] max-lg:border max-lg:border-hair max-lg:bg-panel/80 max-lg:p-4 max-lg:transition-colors max-lg:hover:border-cyan/60"
              >
                <td role="cell" className={`${CELL} ${SELECT_FIRST} mono text-[13px] text-fog max-lg:order-1 max-lg:flex-1`}>
                  {p.mark}
                </td>
                <th
                  role="rowheader"
                  scope="row"
                  className={`${CELL} ${SELECT} text-[15px] font-semibold leading-snug text-chalk max-lg:order-3 max-lg:basis-full max-lg:text-base`}
                >
                  {p.name}
                </th>
                <td role="cell" className={`${CELL} ${SELECT} text-[14px] text-mist max-lg:order-4`}>
                  {p.city}
                </td>
                <td role="cell" className={`${CELL} ${SELECT} text-[14px] text-mist max-lg:order-5`}>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: toneFor(p.sector) }} />
                    {p.sector}
                  </span>
                </td>
                <td role="cell" className={`${CELL} ${SELECT_LAST} max-lg:order-2`}>
                  <StatusPill />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        {/* The regenerate sweep. overflow-clip (not hidden) so the sticky header keeps working. */}
        {regen > 0 && !reduce && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] overflow-clip">
            <motion.div
              key={regen}
              className="absolute inset-0 border-b-2 border-cyan bg-gradient-to-b from-transparent from-60% to-cyan/[0.12]"
              initial={{ y: "-100%", opacity: 1 }}
              animate={{ y: "0%", opacity: 0 }}
              transition={{
                y: { duration: motionTokens.duration.slow, ease: motionTokens.easing.sharp },
                opacity: { duration: motionTokens.duration.normal, delay: motionTokens.duration.slow },
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border border-hair bg-panel/70 px-4 py-2.5 lg:mt-0 lg:border-t-0">
        <p className="hud text-fog">
          <span className="text-chalk">{rows.length}</span> of {ROWS.length} shown{asOf ? ` · ${asOf}` : ""}
        </p>
        <p aria-hidden className="hud text-fog">
          Status <span className="text-hair">·</span> <span className="text-green-glow">all in progress</span>
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        {`${rows.length} of ${ROWS.length} projects shown, sorted by ${sortLabel}, ${sort.dir}.`}
      </p>
    </div>
  );
}

type ChipProps = { filter: Filter; isOn: boolean; onSelect: (f: Filter) => void };

/** A sector value for the view filter. The active one carries the cyan selection pill, which slides between chips. */
function Chip({ filter, isOn, onSelect }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      aria-controls="work-schedule"
      onClick={() => onSelect(filter)}
      className={`relative isolate inline-flex h-9 items-center gap-2 rounded-[3px] border px-3 text-[13px] font-semibold leading-none transition-colors ${
        isOn ? "border-transparent text-void" : "border-hair bg-void/70 text-mist hover:border-cyan/50 hover:text-chalk"
      }`}
    >
      {isOn && (
        <motion.span
          layoutId="work-filter-pill"
          aria-hidden
          className="absolute -inset-px -z-10 rounded-[3px] bg-cyan shadow-[0_0_22px_-6px_rgb(var(--cyan-rgb))]"
          transition={springs.snappy}
        />
      )}
      {filter !== "All" && (
        <span aria-hidden className="h-2 w-2 rounded-[1px] ring-1 ring-void/30" style={{ background: toneFor(filter) }} />
      )}
      {filter}
      <span className={`mono text-[11px] font-medium ${isOn ? "text-void/75" : "text-fog"}`}>
        {COUNT[filter]}
        <span className="sr-only"> projects</span>
      </span>
    </button>
  );
}

type SortButtonProps = { label: string; state: SortDir | null; onClick: () => void };

/** A column header's sort control (APG sortable-table pattern: aria-sort lives on the <th>). */
function SortButton({ label, state, onClick }: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hud inline-flex items-center gap-2.5 transition-colors focus-visible:outline-offset-[-3px] max-lg:h-8 max-lg:rounded-[3px] max-lg:border max-lg:px-3 lg:w-full lg:justify-between lg:px-4 lg:py-3 ${
        state ? "text-cyan max-lg:border-cyan/60" : "text-mist hover:text-chalk max-lg:border-hair"
      }`}
    >
      {label}
      <svg aria-hidden viewBox="0 0 8 12" className="h-3 w-2 shrink-0">
        <path d="M4 .5 7.5 4.5H.5Z" className={state === "ascending" ? "fill-cyan" : "fill-fog/40"} />
        <path d="M4 11.5.5 7.5h7Z" className={state === "descending" ? "fill-cyan" : "fill-fog/40"} />
      </svg>
    </button>
  );
}

function StatusPill() {
  return (
    <span className="hud inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-exhaust/35 bg-exhaust/[0.08] px-2.5 py-1 text-green-glow">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-exhaust" />
      In progress
    </span>
  );
}
