"use client";

import { CARDS, type CardSpec, type Icon, type System } from "./registry";

/** Card width in px (unscaled); the height follows its content and is measured on mount. */
export const CARD_W = 256;
/** Header bar height in px: side leaders land on its middle. */
export const HEADER_H = 30;

/** Header fill (the system's model colour, dark type on it is >= 6:1) and a text-safe twin for small type on the body. */
const TONE: Record<System, { fill: string; text: string }> = {
  model: { fill: "#38E1FF", text: "#7FEBFF" },
  sheetmetal: { fill: "#C9E7F6", text: "#C9E7F6" },
  supply: { fill: "#2E8BFF", text: "#6FB6FF" },
  ret: { fill: "#FF4D6D", text: "#FF8199" },
  exhaust: { fill: "#2BFF88", text: "#7DFFB5" },
  controls: { fill: "#FFB547", text: "#FFB547" },
  refrigerant: { fill: "#FF8A4C", text: "#FFA36E" },
  maintenance: { fill: "#8B7CFF", text: "#B9B0FF" },
};

/** 16 × 16 line icons (stroke = currentColor). */
const ICON: Record<Icon, string> = {
  building: "M3 14.5V4.5L8 2l5 2.5v10M1.5 14.5h13M5.5 6.5H7M9 6.5h1.5M5.5 9.5H7M9 9.5h1.5M7 14.5V12h2v2.5",
  coping: "M3 8V5h10v3M5.5 5v9.5M10.5 5v9.5M5.5 11h5",
  panels: "M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11",
  rtu: "M1.5 5h13v7.5h-13zM8.5 8.75a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3.5 7.5h3M3.5 10h3",
  damper: "M2 3.5h12v9H2zM4.5 10.5l7-5M8 8h.01",
  round: "M4 4.5h8M4 11.5h8M4 4.5a1.5 3.5 0 0 0 0 7M12 4.5a1.5 3.5 0 0 1 0 7a1.5 3.5 0 0 1 0-7M7.2 4.5 6 11.5M10.2 4.5 9 11.5",
  wrap: "M1.5 5h13v6h-13zM4.5 5 3 11M8 5l-1.5 6M11.5 5 10 11",
  condenser: "M3 2.5h10v12H3zM5.25 7.5a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0M3 12h10",
  selector: "M5 5h6v6H5zM1.5 8H5M11 6.5h3.5M11 9.5h3.5",
  cassette: "M2 2h12v12H2zM5 4.5h6M5 11.5h6M4.5 5v6M11.5 5v6",
  split: "M1.5 4h13v5.5h-13zM3.5 7.5h9M4.5 12.5l1-1.5M8 13.5V11M11.5 12.5l-1-1.5",
  fan: "M1.75 8a6.25 6.25 0 1 0 12.5 0a6.25 6.25 0 1 0-12.5 0M8 8c0-2.5 1.5-3.5 3-3M8 8c2.2 1.2 2.3 3 1.5 4.3M8 8c-2.2 1.2-4 .4-4.5-1",
  hood: "M4.5 3H10l3.5 4v6h-9zM6.5 8.5h5M6.5 11h5M1 8h3M2.8 6.5 4.3 8l-1.5 1.5",
  ems: "M3 1.5h10v13H3zM5.5 4.5h5M5.5 7h5M5.5 9.5h2M5.5 12h.01M8 12h.01M10.5 12h.01",
  sensor: "M4 1.5h8v13H4zM6 6.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 11h4",
  service: "M10.5 1.8a3.3 3.3 0 0 0-3.1 4.4L2 11.6 4.4 14l5.4-5.4a3.3 3.3 0 0 0 4.4-3.1l-2 .5-1.6-1.6.5-2z",
  check: "M1.75 8a6.25 6.25 0 1 0 12.5 0a6.25 6.25 0 1 0-12.5 0M5 8.2l2 2 4-4.2",
};

/** BIM selection ticks at the card's corners: [position classes, border sides]. */
const CORNERS = [
  "-left-[5px] -top-[5px] border-l-2 border-t-2",
  "-right-[5px] -top-[5px] border-r-2 border-t-2",
  "-bottom-[5px] -left-[5px] border-b-2 border-l-2",
  "-bottom-[5px] -right-[5px] border-b-2 border-r-2",
] as const;

/** The DOM nodes the frame loop writes to, found once per mount. */
export type CardNodes = {
  root: HTMLDivElement;
  card: HTMLDivElement;
  clip: HTMLDivElement;
  body: HTMLDivElement;
  corners: HTMLDivElement;
  chip: HTMLSpanElement;
  chipDot: HTMLSpanElement;
  line: SVGPathElement;
  dot: SVGCircleElement;
  ring: SVGCircleElement;
  /** unscaled card size in px */
  w: number;
  h: number;
};

