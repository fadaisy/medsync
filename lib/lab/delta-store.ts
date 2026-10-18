import "server-only";

import type { DeltaOutcome, DeltaRule, PanelRule, PatternRule, PriorResult } from "./delta";
import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import { and, eq, inArray, sql } from "drizzle-orm";

import { deltaFlags, deltaOutcomes } from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rejectSpecimen } from "@/lib/emr/write/specimens";
import { rowsOf } from "@/lib/exchange/store";
import { loadConfigs } from "./catalogue-v2";
import { applies, evaluate, panelFires, patternFires, previousResult, undecided } from "./delta";
import { openAutomaticNc } from "./nc-store";

/**
 * Delta checks on the database (Lab Phase 5 Step 4; DL-2..DL-9, DL-12, DL-13). Evaluated on every laboratory report
 * version against the patient's released results; a fired rule is a flag that keeps both values, the rule version
 * and the change. Release of an in-house result waits for a decision on every live flag (DL-6, soft stop). Only
 * signed rules run (DL-1, S9).
 */

type Signed<T> = { configId: string; key: string; version: number; rule: T };
export async function signedDeltaRules(tx: EmrTx, hospitalId: string, now: Date) {
  const configs = (await loadConfigs(tx, hospitalId)).filter(
    (c) =>
      c.hospitalId === hospitalId &&
      c.status === "signed" &&
      c.inForceFrom !== null &&
      c.inForceFrom <= now,
  );
  const of = <T>(kind: string) =>
    configs
      .filter((c) => c.kind === kind)
      .map((c) => ({ configId: c.id, key: c.key, version: c.version, rule: c.payload as T }));
  return {
    delta: of<DeltaRule>("delta_rule"),
    panel: of<PanelRule>("panel_rule"),
    pattern: of<PatternRule>("pattern_rule"),
  };
}

interface Current {
  concept: string;
  value: number;
  unit: string;
  methodCode: string | null;
}
/** The report version's numeric components, in this hospital's unit (its snapshots, Law 8). */
async function currentValues(tx: EmrTx, reportId: string): Promise<Current[]> {
  return rowsOf<{ concept: string; value: string; unit: string; method: string | null }>(
    await tx.execute(sql`SELECT o.concept_id AS concept, s.value_decimal AS value, s.unit_ucum AS unit,
        m.method_code AS method
      FROM lab_result_snapshots s JOIN clinical_observations o ON o.id = s.observation_id
      LEFT JOIN lab_component_measures m ON m.id = s.measure_id
     WHERE s.report_id = ${reportId}`),
  ).map((r) => ({
    concept: r.concept,
    value: Number(r.value),
    unit: r.unit,
    methodCode: r.method,
  }));
}

/** DL-2: the patient's released, current results of these concepts before `at`, in the same unit. */
async function history(
  tx: EmrTx,
  patientUserId: string,
  logicalId: string,
  concepts: string[],
  at: Date,
) {
  if (!concepts.length) return new Map<string, PriorResult[]>();
  const rows = rowsOf<{
    concept: string;
    report: string;
    value: string;
    unit: string;
    at: Date;
    method: string | null;
  }>(
    await tx.execute(sql`SELECT o.concept_id AS concept, r.id AS report, s.value_decimal AS value, s.unit_ucum AS unit,
        r.effective_at AS at, m.method_code AS method
      FROM lab_result_snapshots s
      JOIN clinical_observations o ON o.id = s.observation_id
      JOIN diagnostic_reports r ON r.id = s.report_id
      LEFT JOIN lab_component_measures m ON m.id = s.measure_id
     WHERE s.patient_user_id = ${patientUserId} AND r.logical_id <> ${logicalId}
       AND r.status IN ('final','amended','corrected')
       AND NOT EXISTS (SELECT 1 FROM diagnostic_reports n WHERE n.supersedes_id = r.id)
       AND o.concept_id IN (${sql.join(
         concepts.map((c) => sql`${c}`),
         sql`, `,
       )})
       AND r.effective_at < ${at.toISOString()}::timestamptz`),
  );
  const m = new Map<string, (PriorResult & { unit: string })[]>();
  for (const r of rows)
    m.set(r.concept, [
      ...(m.get(r.concept) ?? []),
      {
        reportId: r.report,
        value: Number(r.value),
        at: new Date(r.at),
        methodCode: r.method,
        amendedAway: false,
        unit: r.unit,
      },
    ]);
  return m;
}

