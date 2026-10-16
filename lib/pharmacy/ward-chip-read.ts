import "server-only";

import type { EmrDb, EmrScope } from "@/lib/emr/db";
import type { StoredAnswer } from "@/lib/pharmacy/checks";
import type { LaneLine } from "@/lib/pharmacy/lanes";
import type { WardChip } from "@/lib/pharmacy/ward-chip";
import { sql } from "drizzle-orm";

import { asClinicalReader } from "@/lib/emr/db";
import { laneFor } from "@/lib/pharmacy/lanes";
import { loadHospitalContext } from "@/lib/pharmacy/review/load";

/**
 * The ward chips for the MAR's rows (D-PH1-33, PA2-5). The review state comes ONLY through 0125's
 * `pharmacy_line_review_state` (and 0133's reviewed time), one statement for every row, as the nurse
 * under RLS. A line not yet reviewed is told apart as standard lane from the prescription's own stored
 * facts and the hospital's signed lane rule (LN-1..LN-3), as the review queue does.
 */
interface Row {
  id: string;
  placement_id: string | null;
  rx_state: string;
  controlled: boolean;
  regimen_id: string | null;
  edits: unknown[] | null;
  condition_id: string | null;
  kind: string | null;
  drug_id: string;
  check_answers: StoredAnswer[] | null;
  confirmed_flags: string[] | null;
  review: "queried" | "reviewed" | "not_reviewed" | null;
  reviewed_at: string | Date | null;
}

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []);

export async function loadWardChips(
  scope: EmrScope,
  prescriptionIds: readonly string[],
  database?: EmrDb,
): Promise<Map<string, WardChip>> {
  const out = new Map<string, WardChip>();
  if (!prescriptionIds.length) return out;
  const ids = sql.join(
    prescriptionIds.map((i) => sql`${i}::uuid`),
    sql`, `,
  );
  const rows = await asClinicalReader(
    scope,
    async (tx) =>
      rowsOf<Row>(
        await tx.execute(sql`
          SELECT p.id, p.placement_id, p.state AS rx_state, p.controlled, p.regimen_id, p.edits, p.condition_id,
                 p.kind, p.drug_id, p.check_answers, p.confirmed_flags,
                 public.pharmacy_line_review_state(p.id) AS review,
                 public.pharmacy_line_reviewed_at(p.id) AS reviewed_at
            FROM public.prescriptions p
           WHERE p.id IN (${ids})
              OR p.placement_id IN (SELECT q.placement_id FROM public.prescriptions q WHERE q.id IN (${ids}))`),
      ),
    database,
  );
  const asked = rows.filter((r) => prescriptionIds.includes(r.id) && r.review);
  if (!asked.length) return out;

  // Lane only matters for a line not yet reviewed (LN-7 snapshots it at the first review).
  const ctx = asked.some((r) => r.review === "not_reviewed")
    ? await loadHospitalContext(
        database ?? ((await import("@/db")).db as unknown as EmrDb),
        scope.hospitalId,
      )
    : null;
  const line = (r: Row): LaneLine => ({
    id: r.id,
    controlled: r.controlled,
    regimenId: r.regimen_id,
    edits: r.edits ?? [],
    conditionId: r.condition_id,
    kind: r.kind === "fluid" ? "fluid" : "drug",
    drugId: r.drug_id,
    checkAnswers: r.check_answers ?? [],
    confirmedFlags: r.confirmed_flags ?? [],
  });
  for (const r of asked) {
    if (r.review === "reviewed") {
      out.set(r.id, {
        kind: "reviewed",
        at: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      });
      continue;
    }
    if (r.review === "queried") {
      out.set(r.id, { kind: "queried", at: null });
      continue;
    }
    // ponytail: the placement's active lines stand in for the review queue's H4 grouping (replacements).
    const group = rows.filter(
      (x) =>
        (x.id === r.id || (r.placement_id !== null && x.placement_id === r.placement_id)) &&
        (x.id === r.id || x.rx_state === "active"),
    );
    const lane = ctx ? laneFor(group.map(line), ctx.rule, ctx.highRisk).lane : "pharmacist_first";
    out.set(r.id, { kind: lane === "standard" ? "standard" : "not_reviewed", at: null });
  }
  return out;
}
