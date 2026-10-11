import type { LabPermission } from "./access";
import type { Clock, Target } from "./turnaround";

import { clockFor, targetFor } from "./turnaround";

/**
 * The lab worklist projection (Lab Phase 0, ADR 0224; LW-1..LW-12). Pure: the loader
 * (lib/lab/read.ts) hands it the open specimens with their times and sources, and this decides the
 * stage, section, clock, order, counts and the one action each row offers. Filters hide rows;
 * nothing here drops one (Law 4): every open item is under "All sections".
 */

export type LabStage = "to_receive" | "to_result" | "preliminary";
export const LAB_STAGES: readonly LabStage[] = ["to_receive", "to_result", "preliminary"];

export type RowAction = "receive" | "enter" | "continue";
const ACTION: Record<LabStage, { action: RowAction; needs: LabPermission }> = {
  to_receive: { action: "receive", needs: "lab.receive" },
  to_result: { action: "enter", needs: "lab.result.enter" },
  preliminary: { action: "continue", needs: "lab.result.release" },
};

/** One open order the lab holds (LW-1: a panel is one order, one row). */
export interface WorklistInput {
  orderId: string;
  hospitalId: string;
  patientUserId: string;
  testId: string | null;
  test: string;
  priority: string | null;
  stage: LabStage;
  specimenId: string | null;
  reportId: string | null;
  collectedAt: Date;
  receivedAt: Date | null;
  from: { id: string; name: string } | null;
  /** LW-3 sources: the facility offering's section, else the catalogue's. */
  offeringSectionId: string | null;
  catalogueSectionId: string | null;
  /** D-LAB0-07 sources: the hub's stated text, else the catalogue's minutes. */
  statedTat: string | null;
  catalogueTargetMinutes: number | null;
}

export interface WorklistRow extends WorklistInput {
  sectionId: string | null;
  target: Target | null;
  clock: Clock;
  action: RowAction | null;
}

export type SectionKey = "all" | "mine" | "none" | string;
export type StageKey = "all" | LabStage;
export type SortKey = "default" | "test" | "from" | "stage" | "waiting";
export const SORT_KEYS: readonly SortKey[] = ["default", "test", "from", "stage", "waiting"];

export interface WorklistFilters {
  section?: SectionKey | null;
  stage?: StageKey | null;
  dept?: string | null;
  sort?: SortKey | null;
}

export interface Viewer {
  hospitalId: string;
  permissions: ReadonlySet<LabPermission>;
  sectionIds: readonly string[];
}

export interface SectionTab {
  key: SectionKey;
  name: string | null;
  count: number;
}

export interface Worklist {
  rows: WorklistRow[];
  section: SectionKey;
  stage: StageKey;
  dept: string | null;
  sort: SortKey;
  sectionTabs: SectionTab[];
  stageCounts: Record<StageKey, number>;
  depts: { id: string; name: string }[];
  /** Every open item (the "All sections" count). */
  total: number;
  /** Open items outside the chosen section, for the "nothing in my section" line. */
  elsewhere: number;
  /** The viewer has no lab section, so the list opens on all of them (LW-4). */
  noSectionAssigned: boolean;
}

const PRIORITY_RANK: Record<string, number> = { emergency: 0, immediate: 0, urgent: 1, routine: 2 };
const rank = (p: string | null) => PRIORITY_RANK[p ?? "routine"] ?? 2;

export function defaultSection(viewer: Pick<Viewer, "sectionIds">): SectionKey {
  if (viewer.sectionIds.length === 1) return viewer.sectionIds[0]!;
  if (viewer.sectionIds.length > 1) return "mine";
  return "all";
}

export function inSection(row: Pick<WorklistRow, "sectionId">, key: SectionKey, viewer: Viewer) {
  if (key === "all") return true;
  if (key === "none") return row.sectionId === null;
  if (key === "mine") return row.sectionId !== null && viewer.sectionIds.includes(row.sectionId);
  return row.sectionId === key;
}

/** LW-7: priority; then late (largest overrun), received (longest), not received (longest). */
function defaultOrder(a: WorklistRow, b: WorklistRow): number {
  const p = rank(a.priority) - rank(b.priority);
  if (p !== 0) return p;
  const band = (r: WorklistRow) =>
    r.clock.kind === "not_received" ? 2 : r.clock.lateBy !== null ? 0 : 1;
  const ba = band(a);
  const bb = band(b);
  if (ba !== bb) return ba - bb;
  const weight = (r: WorklistRow) =>
    r.clock.kind === "not_received" ? r.clock.sinceCollection : (r.clock.lateBy ?? r.clock.elapsed);
  return weight(b) - weight(a);
}

