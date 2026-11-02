import { VIEWS as SET, type ViewId } from "@/components/shell/site";

/**
 * The drawing set as the chrome reads it (ribbon tabs, project browser, status
 * bar): the shared view list from components/shell/site — the same one every
 * section's view title comes from — plus each view's project-browser folder.
 * Plain module (no "use client"), so server components can read it too.
 */
export type { ViewId };

export type View = (typeof SET)[number] & { folder: string };

const FOLDER: Record<ViewId, string> = {
  hero: "3D Views",
  systems: "3D Views",
  shop: "Detail Views",
  reach: "Site Plans",
  work: "Schedules / Quantities",
  credentials: "Sheets (all)",
  contact: "Sheets (all)",
};

export const VIEWS: readonly View[] = SET.map((v) => ({ ...v, folder: FOLDER[v.id] }));

export const viewOf = (id: ViewId): View => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

/** The views filed into project-browser folders, folders in first-seen order. */
export const BROWSER: readonly { folder: string; views: readonly View[] }[] = Array.from(
  VIEWS.reduce((folders, v) => folders.set(v.folder, [...(folders.get(v.folder) ?? []), v]), new Map<string, View[]>()),
  ([folder, views]) => ({ folder, views }),
);
