import { BUILD_YEAR, company, contact, credentials } from "@/lib/content";
import { BrandMark } from "@/components/shell/BrandMark";
import { STREAM_FILLS, VIEWS } from "@/components/shell/site";

const credential = (label: string) => credentials.find((c) => c.label === label)?.value ?? "";
const LICENSE_LINE = `CA License ${credential("CA Contractor License")} · DIR ${credential("DIR Registration")}`;
const LINK = "rounded-sm text-mist transition-colors hover:text-cyan";
/** Title-block cells: hairline dividers, stacked below md, two columns on tablets, one strip from lg. */
const CELL = "border-hair p-5 md:p-6";

/**
 * The drawing's title block, run full width along the bottom of the set: firm,
 * licensing, office, the sheet index and this sheet's number and issue date.
 * Opaque and z-10, so it scrolls over the fixed 3D stage; the extra bottom
 * padding from md clears the fixed status bar.
 */
export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-chalk/25 bg-void">
      <div className="container-x pb-8 pt-10 md:pb-[4.5rem] md:pt-14">
        <div className="grid border-[1.5px] border-chalk/35 md:grid-cols-2 lg:grid-cols-12">
          <div className={`${CELL} border-b md:col-span-2 lg:col-span-4 lg:border-b-0 lg:border-r`}>
            <BrandMark className="block h-12 w-auto" />
            <p className="mt-5 text-lg font-bold leading-snug text-chalk">{company.name}</p>
            <p className="mt-1 text-mist">{company.certification}</p>
            <p className="hud mt-4 text-fog">{LICENSE_LINE}</p>
          </div>

          <address className={`${CELL} border-b not-italic md:border-r lg:col-span-3 lg:border-b-0`}>
            <p className="hud text-fog">Office</p>
            <p className="mt-3 text-chalk">
              {contact.street}
              <br />
              {contact.city}
            </p>
            <p className="mt-3 flex flex-col items-start gap-1 font-semibold">
              <a href={contact.phoneHref} className={LINK}>
                {contact.phone}
              </a>
              <a href={`mailto:${contact.email}`} className={`${LINK} [overflow-wrap:anywhere]`}>
                {contact.email}
              </a>
            </p>
          </address>

          <nav aria-label="Sheet index" className={`${CELL} border-b lg:col-span-3 lg:border-b-0 lg:border-r`}>
            <p className="hud text-fog">Sheet index</p>
            <ol className="mt-3 grid gap-y-1">
              {VIEWS.map((v) => (
                <li key={v.id}>
                  <a href={`#${v.id}`} className={`${LINK} grid grid-cols-[1.75rem_3.25rem_1fr] items-baseline gap-2 py-0.5`}>
                    <span className="mono text-[12px] text-fog">{v.index}</span>
                    <span className="mono text-[12px] text-cyan">{v.sheet}</span>
                    <span className="font-semibold">{v.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={`${CELL} md:col-span-2 lg:col-span-2`}>
            <p className="hud text-fog">Sheet</p>
            <p className="display mt-2 text-[2.6rem] text-chalk">G-000</p>
            <dl className="hud mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-fog">
              <dt>Issued</dt>
              <dd className="text-mist">{BUILD_YEAR}</dd>
              <dt>Scale</dt>
              <dd className="text-mist">NTS</dd>
            </dl>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="text-sm text-fog">
            <p>{`© ${BUILD_YEAR} ${company.name}`}</p>
            {/* Required until AAM approves this page for publication. */}
            <p className="mt-1">{`Concept draft — not an official website of ${company.name}`}</p>
          </div>
          <a href="#top" className={`group hud inline-flex items-center gap-3 ${LINK}`}>
            <span aria-hidden className="flex flex-col gap-[3px]">
              {STREAM_FILLS.map((fill) => (
                <span
                  key={fill}
                  className={`block h-[2px] w-5 ${fill} transition-transform ease-out group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5`}
                />
              ))}
            </span>
            Back to top
          </a>
        </div>
      </div>
    </footer>
  );
}
