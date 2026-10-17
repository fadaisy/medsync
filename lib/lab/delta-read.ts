import "server-only";

import type { DeltaOutcome, DeltaRule, Pair } from "./delta";
import type { EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/exchange/store";
import { loadConfigs } from "./catalogue-v2";
import { monthlyReview, trialRule } from "./delta";

/**
 * Delta checks, read (Lab Phase 5 §5.6, §5.7; DL-5, DL-8, DL-9). Flags on an order with the previous result and the
 * context between the two (procedures recorded), the rule list with each rule's last-30-day review, and the trial
 * on past released pairs, which reads and writes nothing.
 */

export interface FlagRow {
  id: string;
  kind: "delta" | "panel" | "pattern";
  conceptId: string | null;
  ruleKey: string;
  ruleVersion: number;
  previousValue: string | null;
  currentValue: string | null;
  unit: string | null;
  changeAbs: string | null;
  changePct: string | null;
  intervalHours: string | null;
  previousReportId: string | null;
  previousAt: string | null;
  meaning: string;
  outcome: { outcome: DeltaOutcome; note: string; withWhom: string | null; decidedAt: Date } | null;
  /** DL-5: procedures recorded between the two results (shown, never used to suppress). */
  context: { code: string; at: Date }[];
}

export async function flagsForOrder(
  tx: EmrTx,
  hospitalId: string,
  orderId: string,
): Promise<FlagRow[]> {
  const rows = rowsOf<
    FlagRow & {
      outcomeKind: DeltaOutcome | null;
      note: string | null;
      withWhom: string | null;
      decidedAt: Date | null;
      detail: Record<string, string>;
    }
  >(
    await tx.execute(sql`SELECT f.id, f.kind, f.concept_id AS "conceptId", f.rule_key AS "ruleKey",
        f.rule_version AS "ruleVersion", f.previous_value AS "previousValue", f.current_value AS "currentValue",
        f.unit, f.change_abs AS "changeAbs", f.change_pct AS "changePct", f.interval_hours AS "intervalHours",
        f.previous_report_id AS "previousReportId", f.detail,
        o.outcome AS "outcomeKind", o.note, o.with_whom AS "withWhom", o.decided_at AS "decidedAt"
      FROM delta_flags f LEFT JOIN delta_outcomes o ON o.flag_id = f.id
     WHERE f.hospital_id = ${hospitalId} AND f.order_id = ${orderId}
     ORDER BY f.created_at`),
  );
  const out: FlagRow[] = [];
  for (const r of rows) {
    const previousAt = r.detail?.previousAt ?? null;
    const context =
      previousAt && r.kind === "delta"
        ? rowsOf<{ code: string; at: Date }>(
            await tx.execute(sql`SELECT coalesce(p.concept_id, 'procedure') AS code, p.effective_at AS at FROM procedures p
              JOIN encounter_orders eo ON eo.id = ${orderId}
             WHERE p.patient_user_id = eo.patient_user_id
               AND p.effective_at BETWEEN ${previousAt}::timestamptz AND now()
             ORDER BY p.effective_at`),
          )
        : [];
    out.push({
      ...r,
      previousAt,
      meaning: r.detail?.meaning ?? "",
      outcome: r.outcomeKind
        ? { outcome: r.outcomeKind, note: r.note!, withWhom: r.withWhom, decidedAt: r.decidedAt! }
        : null,
      context,
    });
  }
  return out;
}

/** §5.7: every delta rule with its status and the last 30 days' review (DL-9). */
export async function deltaRulesWithReview(tx: EmrTx, hospitalId: string, now: Date) {
  const configs = (await loadConfigs(tx, hospitalId)).filter(
    (c) =>
      c.hospitalId === hospitalId &&
      ["delta_rule", "panel_rule", "pattern_rule"].includes(c.kind) &&
      c.status !== "superseded",
  );
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const stats = rowsOf<{ key: string; flags: number; outcome: DeltaOutcome | null }>(
    await tx.execute(sql`SELECT f.rule_key AS key, count(*)::int AS flags, o.outcome
      FROM delta_flags f LEFT JOIN delta_outcomes o ON o.flag_id = f.id
     WHERE f.hospital_id = ${hospitalId} AND f.created_at >= ${since}::timestamptz
     GROUP BY f.rule_key, o.outcome`),
  );
  // The denominator: released results of the rule's concept in the window (each one was evaluated).
  const evaluated = rowsOf<{ concept: string; n: number }>(
    await tx.execute(sql`SELECT o.concept_id AS concept, count(*)::int AS n
      FROM lab_result_snapshots s JOIN clinical_observations o ON o.id = s.observation_id
      JOIN diagnostic_reports r ON r.id = s.report_id
     WHERE s.hospital_id = ${hospitalId} AND r.status IN ('final','amended','corrected')
       AND s.created_at >= ${since}::timestamptz
     GROUP BY o.concept_id`),
  );
  return configs.map((c) => {
    const mine = stats.filter((s) => s.key === c.key);
    const outcomes = mine.flatMap((s) =>
      s.outcome ? Array<DeltaOutcome>(s.flags).fill(s.outcome) : [],
    );
    const concept = (c.payload as { concept?: string }).concept;
    const n = concept ? (evaluated.find((e) => e.concept === concept)?.n ?? 0) : 0;
    return {
      id: c.id,
      kind: c.kind,
      key: c.key,
      version: c.version,
      status: c.status,
      payload: c.payload,
      flags: mine.reduce((t, s) => t + s.flags, 0),
      review: monthlyReview(n, outcomes),
    };
  });
}

/** DL-8, S10: pairs of released results of the rule's concept in the last 90 days; writes nothing. */
export async function trialOnHistory(tx: EmrTx, hospitalId: string, rule: DeltaRule, now: Date) {
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const rows = rowsOf<{
    patient: string;
    value: string;
    unit: string;
    at: Date;
    specimen: string | null;
    mislabel: boolean;
  }>(
    await tx.execute(sql`SELECT s.patient_user_id AS patient, s.value_decimal AS value, s.unit_ucum AS unit,
        r.effective_at AS at, r.specimen_id AS specimen,
        EXISTS (SELECT 1 FROM specimen_events e WHERE e.specimen_id = r.specimen_id AND e.kind = 'rejected'
                  AND e.reason_code IN ('unlabelled_or_mislabelled','possible_wrong_sample'))
        OR EXISTS (SELECT 1 FROM lab_nonconformities n WHERE n.source = 'delta' AND n.source_ref = r.id::text) AS mislabel
      FROM lab_result_snapshots s JOIN clinical_observations o ON o.id = s.observation_id
      JOIN diagnostic_reports r ON r.id = s.report_id
     WHERE s.hospital_id = ${hospitalId} AND o.concept_id = ${rule.concept}
       AND r.status IN ('final','amended','corrected') AND r.effective_at >= ${since}::timestamptz
     ORDER BY s.patient_user_id, r.effective_at`),
  );
  const pairs: Pair[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    if (a.patient !== b.patient || a.unit !== b.unit) continue;
    pairs.push({
      previous: Number(a.value),
      current: Number(b.value),
      intervalHours: (new Date(b.at).getTime() - new Date(a.at).getTime()) / 3_600_000,
      knownMislabel: b.mislabel,
    });
  }
  return trialRule(rule, pairs);
}