const waitingMinutes = (r: WorklistRow) =>
  r.clock.kind === "not_received" ? r.clock.sinceCollection : r.clock.elapsed;

const SORTS: Record<SortKey, (a: WorklistRow, b: WorklistRow) => number> = {
  default: defaultOrder,
  test: (a, b) => a.test.localeCompare(b.test),
  from: (a, b) => (a.from?.name ?? "￿").localeCompare(b.from?.name ?? "￿"),
  stage: (a, b) => LAB_STAGES.indexOf(a.stage) - LAB_STAGES.indexOf(b.stage),
  waiting: (a, b) => waitingMinutes(b) - waitingMinutes(a),
};

export function computeWorklist(input: {
  rows: readonly WorklistInput[];
  sections: readonly { id: string; name: string }[];
  viewer: Viewer;
  filters: WorklistFilters;
  serverNow: Date;
}): Worklist {
  const { viewer, filters, serverNow } = input;
  // LW-9: another hospital's rows never appear, whatever the loader returned.
  const all: WorklistRow[] = input.rows
    .filter((r) => r.hospitalId === viewer.hospitalId)
    .map((r) => {
      const sectionId = r.offeringSectionId ?? r.catalogueSectionId ?? null;
      const target = targetFor(r.statedTat, r.catalogueTargetMinutes);
      const step = ACTION[r.stage];
      return {
        ...r,
        sectionId,
        target,
        clock: clockFor(
          { collectedAt: r.collectedAt, receivedAt: r.receivedAt },
          target,
          serverNow,
        ),
        action: viewer.permissions.has(step.needs) ? step.action : null,
      };
    });

  // Section tabs: counts over every open item, so they always add up to "All sections" (LW-6).
  const known = new Map(input.sections.map((s) => [s.id, s.name]));
  const bySection = new Map<string | null, number>();
  for (const r of all) bySection.set(r.sectionId, (bySection.get(r.sectionId) ?? 0) + 1);
  const mine = viewer.sectionIds;
  const tabs: SectionTab[] = [];
  if (mine.length === 1)
    tabs.push({
      key: mine[0]!,
      name: known.get(mine[0]!) ?? null,
      count: bySection.get(mine[0]!) ?? 0,
    });
  if (mine.length > 1)
    tabs.push({
      key: "mine",
      name: null,
      count: mine.reduce((n, id) => n + (bySection.get(id) ?? 0), 0),
    });
  tabs.push({ key: "all", name: null, count: all.length });
  const others = [...bySection.entries()]
    .filter((e): e is [string, number] => e[0] !== null && !mine.includes(e[0]))
    .map(([id, count]) => ({ key: id, name: known.get(id) ?? null, count }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  tabs.push(...others);
  if (bySection.has(null)) tabs.push({ key: "none", name: null, count: bySection.get(null)! });

  const keys = new Set(tabs.map((t) => t.key));
  const fallback = defaultSection(viewer);
  const section = filters.section && keys.has(filters.section) ? filters.section : fallback;
  const sectionRows = all.filter((r) => inSection(r, section, viewer));

  const depts = [
    ...new Map(all.filter((r) => r.from).map((r) => [r.from!.id, r.from!])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const dept = filters.dept && depts.some((d) => d.id === filters.dept) ? filters.dept : null;
  const deptRows = dept ? sectionRows.filter((r) => r.from?.id === dept) : sectionRows;

  // Stage counts respect the section (and the ward filter), not the stage filter (LW-6).
  const stageCounts: Record<StageKey, number> = {
    all: deptRows.length,
    to_receive: 0,
    to_result: 0,
    preliminary: 0,
  };
  for (const r of deptRows) stageCounts[r.stage] += 1;
  const stage: StageKey =
    filters.stage && (filters.stage === "all" || LAB_STAGES.includes(filters.stage))
      ? filters.stage
      : "all";
  const sort: SortKey = filters.sort && SORT_KEYS.includes(filters.sort) ? filters.sort : "default";
  const rows = (stage === "all" ? deptRows : deptRows.filter((r) => r.stage === stage))
    .map((r, i) => [r, i] as const)
    // Stable: ties keep the loader's order (oldest first).
    .sort(([a, ia], [b, ib]) => SORTS[sort](a, b) || ia - ib)
    .map(([r]) => r);

  return {
    rows,
    section,
    stage,
    dept,
    sort,
    sectionTabs: tabs,
    stageCounts,
    depts,
    total: all.length,
    elsewhere: all.length - sectionRows.length,
    noSectionAssigned: mine.length === 0,
  };
}