/**
 * Evaluate a laboratory report version. A flag is written once per rule, component and value along the version
 * chain: a release that carries the same value keeps the earlier decision. Returns the live undecided flag ids.
 */
export async function evaluateDeltas(
  tx: EmrTx,
  r: {
    hospitalId: string;
    patientUserId: string;
    orderId: string;
    reportId: string;
    logicalId: string;
    testCode: string | null;
    specimenType: string | null;
    at: Date;
    now: Date;
  },
): Promise<string[]> {
  // The rules in force when the result is written; the history is what came before the specimen.
  const rules = await signedDeltaRules(tx, r.hospitalId, r.now);
  if (!rules.delta.length && !rules.panel.length && !rules.pattern.length) return [];
  const [dob] = rowsOf<{ years: number | null }>(
    await tx.execute(sql`SELECT extract(year FROM age(${r.at.toISOString()}::timestamptz, date_of_birth))::int AS years
      FROM patient_profiles WHERE id = ${r.patientUserId}`),
  );
  const ageYears = dob?.years ?? null;
  const now = await currentValues(tx, r.reportId);
  const hist = await history(
    tx,
    r.patientUserId,
    r.logicalId,
    now.map((c) => c.concept),
    r.at,
  );
  const existing = await tx
    .select({
      ruleKey: deltaFlags.ruleKey,
      conceptId: deltaFlags.conceptId,
      currentValue: deltaFlags.currentValue,
    })
    .from(deltaFlags)
    .where(eq(deltaFlags.reportLogicalId, r.logicalId));
  const seen = (key: string, concept: string | null, value: number | null) =>
    existing.some(
      (e) =>
        e.ruleKey === key &&
        e.conceptId === concept &&
        (value === null || Number(e.currentValue) === value),
    );
  const failed: string[] = [];
  const insert = async (row: typeof deltaFlags.$inferInsert) => {
    await tx.insert(deltaFlags).values(row).onConflictDoNothing();
  };
  for (const s of rules.delta as Signed<DeltaRule>[]) {
    const c = now.find((x) => x.concept === s.rule.concept);
    if (
      !c ||
      !(ageYears === null
        ? s.rule.applicability.ageFromYears === null && s.rule.applicability.ageToYears === null
        : applies(s.rule, { ageYears, specimen: r.specimenType }))
    )
      continue;
    const prior = (hist.get(c.concept) ?? []).filter(
      (h) => (h as PriorResult & { unit: string }).unit === c.unit,
    );
    const prev = previousResult(prior, { at: r.at, methodCode: c.methodCode }, s.rule);
    if (prev.kind !== "compare") continue;
    const hours = (r.at.getTime() - prev.prior.at.getTime()) / 3_600_000;
    const e = evaluate(s.rule, prev.prior.value, c.value, hours);
    if (!e.fired) continue;
    failed.push(c.concept);
    if (seen(s.key, c.concept, c.value)) continue;
    await insert({
      hospitalId: r.hospitalId,
      patientUserId: r.patientUserId,
      orderId: r.orderId,
      reportLogicalId: r.logicalId,
      reportId: r.reportId,
      kind: "delta",
      conceptId: c.concept,
      ruleConfigId: s.configId,
      ruleKey: s.key,
      ruleVersion: s.version,
      previousReportId: prev.prior.reportId,
      previousValue: String(prev.prior.value),
      currentValue: String(c.value),
      unit: c.unit,
      changeAbs: String(e.changeAbs),
      changePct: e.changePct === null ? null : String(e.changePct),
      intervalHours: String(hours),
      detail: {
        direction: e.direction,
        meaning: s.rule.meaning,
        previousAt: prev.prior.at.toISOString(),
      },
    });
  }
  for (const s of rules.panel as Signed<PanelRule>[]) {
    if (s.rule.testCode !== r.testCode || !panelFires(s.rule, failed) || seen(s.key, null, null))
      continue;
    await insert({
      hospitalId: r.hospitalId,
      patientUserId: r.patientUserId,
      orderId: r.orderId,
      reportLogicalId: r.logicalId,
      reportId: r.reportId,
      kind: "panel",
      conceptId: null,
      ruleConfigId: s.configId,
      ruleKey: s.key,
      ruleVersion: s.version,
      detail: { failed, meaning: s.rule.meaning },
    });
  }
  const values = Object.fromEntries(
    now.map((c) => [
      c.concept,
      {
        now: c.value,
        previous:
          hist.get(c.concept)?.sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.value ?? null,
      },
    ]),
  );
  for (const s of rules.pattern as Signed<PatternRule>[]) {
    if (!patternFires(s.rule, values) || seen(s.key, null, null)) continue;
    await insert({
      hospitalId: r.hospitalId,
      patientUserId: r.patientUserId,
      orderId: r.orderId,
      reportLogicalId: r.logicalId,
      reportId: r.reportId,
      kind: "pattern",
      conceptId: null,
      ruleConfigId: s.configId,
      ruleKey: s.key,
      ruleVersion: s.version,
      detail: { name: s.rule.name, meaning: s.rule.meaning },
    });
  }
  return liveUndecided(tx, r.logicalId, now);
}

