import type { ReactNode } from "react";

type Props = {
  title: string;
  /** right-aligned mono note in the header (e.g. "Type: RTU-1") */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** A BIM properties-palette panel: hairline header with a mono title, then content. */
export function Panel({ title, meta, children, className = "", bodyClassName = "p-4" }: Props) {
  return (
    <div className={`glass rounded-md ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-hair px-4 py-2.5">
        <span className="hud flex items-center gap-2 text-chalk">
          <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-cyan" />
          {title}
        </span>
        {meta && <span className="hud text-fog">{meta}</span>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** One key / value row for a properties panel. */
export function PropRow({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="hud grid grid-cols-[minmax(7rem,auto)_1fr] gap-4 border-b border-hair/60 py-1.5 last:border-b-0">
      <span className="text-fog">{k}</span>
      <span className="text-chalk">{v}</span>
    </div>
  );
}
