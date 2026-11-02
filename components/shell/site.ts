import { contact } from "@/lib/content";

/**
 * Site-shell constants shared by the ribbon, the sections and the footer.
 * Plain module (no "use client") so server components can read it.
 */

/**
 * The drawing set in scroll order: the model's default 3D view (the hero), then
 * every saved view. `label` is the ribbon tab; `index`, `sheet`, `name` and
 * `kind` are the view title each section opens with. Presentation labels only.
 */
export const VIEWS = [
  { id: "hero", label: "Model", index: "00", sheet: "{3D}", name: "Default 3D view", kind: "3D view" },
  { id: "systems", label: "Systems", index: "01", sheet: "M-001", name: "Coordination model", kind: "3D view" },
  { id: "shop", label: "Shop", index: "02", sheet: "M-501", name: "Detail 5 · Rectangular duct", kind: "Detail" },
  { id: "reach", label: "Site", index: "03", sheet: "G-101", name: "Site plan · Bay Area", kind: "Site plan" },
  { id: "work", label: "Schedule", index: "04", sheet: "G-201", name: "Project schedule", kind: "Schedule" },
  { id: "credentials", label: "Credentials", index: "05", sheet: "G-001", name: "Title block", kind: "Sheet" },
  { id: "contact", label: "Contact", index: "06", sheet: "G-301", name: "Issued for bid", kind: "Sheet" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

/** The saved views: every page section after the hero, in scroll order. */
export const SECTION_LINKS = VIEWS.slice(1);

/** ViewFrame props for a saved view, so a section's title and the sheet index can never drift apart. */
export function viewFrame(id: ViewId) {
  const v = VIEWS.find((view) => view.id === id) ?? VIEWS[0];
  return { id: v.id, titleId: `${v.id}-title`, number: v.index, sheet: v.sheet, name: v.name, kind: v.kind };
}

/** The one bid call-to-action. */
export const BID_HREF = `mailto:${contact.email}?subject=Bid%20request`;

/** The logo's three streams in order: supply blue, exhaust / outside-air green, return red. */
export const STREAM_FILLS = ["bg-blue", "bg-green", "bg-red"] as const;

/** The three streams side by side as one hard-stop bar. */
export const TRI_BAR = "linear-gradient(90deg, var(--blue) 0 33.34%, var(--green) 0 66.67%, var(--red) 0)";