/** Live flags: a delta flag whose value is still the current one, and every panel or pattern flag; minus decided. */
async function liveUndecided(tx: EmrTx, logicalId: string, now: Current[]): Promise<string[]> {
  const flags = await tx.select().from(deltaFlags).where(eq(deltaFlags.reportLogicalId, logicalId));
  const live = flags.filter(
    (f) =>
      f.kind !== "delta" ||
      now.some((c) => c.concept === f.conceptId && c.value === Number(f.currentValue)),
  );
  if (!live.length) return [];
  const decided = await tx
    .select({ flagId: deltaOutcomes.flagId })
    .from(deltaOutcomes)
    .where(
      inArray(
        deltaOutcomes.flagId,
        live.map((f) => f.id),
      ),
    );
  return undecided(
    live.map((f) => f.id),
    decided.map((d) => d.flagId),
  );
}

export const DELTA_DECISION_NEEDED =
  "delta_decision: each delta check needs a decision before release.";

/** DL-6, DL-7: record the technologist's decision; recollect rejects the specimen, a confirmed mislabel opens an NC. */
export async function recordDeltaOutcome(
  ctx: WriteCtx,
  i: {
    flagId: string;
    outcome: DeltaOutcome;
    withWhom: string | null;
    note: string;
    clientKey: string;
  },
): Promise<string> {
  const { tx, actor, now } = ctx;
  const [f] = await tx
    .select()
    .from(deltaFlags)
    .where(and(eq(deltaFlags.id, i.flagId), eq(deltaFlags.hospitalId, actor.hospitalId)));
  if (!f) throw new EmrWriteError("not_found", "That delta check was not found.");
  if (i.outcome === "confirmed_same_patient" && !i.withWhom)
    throw new EmrWriteError("invalid", "Say with whom you confirmed the sample.");
  let nonconformityId: string | null = null;
  if (i.outcome === "mislabel_confirmed") {
    const nc = await openAutomaticNc(
      tx,
      actor.hospitalId,
      {
        source: "delta",
        sourceRef: f.reportId,
        deviceId: null,
        conceptId: f.conceptId,
        title: "Wrong sample confirmed by a delta check",
        whatHappened: `Delta check ${f.ruleKey} v${f.ruleVersion}: mislabel confirmed. ${i.note}`,
      },
      now,
    );
    nonconformityId = nc.id;
  }
  if (i.outcome === "recollect") {
    const [s] = rowsOf<{ specimen: string | null }>(
      await tx.execute(
        sql`SELECT specimen_id AS specimen FROM diagnostic_reports WHERE id = ${f.reportId}`,
      ),
    );
    if (s?.specimen)
      await rejectSpecimen(ctx, {
        patientUserId: f.patientUserId,
        specimenId: s.specimen,
        reasonCode: "possible_wrong_sample",
        clientKey: `${i.clientKey}:reject`,
      });
  }
  const [o] = await tx
    .insert(deltaOutcomes)
    .values({
      hospitalId: actor.hospitalId,
      flagId: f.id,
      outcome: i.outcome,
      withWhom: i.withWhom,
      note: i.note,
      nonconformityId,
      decidedBy: actor.userId,
      decidedAt: now,
      clientKey: i.clientKey,
    })
    .onConflictDoNothing()
    .returning({ id: deltaOutcomes.id });
  if (!o) throw new EmrWriteError("conflict", "This delta check already has a decision.");
  return o.id;
}
