import type { LoadProgress } from "@/lib/ncdreg/demo/service";

/** Whole percent of the load's steps done; a fresh load (no progress yet) reads 0. */
export function loadPercent(p: Partial<LoadProgress> | undefined): number {
  if (!p?.total) return 0;
  return Math.min(100, Math.floor((100 * (p.next ?? 0)) / p.total));
}

/** "11 of 26 demo patients written": the data-quality step is not a patient. */
export function patientsLine(p: Partial<LoadProgress> | undefined): string {
  const scenario = p?.scenario ?? 0;
  const patients = scenario + (p?.cohort ?? 0);
  if (!patients) return "starting";
  const next = p?.next ?? 0;
  const written = next <= scenario ? next : next - 1;
  return `${Math.min(written, patients).toLocaleString("en-GB")} of ${patients.toLocaleString("en-GB")} demo patients written`;
}
