/**
 * Every fact on the page, with where it came from. Sections render from here and
 * never hardcode copy. Sources:
 *   [site]  allairmechanical.com (public company website)
 *   [prop]  AAM proposal closing block — the constants on every issued bid
 *   [jobs]  Spectrum active-job reports, 2026-08-05 — project NAMES and CITIES only.
 *           Contract values, billing and cost in those reports are confidential and
 *           deliberately never copied here.
 *   [ops]   AAM operations: the in-house sheet-metal fab shop (Vulcan / FabShop), which
 *           fabricates rectangular duct only. Plumbing is subcontracted, so it is NOT
 *           presented anywhere on this page as a self-performed service.
 */

export const company = {
  name: "All Air Mechanical Contractors, Inc.", // [site][prop]
  short: "All Air Mechanical",
  tagline: "Delivering a Better Product", // [site]
  motto: "Be outstanding", // [site]
  certification: "An SBE & MBE Company", // [prop]
  founded: 1994, // [site] "since 1994"
  region: "San Francisco Bay Area",
} as const;

export const contact = {
  street: "535 Railroad Avenue", // [site]
  city: "South San Francisco, CA 94080", // [site]
  phone: "(650) 615-0248", // [site][prop]
  phoneHref: "tel:+16506150248",
  fax: "(650) 615-0217", // [site]
  email: "info@allairmechanical.com", // [site]
  hours: "Mon – Fri · 7:30 am – 3:30 pm", // [site]
  website: "https://allairmechanical.com",
  // HQ coordinates, for the map (South San Francisco).
  hq: { lat: 37.6547, lon: -122.4077 },
} as const;

/** The year the site was built — identical on server and client (see next.config.mjs). */
export const BUILD_YEAR = Number(process.env.NEXT_PUBLIC_BUILD_YEAR) || company.founded;

/** Years in business as of the build. Rebuild each year to keep it current. */
export const yearsInBusiness = BUILD_YEAR - company.founded;

export const stats = [
  { value: yearsInBusiness, suffix: "", label: "Years building the Bay Area", note: "Since 1994" }, // [site]
  { value: 500, suffix: "+", label: "Commercial projects completed", note: "Company record" }, // [site]
  { value: 49, suffix: "", label: "Projects in progress right now", note: "As of Aug 2026" }, // [jobs]
  { value: 23, suffix: "", label: "Cities with active work", note: "As of Aug 2026" }, // [jobs] (includes Davis)
  { value: 50, suffix: "+", label: "People on the team", note: "Company record" }, // [site] 52 employees
] as const;

export type ServiceId = "hvac" | "vrf" | "sheetmetal" | "exhaust" | "controls" | "maintenance" | "fabrication";

export const services: {
  id: ServiceId;
  title: string;
  short: string;
  body: string;
  items: string[];
  source: string;
}[] = [
  {
    id: "hvac",
    title: "Heating, Ventilation & Air Conditioning",
    short: "HVAC",
    body: "Complete mechanical systems for commercial, industrial and multifamily buildings — from rooftop unit change-outs on occupied stores to full tenant-improvement and ground-up installs.",
    items: ["Heating", "Ventilation", "Cooling", "Rooftop & split systems", "Ductwork"],
    source: "site",
  },
  {
    id: "vrf",
    title: "VRF & Split Systems",
    short: "VRF",
    body: "Variable-refrigerant-flow and split systems: outdoor units on the roof, insulated refrigerant piping, and indoor units zone by zone — heating and cooling where each space needs it.",
    items: ["VRF outdoor units", "Refrigerant piping", "Branch selector boxes", "Ceiling cassettes", "Ductless splits"],
    source: "ops", // within the "Rooftop & split systems" HVAC scope [site]; AAM bids VRF systems [ops]
  },
  {
    id: "sheetmetal",
    title: "Architectural Sheet Metal",
    short: "Sheet Metal",
    body: "The metal that keeps a building's envelope tight and its roofline clean.",
    items: ["Coping", "Gutters", "Counter flashing", "Reglet flashing", "Saddles", "Metal wall siding", "Metal roofing"],
    source: "site",
  },
  {
    id: "exhaust",
    title: "Exhaust & Outside Air",
    short: "Exhaust",
    body: "The ventilation side of every system: exhaust that carries stale air out of the building, and outside air that brings fresh air in.",
    items: ["Exhaust fans & ductwork", "Outside-air intake", "Fresh-air ventilation"],
    source: "site",
  },
  {
    id: "controls",
    title: "EMS & Controls",
    short: "Controls",
    body: "Energy-management and control systems that make the equipment we install run efficiently.",
    items: ["EMS control systems", "Thermostats & sensors", "Sequences & scheduling"],
    source: "site",
  },
  {
    id: "maintenance",
    title: "Maintenance",
    short: "Service",
    body: "Preventative maintenance that keeps systems running long after handover.",
    items: ["Preventative maintenance", "Service & repair", "Equipment replacement"],
    source: "site",
  },
  {
    id: "fabrication",
    title: "In-House Fabrication",
    short: "Fab Shop",
    body: "Rectangular ductwork fabricated in our own South San Francisco shop — so fit, schedule and quality stay in our hands.",
    items: ["Rectangular duct", "Fittings, elbows & transitions"],
    source: "ops",
  },
];

