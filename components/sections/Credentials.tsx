import { company, credentials, leadership } from "@/lib/content";
import { motionTokens } from "@/lib/motion-tokens";
import { ViewFrame } from "@/components/bimui/ViewFrame";
import { BrandMark } from "@/components/shell/BrandMark";
import { Stamp } from "@/components/shell/Stamp";
import { viewFrame } from "@/components/shell/site";

type Credential = (typeof credentials)[number];

/** Each credential's ink and resting tilt on the sheet. Presentation only; every word comes from content.ts. */
const STAMP_STYLE: Record<Credential["label"], { ink: string; tilt: number }> = {
  Certified: { ink: "text-red-glow", tilt: 4 },
  "CA Contractor License": { ink: "text-cyan", tilt: -5 },
  "DIR Registration": { ink: "text-violet", tilt: -2 },
  "Prevailing Wage": { ink: "text-green-glow", tilt: 3 },
};

/**
 * Title-block fields: the company's own facts, then its leadership (title as the
 * field label, name as the value). Spans 4/3/2/3 at lg so "outstanding" never
 * splits mid-word.
 */
const FIELDS: { k: string; v: string; span: string; isName?: boolean }[] = [
  { k: "Contractor", v: company.name, span: "col-span-2 lg:col-span-4" },
  { k: "Certification", v: company.certification, span: "lg:col-span-3" },
  { k: "Established", v: String(company.founded), span: "lg:col-span-2" },
  { k: "Motto", v: `“${company.motto}”`, span: "col-span-2 lg:col-span-3" },
  ...leadership.map((p) => ({ k: p.title, v: p.name, span: "col-span-2 lg:col-span-6", isName: true })),
];

/** BIM selection on hover: the field lifts to the panel tone inside a cyan outline. */
const SELECTABLE = "transition-colors hover:bg-panel hover:shadow-[inset_0_0_0_1px_rgb(var(--cyan-rgb)/0.55)]";
const STRIP = "hud border-hair bg-panel px-5 py-2.5 text-chalk";

/**
 * 05 · Saved view "Title block" (G-001): the four credentials stamped onto a drawing
 * title block — a license seal, a certification stamp, a registration stamp and a
 * prevailing-wage stamp — above the company's fields and its leadership.
 */
export default function Credentials() {
  return (
    <ViewFrame
      {...viewFrame("credentials")}
      intro={`${company.certification} — licensed in California, registered for public works, and ready for prevailing-wage projects.`}
    >
      <div className="border-[1.5px] border-chalk/40 bg-void">
        <h3 className={`${STRIP} border-b`}>Stamps &amp; certifications</h3>
        <ul className="grid gap-px bg-hair min-[480px]:grid-cols-2 lg:grid-cols-4">
          {credentials.map((c, i) => {
            const style = STAMP_STYLE[c.label];
            return (
              <li key={c.label} className="grid min-h-[15rem] place-items-center bg-void px-5 py-9">
                <Stamp tilt={style.tilt} delay={i * motionTokens.stagger} className={`flex w-full justify-center ${style.ink}`}>
                  <StampFace c={c} />
                </Stamp>
              </li>
            );
          })}
        </ul>

        <h3 className={`${STRIP} border-y`}>Company &amp; leadership</h3>
        <dl className="grid grid-cols-2 gap-px bg-hair lg:grid-cols-12">
          {FIELDS.map((f) => (
            <div key={f.k} className={`bg-void p-5 sm:p-6 ${SELECTABLE} ${f.span}`}>
              <dt className="hud text-fog">{f.k}</dt>
              {f.isName ? (
                <dd className="display mt-3 text-[clamp(1.6rem,3.2vw,2.5rem)] text-chalk">{f.v}</dd>
              ) : (
                <dd className="mt-2 flex items-center gap-3 text-lg font-semibold leading-snug text-chalk">
                  {f.k === "Contractor" && <BrandMark className="block h-9 w-auto shrink-0" />}
                  {f.v}
                </dd>
              )}
            </div>
          ))}
        </dl>
      </div>
    </ViewFrame>
  );
}

