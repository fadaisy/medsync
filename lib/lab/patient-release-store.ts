import "server-only";

import type { MinorsRule, PatientRelease, Reason, ResultSnapshot } from "./patient-release";
import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  clinicianNotesToPatient,
  patientHoldEvents,
  patientToldEvents,
  resultAcknowledgements,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { currentReport, requireResponsible } from "@/lib/emr/write/results";
import { encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";
import { loadConfigs } from "./catalogue-v2";
import { holdErrors, visibleToPatient } from "./patient-release";

/**
 * Patient release on the database (Lab Phase 5 Step 6; PR-2, PR-4, PR-7, PR-13, PR-16). The clinician's side: what
 * the patient sees for each result and why, the told event for a critical, holds with a reason and an until-date, a
 * note to the patient, and aged results. The patient side (Step 7) reads the same snapshot through the same gate.
 */

export interface ReleaseContext {
  rules: PatientRelease | null;
  minors: MinorsRule | null;
  floorAdditions: string[];
}
/** The hospital's signed release table, minors rule and floor additions in force now. */
export async function releaseContext(
  tx: EmrTx,
  hospitalId: string,
  now: Date,
): Promise<ReleaseContext> {
  const signed = (await loadConfigs(tx, hospitalId)).filter(
    (c) =>
      c.hospitalId === hospitalId &&
      c.status === "signed" &&
      c.inForceFrom !== null &&
      c.inForceFrom <= now,
  );
  const latest = (kind: string) =>
    signed.filter((c) => c.kind === kind).sort((a, b) => b.version - a.version)[0];
  return {
    rules: (latest("patient_release")?.payload as PatientRelease | undefined) ?? null,
    minors: (latest("minors_rule")?.payload as MinorsRule | undefined) ?? null,
    floorAdditions: signed
      .filter((c) => c.kind === "patient_floor_additions")
      .flatMap((c) => (c.payload as { testCodes: string[] }).testCodes),
  };
}

export interface ResultFacts {
  reportId: string;
  logicalId: string;
  patientUserId: string;
  snapshot: ResultSnapshot;
  patientAge: number;
  consent: boolean;
  seenAt: Date | null;
  hold: { reason: string; untilOn: string | null } | null;
  releasedOn: string | null;
}
/** The snapshot every decision reads (PR-1), for a set of current report versions at a hospital. */
export async function resultFacts(
  tx: EmrTx,
  hospitalId: string,
  reportIds: readonly string[],
): Promise<ResultFacts[]> {
  if (!reportIds.length) return [];
  const list = sql.join(
    reportIds.map((r) => sql`${r}::uuid`),
    sql`, `,
  );
  const rows = rowsOf<{
    id: string;
    logical: string;
    patient: string;
    status: string;
    critical: boolean;
    code: string;
    restricted: string | null;
    group: string | null;
    current: boolean;
    reviewed: boolean;
    told: boolean;
    hold_kind: string | null;
    hold_until: string | null;
    hold_reason: string | null;
    referred: boolean;
    bedside: boolean;
    earlier_seen: boolean;
    age: number | null;
    consent: boolean;
    seen: Date | null;
    released: string | null;
  }>(
    await tx.execute(sql`SELECT r.id, r.logical_id AS logical, r.patient_user_id AS patient, r.status, r.critical,
        t.code, t.restricted_class AS restricted, t.patient_group AS "group",
        NOT EXISTS (SELECT 1 FROM diagnostic_reports n WHERE n.supersedes_id = r.id) AS current,
        EXISTS (SELECT 1 FROM result_acknowledgements a WHERE a.report_id = r.id AND a.action IN ('seen','acted')) AS reviewed,
        EXISTS (SELECT 1 FROM patient_told_events e WHERE e.report_id = r.id) AS told,
        h.kind AS hold_kind, h.until_on::text AS hold_until, h.reason AS hold_reason,
        r.referral_id IS NOT NULL AS referred, r.device_id IS NOT NULL AS bedside,
        EXISTS (SELECT 1 FROM patient_result_views v JOIN diagnostic_reports o ON o.id = v.report_id
                 WHERE o.logical_id = r.logical_id AND o.id <> r.id) AS earlier_seen,
        extract(year FROM age(now(), p.date_of_birth))::int AS age,
        EXISTS (SELECT 1 FROM consent_records c WHERE c.user_id = r.patient_user_id
                 AND c.consent_type = 'results_in_app' AND c.revoked_at IS NULL) AS consent,
        (SELECT max(v.viewed_at) FROM patient_result_views v WHERE v.report_id = r.id) AS seen,
        (r.issued_at AT TIME ZONE 'Africa/Kampala')::date::text AS released
      FROM diagnostic_reports r
      LEFT JOIN test_catalogue t ON t.id = r.test_id
      LEFT JOIN patient_profiles p ON p.id = r.patient_user_id
      LEFT JOIN LATERAL (SELECT kind, until_on, reason FROM patient_hold_events x
                          WHERE x.report_logical_id = r.logical_id ORDER BY x.id DESC LIMIT 1) h ON true
     WHERE r.hospital_id = ${hospitalId} AND r.id IN (${list})`),
  );
  return rows.map((r) => ({
    reportId: r.id,
    logicalId: r.logical,
    patientUserId: r.patient,
    snapshot: {
      test: { code: r.code ?? "", restrictedClass: r.restricted, patientGroup: r.group },
      status: r.status as ResultSnapshot["status"],
      current: r.current,
      critical: r.critical,
      reviewed: r.reviewed,
      told: r.told,
      hold: r.hold_kind
        ? { kind: r.hold_kind as "set" | "extend" | "release", untilOn: r.hold_until }
        : null,
      referred: r.referred,
      bedside: r.bedside,
      earlierSeen: r.earlier_seen,
    },
    patientAge: r.age ?? 0,
    consent: r.consent,
    seenAt: r.seen ? new Date(r.seen) : null,
    hold:
      r.hold_kind && r.hold_kind !== "release"
        ? { reason: r.hold_reason ?? "", untilOn: r.hold_until }
        : null,
    releasedOn: r.released,
  }));
}

/** 5.4: the doctor's "The patient sees it" chip for each result, as the patient would see it. */
export type PatientSees =
  | { kind: "in_person" }
  | { kind: "minor" }
  | { kind: "no_consent" }
  | { kind: "not_released" }
  | { kind: "rules_unsigned" }
  | { kind: "when_reviewed" }
  | { kind: "after_told" }
  | { kind: "held"; until: string | null }
  | { kind: "being_checked" }
  | { kind: "visible" }
  | { kind: "seen"; at: Date };
export function patientSees(f: ResultFacts, ctx: ReleaseContext): PatientSees {
  const v = visibleToPatient(f.snapshot, {
    viewer: "patient",
    patientAge: f.patientAge,
    consent: f.consent,
    ...ctx,
  });
  const map: Record<Reason, PatientSees> = {
    never_shown: { kind: "in_person" },
    group_rule: { kind: "in_person" },
    minor: { kind: "minor" },
    no_consent: { kind: "no_consent" },
    not_released: { kind: "not_released" },
    rules_unsigned: { kind: "rules_unsigned" },
    not_reviewed: { kind: "when_reviewed" },
    not_told: { kind: "after_told" },
    held: { kind: "held", until: f.hold?.untilOn ?? null },
    being_checked: { kind: "being_checked" },
    visible: f.seenAt ? { kind: "seen", at: f.seenAt } : { kind: "visible" },
  };
  return map[v.reason];
}

async function reportForClinician(ctx: WriteCtx, patientUserId: string, reportId: string) {
  const report = await currentReport(ctx, patientUserId, reportId);
  const acks = await ctx.tx
    .select({ forwardedToUserId: resultAcknowledgements.forwardedToUserId })
    .from(resultAcknowledgements)
    .where(eq(resultAcknowledgements.reportId, report.id));
  await requireResponsible(ctx, report, acks);
  return report;
}

/** PR-4: "I have spoken to them", with how. A repeat critical needs its own event (one per report version). */
export async function recordPatientTold(
  ctx: WriteCtx,
  i: {
    patientUserId: string;
    reportId: string;
    how: "in_person" | "phone" | "guardian";
    toldAt: Date;
    clientKey: string;
  },
): Promise<string> {
  const report = await reportForClinician(ctx, i.patientUserId, i.reportId);
  if (i.toldAt.getTime() > ctx.now.getTime() + 5 * 60_000)
    throw new EmrWriteError("invalid", "The time cannot be in the future.");
  const [row] = await ctx.tx
    .insert(patientToldEvents)
    .values({
      hospitalId: ctx.actor.hospitalId,
      reportId: report.id,
      patientUserId: i.patientUserId,
      how: i.how,
      toldBy: ctx.actor.userId,
      toldAt: i.toldAt,
      clientKey: i.clientKey,
    })
    .onConflictDoNothing()
    .returning({ id: patientToldEvents.id });
  return row?.id ?? "replayed";
}

/** PR-7: hold from the patient, with a reason and an until-date within the signed maximum. */
export async function holdFromPatient(
  ctx: WriteCtx,
  i: {
    patientUserId: string;
    reportId: string;
    reason: "explain_in_person" | "harm_to_patient";
    untilOn: string;
    clientKey: string;
  },
  release: PatientRelease | null,
): Promise<string> {
  const report = await reportForClinician(ctx, i.patientUserId, i.reportId);
  const today = ctx.now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const errors = holdErrors(
    { reason: i.reason, untilOn: i.untilOn },
    today,
    release?.holdMaxDays ?? null,
  );
  if (errors.length)
    throw new EmrWriteError(
      "invalid",
      errors.includes("max_unsigned")
        ? "The hold maximum is not signed yet at this hospital."
        : errors.includes("until_beyond_max")
          ? `A hold may last at most ${release?.holdMaxDays} days.`
          : "Give the reason and an until-date from today.",
    );
  const [last] = await ctx.tx
    .select({ kind: patientHoldEvents.kind })
    .from(patientHoldEvents)
    .where(eq(patientHoldEvents.reportLogicalId, report.logicalId))
    .orderBy(desc(patientHoldEvents.id))
    .limit(1);
  const [row] = await ctx.tx
    .insert(patientHoldEvents)
    .values({
      hospitalId: ctx.actor.hospitalId,
      reportLogicalId: report.logicalId,
      reportId: report.id,
      patientUserId: i.patientUserId,
      kind: last && last.kind !== "release" ? "extend" : "set",
      reason: i.reason,
      untilOn: i.untilOn,
      byUser: ctx.actor.userId,
      at: ctx.now,
      clientKey: i.clientKey,
    })
    .onConflictDoNothing()
    .returning({ id: patientHoldEvents.id });
  return String(row?.id ?? "replayed");
}

export async function releaseHold(
  ctx: WriteCtx,
  i: { patientUserId: string; reportId: string; clientKey: string },
) {
  const report = await reportForClinician(ctx, i.patientUserId, i.reportId);
  await ctx.tx
    .insert(patientHoldEvents)
    .values({
      hospitalId: ctx.actor.hospitalId,
      reportLogicalId: report.logicalId,
      reportId: report.id,
      patientUserId: i.patientUserId,
      kind: "release",
      byUser: ctx.actor.userId,
      at: ctx.now,
      clientKey: i.clientKey,
    })
    .onConflictDoNothing();
  return report.id;
}

/** 5.2 Next: the clinician's note the patient will see, with the clinician's name. */
export async function writeNoteToPatient(
  ctx: WriteCtx,
  i: { patientUserId: string; reportId: string; text: string; clientKey: string },
) {
  const report = await reportForClinician(ctx, i.patientUserId, i.reportId);
  const [row] = await ctx.tx
    .insert(clinicianNotesToPatient)
    .values({
      hospitalId: ctx.actor.hospitalId,
      reportId: report.id,
      patientUserId: i.patientUserId,
      textCiphertext: encrypt(i.text.trim()),
      authorUserId: ctx.actor.userId,
      at: ctx.now,
      clientKey: i.clientKey,
    })
    .onConflictDoNothing()
    .returning({ id: clinicianNotesToPatient.id });
  return row?.id ?? "replayed";
}

/** PR-16: released, unreviewed results older than the signed window, for the orderer and the head of department. */
export async function agedResults(
  tx: EmrTx,
  hospitalId: string,
  now: Date,
  windowDays: number | null,
) {
  if (windowDays === null) return [];
  const before = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  return rowsOf<{
    reportId: string;
    patientUserId: string;
    orderer: string | null;
    department: string | null;
    issuedAt: Date;
  }>(
    await tx.execute(sql`SELECT r.id AS "reportId", r.patient_user_id AS "patientUserId", o.authored_by_user_id AS orderer,
        e.department_id AS department, r.issued_at AS "issuedAt"
      FROM diagnostic_reports r
      JOIN encounter_orders o ON o.id = r.order_id
      LEFT JOIN encounters e ON e.id = o.encounter_id
     WHERE r.hospital_id = ${hospitalId} AND r.status IN ('final','amended','corrected')
       AND NOT EXISTS (SELECT 1 FROM diagnostic_reports n WHERE n.supersedes_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM result_acknowledgements a WHERE a.report_id = r.id AND a.action IN ('seen','acted'))
       AND r.issued_at < ${before}::timestamptz
     ORDER BY r.issued_at`),
  );
}

/** PR-7: holds set or extended in a month, for the CSO's review. */
export async function holdsForMonth(tx: EmrTx, hospitalId: string, from: Date, to: Date) {
  return tx
    .select()
    .from(patientHoldEvents)
    .where(
      and(
        eq(patientHoldEvents.hospitalId, hospitalId),
        inArray(patientHoldEvents.kind, ["set", "extend"]),
        sql`${patientHoldEvents.at} >= ${from.toISOString()}::timestamptz AND ${patientHoldEvents.at} < ${to.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(patientHoldEvents.at);
}