/** Equipment AAM installs. Names only — never reproduce these brands' logos. [site] */
export const equipmentBrands = ["Carrier", "Trane", "Lennox", "York", "Johnson Controls", "Day & Night"] as const;

export const credentials = [
  { label: "Certified", value: "SBE & MBE", detail: "Small and minority business enterprise" }, // [prop]
  { label: "CA Contractor License", value: "#851335", detail: "California contractor's license" }, // [prop]
  { label: "DIR Registration", value: "#1001175438", detail: "Registered for California public works" }, // [prop]
  { label: "Prevailing Wage", value: "Ready", detail: "Public-agency and prevailing-wage projects" }, // [prop]
] as const;

export const leadership = [
  { name: "Arvind Tandel", title: "President" }, // [prop]
  { name: "Gerard J Borromeo", title: "Vice President" }, // [prop]
] as const;

export type Sector =
  | "Hospitality"
  | "Retail & Showroom"
  | "Education"
  | "Residential & Senior Living"
  | "Restaurants"
  | "Recreation & Fitness"
  | "Healthcare & Wellness"
  | "Workplace, Industrial & Civic";

export const sectors: Sector[] = [
  "Hospitality",
  "Retail & Showroom",
  "Education",
  "Residential & Senior Living",
  "Restaurants",
  "Recreation & Fitness",
  "Healthcare & Wellness",
  "Workplace, Industrial & Civic",
];

/**
 * Current projects [jobs] — a curated, clearly-named subset of the 49 active jobs.
 * Private residences and ambiguous internal job names are left out on purpose.
 * These are IN PROGRESS: never label them "completed".
 */