/** Looks up a mounted card's nodes and measures it (one layout read per mount). */
export function collect(root: HTMLDivElement): CardNodes | null {
  const q = <T extends Element>(k: string) => root.querySelector<T>(`[data-k="${k}"]`);
  const card = q<HTMLDivElement>("card");
  const clip = q<HTMLDivElement>("clip");
  const body = q<HTMLDivElement>("body");
  const corners = q<HTMLDivElement>("corners");
  const chip = q<HTMLSpanElement>("chip");
  const chipDot = q<HTMLSpanElement>("chipDot");
  const line = q<SVGPathElement>("line");
  const dot = q<SVGCircleElement>("dot");
  const ring = q<SVGCircleElement>("ring");
  if (!card || !clip || !body || !corners || !chip || !chipDot || !line || !dot || !ring) return null;
  return { root, card, clip, body, corners, chip, chipDot, line, dot, ring, w: card.offsetWidth || CARD_W, h: card.offsetHeight || 200 };
}

type CardProps = { spec: CardSpec; bind: (el: HTMLDivElement | null) => void };

/** One element card and its leader. Starts hidden; ElementCards positions and reveals it every frame. */
function Card({ spec, bind }: CardProps) {
  const tone = TONE[spec.system];
  return (
    <div ref={bind} className="absolute inset-0" style={{ visibility: "hidden", opacity: 0 }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" fill="none" stroke={tone.fill}>
        <path data-k="line" pathLength={1} strokeWidth={1.5} strokeDasharray="1 1" strokeDashoffset={1} strokeLinecap="round" strokeLinejoin="round" />
        <circle data-k="ring" r={0} strokeWidth={1.25} />
        <circle data-k="dot" r={0} fill={tone.fill} stroke="#04070D" strokeWidth={1.5} />
      </svg>

      <div data-k="card" className="absolute left-0 top-0 origin-top-left" style={{ width: CARD_W }}>
        <div data-k="clip">
          <div
            className="overflow-hidden rounded-[5px] border bg-panel/95"
            style={{
              borderColor: `${tone.fill}88`,
              boxShadow: `0 0 0 1px ${tone.fill}1f, 0 18px 44px -20px ${tone.fill}aa, 0 28px 60px -30px rgb(0 0 0 / 0.9)`,
            }}
          >
            <div className="flex items-center gap-2 px-3 text-void" style={{ height: HEADER_H, background: tone.fill }}>
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON[spec.icon]} />
              </svg>
              <span className="font-mono text-[12.5px] font-bold leading-none tracking-[0.06em]">{spec.mark}</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-[3px] bg-void/85 px-1.5 py-[4px] font-mono text-[9px] font-medium uppercase leading-none tracking-[0.12em] text-chalk">
                <span data-k="chipDot" className="h-1.5 w-1.5 rounded-full bg-cyan" />
                <span data-k="chip">{spec.status[0]}</span>
              </span>
            </div>
            <div data-k="body" className="px-3 pb-2.5 pt-2">
              <p className="text-[14px] font-semibold leading-snug text-chalk">{spec.type}</p>
              {/* phones get the slim card (no category, two rows), so it fits beside its element in the strip above the sheet */}
              <p className="hud mt-0.5 max-lg:hidden" style={{ color: tone.text }}>
                {spec.category}
              </p>
              <dl className="mt-2 border-t border-hair">
                {spec.rows.map(([k, v], i) => (
                  <div key={k} className={`hud flex items-baseline justify-between gap-3 border-b border-hair/60 py-[5px] ${i > 1 ? "max-lg:hidden" : ""}`}>
                    <dt className="shrink-0 text-fog">{k}</dt>
                    <dd className="text-right normal-case tracking-[0.04em] text-chalk">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="hud mt-1.5 text-[9px] text-fog">Values illustrative · NTS</p>
            </div>
          </div>
        </div>
        <div data-k="corners" style={{ opacity: 0 }}>
          {CORNERS.map((c) => (
            <span key={c} className={`absolute h-2.5 w-2.5 ${c}`} style={{ borderColor: tone.fill }} />
          ))}
        </div>
      </div>
    </div>
  );
}

type LayerProps = {
  /** bit i set: CARDS[i] is near its window and mounted */
  mask: number;
  bind: readonly ((el: HTMLDivElement | null) => void)[];
};

/** Every card near its window (the rest aren't in the DOM at all). */
export function CardLayer({ mask, bind }: LayerProps) {
  return <>{CARDS.map((c, i) => (mask & (1 << i) ? <Card key={c.id} spec={c} bind={bind[i]} /> : null))}</>;
}
