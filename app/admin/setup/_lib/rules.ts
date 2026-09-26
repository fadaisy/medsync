/*
 * Setup checklist rules (§5.10) — pure, so tests/onboarding-v2/setup.test.ts can hold them.
 * No DB, no React: the page derives state from rows, the actions write rows.
 */

/** What every checklist action returns to its form. */
export type StepState = { ok?: true; error?: string; link?: string };

/*
 * Departments, where you'll start, and wards are edited in Departments & services now (ADR 0150);
 * the department diff that deleted unticked rows is gone — the hub archives, never deletes.
 */

/* ─── Needed to go live (D17) ───────────────────────────────────────── */

export interface NeededFacts {
  departments: number;
  /** A start department is chosen among the confirmed ones (or can't be stored: no application). */
  startChosen: boolean;
  backup: boolean;
  wards: number;
}

export function neededTasks(f: NeededFacts) {
  return {
    departments: f.departments > 0 && f.startChosen,
    backup: f.backup,
    wards: f.wards > 0,
  };
}

export const countDone = (tasks: Record<string, boolean>) =>
  Object.values(tasks).filter(Boolean).length;

/* ─── Facility location ─────────────────────────────────────────────── */

export const MAX_FACILITY_ACCURACY_M = 200;

/**
 * A device point is kept only when it is precise (≤ 200 m) and inside the facility's district.
 * `resolvedDistrict` is lib/geo's resolvePoint(...).place.district.code (null when it found none).
 */
export function facilityPointVerdict(
  accuracyM: number,
  resolvedDistrict: string | null,
  facilityDistrict: string | null,
): "ok" | "imprecise" | "outside" {
  if (!(accuracyM >= 0 && accuracyM <= MAX_FACILITY_ACCURACY_M)) return "imprecise";
  if (!resolvedDistrict || !facilityDistrict || resolvedDistrict !== facilityDistrict) {
    return "outside";
  }
  return "ok";
}