export const currentProjects: { name: string; city: string; sector: Sector }[] = [
  { name: "Harbor Bay Hotel", city: "Alameda", sector: "Hospitality" },
  { name: "Home2 Suites", city: "Vacaville", sector: "Hospitality" },
  { name: "Home2 Suites", city: "Pittsburg", sector: "Hospitality" },
  { name: "Home2 Suites", city: "South San Francisco", sector: "Hospitality" },
  { name: "Moxy Hotel", city: "Menlo Park", sector: "Hospitality" },
  { name: "Sephora", city: "San Jose", sector: "Retail & Showroom" },
  { name: "RH", city: "Los Gatos", sector: "Retail & Showroom" },
  { name: "On Running", city: "San Francisco", sector: "Retail & Showroom" },
  { name: "Cowtan & Tout Showroom", city: "San Francisco", sector: "Retail & Showroom" },
  { name: "Sports Basement — rooftop unit replacement", city: "San Jose", sector: "Retail & Showroom" },
  { name: "Tokyo Market, Bay Street", city: "Emeryville", sector: "Retail & Showroom" },
  { name: "Rivian", city: "Emeryville", sector: "Retail & Showroom" },
  { name: "Stanford University — Florence Moore Hall", city: "Stanford", sector: "Education" },
  { name: "UC Davis EPR Center", city: "Davis", sector: "Education" },
  { name: "Primrose School", city: "San Mateo", sector: "Education" },
  { name: "Primrose School", city: "San Jose", sector: "Education" },
  { name: "Draper University", city: "San Mateo", sector: "Education" },
  { name: "La Vista Residential", city: "Hayward", sector: "Residential & Senior Living" },
  { name: "Montego Senior Living", city: "Walnut Creek", sector: "Residential & Senior Living" },
  { name: "777 W San Carlos", city: "San Jose", sector: "Residential & Senior Living" },
  { name: "188 W St. James Tower", city: "San Jose", sector: "Residential & Senior Living" },
  { name: "Original Joe's", city: "Daly City", sector: "Restaurants" },
  { name: "Esther's Orbit Room", city: "Oakland", sector: "Restaurants" },
  { name: "Elena's Restaurant", city: "San Francisco", sector: "Restaurants" },
  { name: "Mapache", city: "Portola Valley", sector: "Restaurants" },
  { name: "The New Aquatic Center", city: "Walnut Creek", sector: "Recreation & Fitness" },
  { name: "Urban Air", city: "Gilroy", sector: "Recreation & Fitness" },
  { name: "Anytime Fitness", city: "San Rafael", sector: "Recreation & Fitness" },
  { name: "Mosaddegh Ophthalmology", city: "San Francisco", sector: "Healthcare & Wellness" },
  { name: "NEMS Acupuncture Clinic", city: "San Francisco", sector: "Healthcare & Wellness" },
  { name: "Mission Bay Hub", city: "San Francisco", sector: "Workplace, Industrial & Civic" },
  { name: "Cavagnero Office Relocation", city: "San Francisco", sector: "Workplace, Industrial & Civic" },
  { name: "Oakland Road Warehouse", city: "San Jose", sector: "Workplace, Industrial & Civic" },
  { name: "Secure Space Self Storage", city: "Walnut Creek", sector: "Workplace, Industrial & Civic" },
  { name: "Flood Resiliency Improvements", city: "Oakland", sector: "Workplace, Industrial & Civic" },
  { name: "Santa Sabina Renovation", city: "San Rafael", sector: "Workplace, Industrial & Civic" },
  { name: "Sequoia Church", city: "Redwood City", sector: "Workplace, Industrial & Civic" },
];

/** Completed work the company names publicly. [site] */
export const pastProjects = ["Kerasotes Theater", "Summit Office Building", "NewPark Mall"] as const;

/**
 * Active jobs per city — ALL 49 active jobs, counts only [jobs]. Sums to 49.
 * The map sizes each city's marker by this count.
 */
export const activeByCity: Record<string, number> = {
  "San Francisco": 8,
  "San Jose": 8,
  "Walnut Creek": 4,
  "San Rafael": 3,
  Oakland: 3,
  Alameda: 3,
  "South San Francisco": 2,
  Emeryville: 2,
  "San Mateo": 2,
  "Daly City": 1,
  Vacaville: 1,
  Pittsburg: 1,
  Stanford: 1,
  Gilroy: 1,
  "Redwood City": 1,
  "Los Gatos": 1,
  "Menlo Park": 1,
  Lafayette: 1,
  Kentfield: 1,
  "Portola Valley": 1,
  Hayward: 1,
  "Santa Clara": 1,
  Davis: 1,
};

/**
 * Field photos of AAM's own installed work, from active-job folders — EXIF and GPS
 * data stripped on import. `src` is relative to /public; prefix it with the base path.
 */
export const photos: { src: string; alt: string; project: string }[] = [
  { src: "/photos/rooftop-ductwork.jpg", alt: "New galvanized supply and return ductwork running across a commercial roof", project: "Sports Basement — rooftop unit replacement, San Jose" },
  { src: "/photos/rooftop-units.jpg", alt: "Rooftop HVAC units installed on a retail building", project: "Sports Basement — rooftop unit replacement, San Jose" },
  { src: "/photos/rtu-disconnect.jpg", alt: "New rooftop unit with its electrical disconnect on a steel stand", project: "Sports Basement — rooftop unit replacement, San Jose" },
  { src: "/photos/rtu-install.jpg", alt: "Rooftop unit and disconnect after installation", project: "Sports Basement — rooftop unit replacement, San Jose" },
  { src: "/photos/duct-transition.jpg", alt: "Fabricated duct transition connecting to a rooftop unit", project: "Sports Basement — rooftop unit replacement, San Jose" },
  // overhead-services.jpg (188 W St. James) was dropped: it mostly shows the plumbing trade's lines, which AAM subcontracts.
];

/** Base path for plain <img>/<a> URLs under a GitHub Pages project subpath ("" locally). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
