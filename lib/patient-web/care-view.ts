import type { Judgement, WeekSeries } from "@patient-core/care-trends";
import type { MedRow } from "@patient-core/medicines";
import { instructionsWithoutDose, nameWithoutDose } from "@patient-core/care-no-dose";
import { whenWords } from "@patient-core/medicines";

/**
 * Care's small pure views (no server, no React), so the page rules have tests: the no-dose pass over a row
 * (S15), "My medicines" and its Pause / Resume (S17), and the chart's stated finding (S16).
 */

/** A medicine row with every amount taken out of its name and instructions (S15). */
export function withoutDose(m: MedRow): MedRow {
  return {
    ...m,
    dose: null,
    name: nameWithoutDose(m.name),
    instructions: instructionsWithoutDose(m.instructions),
  };
}

export interface MyMedicine {
  id: string;
  name: string;
  /** "Morning and evening", "When you need it", "No times set". */
  when: string;
  instructions: string | null;
  state: "active" | "paused";
}

/** The phone's "My medicines": active and paused only; a stopped one has left the list (S17). */
export function myMedicines(
  meds: MedRow[],
  covered: ReadonlySet<string> = new Set(),
): MyMedicine[] {
  return meds.flatMap((m) =>
    (m.state === "active" || m.state === "paused") && !covered.has(m.id)
      ? [
          {
            id: m.id,
            name: m.name,
            when: whenWords(m),
            instructions: m.instructions,
            state: m.state,
          },
        ]
      : [],
  );
}

/** Pause ↔ Resume: the state a tap writes. */
export const flipState = (s: MyMedicine["state"]): MyMedicine["state"] =>
  s === "paused" ? "active" : "paused";

/**
 * The finding a week chart states in words (S16): how many readings, and how many the thresholds put outside
 * the target. `null` outside means the reading has no target (weight).
 */
export function chartFinding(
  series: WeekSeries,
  judged: (Judgement | null)[],
  hasTarget: boolean,
): { n: number; outside: number | null } {
  const n = series.a.filter((v) => v !== null).length;
  if (!hasTarget) return { n, outside: null };
  return {
    n,
    outside: judged.filter((j) => j !== null && (j.tone === "caution" || j.tone === "critical"))
      .length,
  };
}