/** The stamp drawn for each credential, all in one ink (currentColor, set by <Stamp>). */
function StampFace({ c }: { c: Credential }) {
  switch (c.label) {
    case "CA Contractor License":
      return <Seal c={c} />;
    case "DIR Registration":
      return (
        <div className="w-full max-w-[14rem] overflow-hidden rounded-[4px] border-2 border-current text-center">
          <p className="hud bg-current px-3 py-1.5">
            <span className="text-void">{c.label}</span>
          </p>
          <p className="mono px-3 pt-3.5 text-[1.3rem] font-bold leading-none tracking-tight">{c.value}</p>
          <p className="px-3 pb-3.5 pt-2 text-[12px] font-medium leading-snug">{c.detail}</p>
        </div>
      );
    case "Prevailing Wage":
      return (
        <div className="w-full max-w-[13rem] rounded-[1.4rem] border-2 border-current px-5 py-4 text-center">
          <p className="hud inline-flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M2 6.5 5 9.5 10 2.5" />
            </svg>
            {c.label}
          </p>
          <p className="display mt-1.5 text-[2.2rem] uppercase leading-none tracking-[0.04em]">{c.value}</p>
          <p className="mt-2 text-[12px] font-medium leading-snug">{c.detail}</p>
        </div>
      );
    default:
      return (
        <div className="w-full max-w-[13rem] rounded-[5px] border-[5px] border-double border-current px-4 py-4 text-center">
          <p className="hud">{c.label}</p>
          <p className="display mt-2 text-[2rem] leading-none">{c.value}</p>
          <p className="mt-2.5 text-[12px] font-medium leading-snug">{c.detail}</p>
        </div>
      );
  }
}

/**
 * The license as a circular seal: the label around the top arc, the company around
 * the bottom, the number in the middle. The arcs are decorative SVG text, so the
 * seal's words reach screen readers once, through the sr-only line.
 */
function Seal({ c }: { c: Credential }) {
  return (
    <div className="relative aspect-square w-44 sm:w-48">
      <svg viewBox="0 0 200 200" aria-hidden className="absolute inset-0 h-full w-full" fill="none" stroke="currentColor">
        <defs>
          {/* baseline r70 over the top (glyphs stand outward); r83 under the bottom (glyphs stand inward) */}
          <path id="seal-arc-top" d="M30 100a70 70 0 0 1 140 0" />
          <path id="seal-arc-bottom" d="M17 100a83 83 0 0 0 166 0" />
        </defs>
        <circle cx="100" cy="100" r="97" strokeWidth="3" />
        <circle cx="100" cy="100" r="91" strokeWidth="1" />
        <circle cx="100" cy="100" r="58" strokeWidth="1" />
        <g className="mono" fill="currentColor" stroke="none" fontSize="12" fontWeight="600" letterSpacing="2">
          <text>
            <textPath href="#seal-arc-top" startOffset="50%" textAnchor="middle">
              {c.label.toUpperCase()}
            </textPath>
          </text>
          <text>
            <textPath href="#seal-arc-bottom" startOffset="50%" textAnchor="middle">
              {company.short.toUpperCase()}
            </textPath>
          </text>
          <path d="M18 100l3-2.5 3 2.5-3 2.5zM176 100l3-2.5 3 2.5-3 2.5z" />
        </g>
      </svg>
      <div aria-hidden className="absolute inset-0 grid place-content-center justify-items-center">
        <span className="mono text-[1.3rem] font-bold leading-none tracking-tight sm:text-[1.45rem]">{c.value}</span>
        <span className="mt-2 h-px w-10 bg-current" />
      </div>
      <span className="sr-only">{`${c.label} ${c.value} — ${c.detail}`}</span>
    </div>
  );
}
