import type { ReactNode } from "react";

export type ViewKind = "3D view" | "Section" | "Plan" | "Detail" | "Site plan" | "Schedule" | "Sheet" | "Elevation";

type Props = {
  /** section id — the ribbon and project browser link here */
  id: string;
  /** id of the h2 (the section's aria-labelledby) */
  titleId: string;
  /** view number, e.g. "03" */
  number: string;
  /** sheet reference under the number, e.g. "A-301" */
  sheet: string;
  /** view name — rendered as the section's h2 */
  name: string;
  kind: ViewKind;
  /** drawing scale label, default "NTS" */
  scale?: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
  /** inner container classes (padding / width) */
  innerClassName?: string;
};

/** Revit-style view title: a split bubble (view number over sheet), the name on a heavy rule, kind and scale beneath. */
export function ViewTitle({ titleId, number, sheet, name, kind, scale = "NTS" }: Omit<Props, "id" | "children" | "intro" | "className" | "innerClassName">) {
  return (
    <header className="flex items-start gap-4 md:gap-6">
      <div aria-hidden className="mt-1 grid h-14 w-14 shrink-0 grid-rows-2 rounded-full border-[1.5px] border-chalk/80 text-center md:h-[72px] md:w-[72px]">
        <span className="mono flex items-end justify-center border-b border-chalk/60 pb-0.5 text-[15px] font-semibold text-chalk md:text-[18px]">{number}</span>
        <span className="mono flex items-start justify-center pt-0.5 text-[9.5px] tracking-[0.08em] text-cyan md:text-[11px]">{sheet}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="display text-[clamp(2.1rem,5vw,4.4rem)] text-chalk">
          {name}
        </h2>
        <div aria-hidden className="mt-3 h-[3px] w-full max-w-[min(100%,46rem)] bg-gradient-to-r from-chalk via-chalk/70 to-transparent" />
        <p className="hud mt-2.5 text-fog">
          <span className="text-cyan">{kind}</span> · Scale {scale} · {number}/{sheet}
        </p>
      </div>
    </header>
  );
}

/** Corner brackets of a view's crop region. */
export function CropMarks({ className = "" }: { className?: string }) {
  const arm = "absolute h-5 w-5 border-cyan/50";
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className={`${arm} left-0 top-0 border-l border-t`} />
      <span className={`${arm} right-0 top-0 border-r border-t`} />
      <span className={`${arm} bottom-0 left-0 border-b border-l`} />
      <span className={`${arm} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

/**
 * Every section is a saved view of the model: a drafting-grid sheet inside a
 * cyan crop region, opened by a view title. Opaque, so it scrolls cleanly over
 * the fixed 3D stage.
 */
export function ViewFrame({ id, titleId, number, sheet, name, kind, scale, intro, children, className = "", innerClassName = "" }: Props) {
  return (
    <section id={id} aria-labelledby={titleId} className={`blueprint relative isolate bg-void ${className}`}>
      <div className={`container-x relative py-24 md:py-32 ${innerClassName}`}>
        <CropMarks className="mx-[calc(var(--gutter)/2)] my-10 md:my-14" />
        <ViewTitle titleId={titleId} number={number} sheet={sheet} name={name} kind={kind} scale={scale} />
        {intro && <div className="mt-6 max-w-2xl text-[17px] leading-relaxed text-mist md:text-lg">{intro}</div>}
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}
