import "server-only";

import type { StatusWord } from "./patient-release";
import type { ResultFacts } from "./patient-release-store";
import type { PlainWords } from "./plain-words";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PartnerTests } from "@/lib/exchange/partners";
import { sql } from "drizzle-orm";

import { fill, LAB5 } from "@/content/lab-phase-5";
import { decrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";
import { conceptDef } from "@/lib/facts/project/shared";
import { loadConfigs } from "./catalogue-v2";
import { patientResultsLiveFor } from "./feature";
import { groupOf, neverShown, pickLanguage, statusWord, visibleToPatient } from "./patient-release";
import { releaseContext, resultFacts } from "./patient-release-store";
import { expectedBy } from "./referral";

/**
 * The patient's results (Lab Phase 5 §5.1, §5.2; PR-1, PR-3, PR-5, PR-8, PR-10, PR-11, PR-13, PR-15). Every result
 * goes through the same `visibleToPatient` gate as the doctor's chip; for an adult patient the database floor
 * (`private.patient_visible_report_ids`, 0154) must agree as well. A never-shown test appears nowhere, not even as a
 * name under "Not ready to show yet" (S30). Reads run as the owner after the caller has proven who the viewer is.
 */

export type Viewer = { userId: string; subjectUserId: string };
export interface ValueLine {
  name: string;
  concept: string | null;
  value: string;
  num: number | null;
  unit: string;
  low: number | null;
  high: number | null;
  word: StatusWord;
}
export interface ReadyCard {
  reportId: string;
  hospitalId: string;
  hospitalName: string;
  test: string;
  releasedOn: string;
  reviewedOn: string | null;
  values: ValueLine[];
  beingChecked: boolean;
  correctedOn: string | null;
  note: string | null;
  bedside: boolean;
  partner: string | null;
  /** PS-2: the signed release table lets this result's group send a results-ready SMS. */
  sms: boolean;
}
export interface NotReady {
  key: string;
  test: string;
  line: string;
}
export type Blocked = "minor" | "no_consent" | "rules_unsigned" | null;

const day = (d: Date | string) =>
  new Date(d)
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Kampala",
    })
    .toUpperCase();
const FLAG: Record<string, "low" | "high" | "normal"> = {
  L: "low",
  LL: "low",
  low: "low",
  H: "high",
  HH: "high",
  high: "high",
  N: "normal",
  normal: "normal",
};
/** The app's database, or a test lane's (as `identitiesFor` does). */
const conn = async (database?: EmrDb): Promise<EmrDb> =>
  database ?? ((await import("@/db")).db as unknown as EmrDb);
const n = (x: unknown) => (x === null || x === undefined || x === "" ? null : Number(x));

/** PR-10, PR-11: who the viewer is to this record. A guardian needs a live link made at the hospital. */
export async function viewerKind(
  v: Viewer,
  database?: EmrDb,
): Promise<"patient" | "guardian" | null> {
  if (v.userId === v.subjectUserId) return "patient";
  const r = rowsOf<{ ok: number }>(
    await (
      await conn(database)
    ).execute(sql`SELECT 1 AS ok FROM guardian_links WHERE guardian_user_id = ${v.userId}
      AND child_user_id = ${v.subjectUserId} AND ended_at IS NULL LIMIT 1`),
  );
  return r.length ? "guardian" : null;
}

/** The children a guardian may open (links made at the hospital, never in the app). */
export async function myChildren(userId: string, database?: EmrDb) {
  return rowsOf<{ id: string; relationship: string }>(
    await (
      await conn(database)
    ).execute(sql`SELECT DISTINCT child_user_id AS id, relationship FROM guardian_links
      WHERE guardian_user_id = ${userId} AND ended_at IS NULL`),
  );
}

async function valuesFor(tx: EmrTx, reportIds: string[]) {
  if (!reportIds.length) return new Map<string, ValueLine[]>();
  const list = sql.join(
    reportIds.map((r) => sql`${r}::uuid`),
    sql`, `,
  );
  const rows = rowsOf<{
    report: string;
    concept: string | null;
    num: string | null;
    comparator: string | null;
    unit: string | null;
    code: string | null;
    context: unknown;
    s_text: string | null;
    s_unit: string | null;
    s_low: string | null;
    s_high: string | null;
    s_flag: string | null;
  }>(
    await tx.execute(sql`SELECT o.report_id AS report, o.concept_id AS concept, o.value_num::text AS num,
        o.value_comparator AS comparator, o.value_unit AS unit, o.value_code AS code, o.context,
        s.value_text AS s_text, s.unit_display AS s_unit, s.range_low::text AS s_low, s.range_high::text AS s_high,
        s.flag_final AS s_flag
      FROM clinical_observations o
      LEFT JOIN lab_result_snapshots s ON s.observation_id = o.id
     WHERE o.report_id IN (${list}) AND NOT coalesce(s.lab_only, false)
       AND o.concept_id IS NOT NULL AND o.concept_id <> 'obs.uncatalogued'
     ORDER BY o.id`),
  );
  const out = new Map<string, ValueLine[]>();
  for (const r of rows) {
    const ctx = (r.context ?? {}) as {
      labInterpretation?: string;
      referenceRange?: { low?: number | null; high?: number | null; source?: string };
    };
    const range = ctx.referenceRange?.source === "lab" ? ctx.referenceRange : null;
    const low = r.s_text !== null ? n(r.s_low) : n(range?.low);
    const high = r.s_text !== null ? n(r.s_high) : n(range?.high);
    const flag = FLAG[(r.s_text !== null ? r.s_flag : ctx.labInterpretation) ?? ""] ?? null;
    const value =
      r.s_text ??
      (r.num !== null
        ? `${r.comparator ?? ""}${r.num}`
        : r.code
          ? r.code.replace(/^[a-z]+\./, "").replace(/_/g, " ")
          : "");
    const line: ValueLine = {
      name: (r.concept && conceptDef(r.concept)?.display) ?? r.concept ?? "Result",
      concept: r.concept,
      value,
      num: r.num !== null && !r.comparator ? Number(r.num) : null,
      unit: r.s_unit ?? r.unit ?? "",
      low,
      high,
      word: statusWord({
        flag,
        rangeLow: low === null ? null : String(low),
        rangeHigh: high === null ? null : String(high),
      }),
    };
    out.set(r.report, [...(out.get(r.report) ?? []), line]);
  }
  return out;
}

/**
 * §5.1: the viewer's ready results and the "Not ready to show yet" lines for one record. Returns `blocked` when a
 * page-level reason (under-18 rule, no consent, unsigned release rules at every hospital) hides everything.
 */
export async function resultsFor(v: Viewer, now: Date, database?: EmrDb) {
  const kind = await viewerKind(v, database);
  if (!kind) return null;
  return (await conn(database)).transaction(async (tx) => {
    const reports = rowsOf<{
      id: string;
      hospital: string;
      hospital_name: string;
      test: string | null;
      issued: Date;
      reviewed: Date | null;
      partner: string | null;
    }>(
      await tx.execute(sql`SELECT r.id, r.hospital_id AS hospital, h.name AS hospital_name, t.display AS test,
          r.issued_at AS issued,
          (SELECT min(a.recorded_at) FROM result_acknowledgements a WHERE a.report_id = r.id
             AND a.action IN ('seen','acted')) AS reviewed,
          (SELECT p.name FROM lab_referrals f JOIN lab_partners p ON p.id = f.partner_id WHERE f.id = r.referral_id) AS partner
        FROM diagnostic_reports r
        JOIN hospitals h ON h.id = r.hospital_id
        LEFT JOIN test_catalogue t ON t.id = r.test_id
       WHERE r.patient_user_id = ${v.subjectUserId} AND r.kind = 'lab'
         AND r.status NOT IN ('cancelled','entered_in_error')
         AND NOT EXISTS (SELECT 1 FROM diagnostic_reports x WHERE x.supersedes_id = r.id)
       ORDER BY r.issued_at DESC NULLS LAST LIMIT 200`),
    ).filter((r) => patientResultsLiveFor(r.hospital));
    const floor =
      kind === "patient"
        ? new Set(
            rowsOf<{ id: string }>(
              await tx.execute(
                sql`SELECT private.patient_visible_report_ids(${v.subjectUserId}) AS id`,
              ),
            ).map((r) => r.id),
          )
        : null;
    const hospitals = [...new Set(reports.map((r) => r.hospital))];
    const ctxs = new Map(
      await Promise.all(hospitals.map(async (h) => [h, await releaseContext(tx, h, now)] as const)),
    );
    const facts = new Map<string, ResultFacts>();
    for (const h of hospitals)
      for (const f of await resultFacts(
        tx,
        h,
        reports.filter((r) => r.hospital === h).map((r) => r.id),
      ))
        facts.set(f.reportId, f);
    const decisions = reports.flatMap((r) => {
      const f = facts.get(r.id);
      if (!f) return [];
      const d = visibleToPatient(f.snapshot, {
        viewer: kind,
        patientAge: f.patientAge,
        consent: f.consent,
        ...ctxs.get(r.hospital)!,
      });
      // Defence in depth: an adult patient also needs the database's own floor to agree.
      if (d.visible && floor && !floor.has(r.id)) return [];
      return [{ r, f, d }];
    });
    const shown = decisions.filter((x) => !["never_shown", "group_rule"].includes(x.d.reason));
    const pageLevel = (["minor", "no_consent", "rules_unsigned"] as const).find(
      (b) => shown.length > 0 && shown.every((x) => x.d.reason === b),
    );
    const visibleIds = shown
      .filter((x) => x.d.visible || x.d.reason === "being_checked")
      .map((x) => x.r.id);
    const values = await valuesFor(tx, visibleIds);
    const notes = new Map(
      visibleIds.length
        ? rowsOf<{ report: string; text: string }>(
            await tx.execute(sql`SELECT DISTINCT ON (report_id) report_id AS report, text_ciphertext AS text
              FROM clinician_notes_to_patient WHERE report_id IN (${sql.join(
                visibleIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )}) ORDER BY report_id, at DESC`),
          ).map((x) => [x.report, decrypt(x.text)])
        : [],
    );
    const ready: ReadyCard[] = shown
      .filter((x) => x.d.visible || x.d.reason === "being_checked")
      .map(({ r, f, d }) => ({
        reportId: r.id,
        hospitalId: r.hospital,
        hospitalName: r.hospital_name,
        test: r.test ?? "Test",
        releasedOn: day(r.issued),
        reviewedOn: r.reviewed ? day(r.reviewed) : null,
        values: d.visible ? (values.get(r.id) ?? []) : [],
        beingChecked: d.reason === "being_checked",
        correctedOn: d.visible && f.snapshot.earlierSeen ? day(r.issued) : null,
        note: notes.get(r.id) ?? null,
        bedside: f.snapshot.bedside,
        partner: r.partner,
        sms: !!ctxs.get(r.hospital)?.rules?.groups[groupOf(f.snapshot)].sms,
      }));
    const notReady: NotReady[] = shown
      .filter((x) => ["not_reviewed", "not_told", "held"].includes(x.d.reason))
      .map(({ r }) => ({ key: r.id, test: r.test ?? "Test", line: LAB5.notReadyReview }));
    // Ordered, not yet released: "Waiting for the lab", or the reference lab's expected date (Phase 4).
    const pending = rowsOf<{
      id: string;
      hospital: string;
      test: string | null;
      code: string | null;
      restricted: string | null;
      grp: string | null;
      sent: Date | null;
      tests_config: string | null;
    }>(
      await tx.execute(sql`SELECT o.id, o.hospital_id AS hospital, t.display AS test, t.code,
          t.restricted_class AS restricted, t.patient_group AS grp, f.sent_at AS sent,
          f.partner_tests_config_id AS tests_config
        FROM encounter_orders o
        LEFT JOIN test_catalogue t ON t.id = o.test_id
        LEFT JOIN LATERAL (SELECT sent_at, partner_tests_config_id FROM lab_referrals x
                            WHERE o.id = ANY (x.order_ids) AND x.state NOT IN ('cancelled','completed')
                            ORDER BY x.created_at DESC LIMIT 1) f ON true
       WHERE o.patient_user_id = ${v.subjectUserId} AND o.kind = 'lab' AND o.test_id IS NOT NULL
         AND o.created_at > ${new Date(now.getTime() - 60 * 86_400_000).toISOString()}::timestamptz
         AND NOT EXISTS (SELECT 1 FROM diagnostic_reports r WHERE r.order_id = o.id
                          AND r.status IN ('final','amended','corrected'))
         AND coalesce((SELECT e.kind FROM encounter_order_events e WHERE e.order_id = o.id
                        ORDER BY e.recorded_at DESC LIMIT 1), 'placed') NOT IN ('cancelled','dismissed','proposed')`),
    ).filter((o) => patientResultsLiveFor(o.hospital));
    const configs = new Map(
      await Promise.all(hospitals.map(async (h) => [h, await loadConfigs(tx, h)] as const)),
    );
    for (const o of pending) {
      const add = ctxs.get(o.hospital)?.floorAdditions ?? [];
      if (
        neverShown({ code: o.code ?? "", restrictedClass: o.restricted, patientGroup: o.grp }, add)
      )
        continue; // S30: never even as a name
      let line: string = LAB5.notReadyLab;
      if (o.sent) {
        const tests = configs.get(o.hospital)?.find((c) => c.id === o.tests_config)?.payload as
          | PartnerTests
          | undefined;
        const t = tests?.tests.find((x) => x.testCode === o.code);
        const exp = expectedBy(o.sent, t?.turnaround ?? null, { holidays: tests?.holidays ?? [] });
        if (exp) line = fill(LAB5.notReadyReferred, { date: day(exp) });
      }
      notReady.push({ key: o.id, test: o.test ?? "Test", line });
    }
    return {
      kind,
      blocked: (pageLevel ?? null) as Blocked,
      ready: pageLevel ? [] : ready,
      notReady: pageLevel ? [] : notReady,
    };
  });
}

/**
 * §5.2: one result for the viewer, or null when it is not theirs to see. Adds the earlier results of the same
 * components, the signed plain words, the corrected earlier value and records the view (PR-13).
 */
export async function oneResult(
  v: Viewer,
  reportId: string,
  now: Date,
  lang: string,
  database?: EmrDb,
) {
  const all = await resultsFor(v, now, database);
  const card = all?.ready.find((c) => c.reportId === reportId);
  if (!all || !card) return null;
  return (await conn(database)).transaction(async (tx) => {
    const concepts = card.values.map((x) => x.concept).filter(Boolean) as string[];
    const earlierIds = all.ready
      .filter((c) => c.reportId !== reportId && !c.beingChecked)
      .filter((c) => c.values.some((x) => x.concept && concepts.includes(x.concept)))
      .map((c) => c.reportId);
    const signed = (await loadConfigs(tx, card.hospitalId)).filter(
      (c) =>
        c.kind === "plain_words" &&
        c.status === "signed" &&
        c.inForceFrom !== null &&
        c.inForceFrom <= now,
    );
    const words = new Map(
      concepts.map((concept) => {
        const byLang = Object.fromEntries(
          signed
            .filter((c) => c.key.startsWith(`${concept}:`))
            .map((c) => [c.key.split(":")[1]!, c.payload as PlainWords]),
        );
        return [concept, pickLanguage(byLang, lang).text] as const;
      }),
    );
    // PR-5: the earlier value, struck through, from the version this one supersedes.
    const [prev] = card.correctedOn
      ? rowsOf<{ id: string; issued: Date }>(
          await tx.execute(sql`SELECT p.id, p.issued_at AS issued FROM diagnostic_reports r
            JOIN diagnostic_reports p ON p.id = r.supersedes_id WHERE r.id = ${reportId}`),
        )
      : [];
    const earlierValue = prev
      ? { on: day(prev.issued), values: (await valuesFor(tx, [prev.id])).get(prev.id) ?? [] }
      : null;
    return {
      card,
      earlier: all.ready.filter((c) => earlierIds.includes(c.reportId)),
      words: Object.fromEntries(words) as Record<string, PlainWords | null>,
      earlierValue,
    };
  });
}

/** PR-13: who saw which result, when, from what class of device (no address, no fingerprint). */
export async function recordView(
  v: Viewer,
  reportId: string,
  userAgent: string | null,
  database?: EmrDb,
) {
  const deviceClass = /mobile|android|iphone/i.test(userAgent ?? "") ? "phone" : "computer";
  await (
    await conn(database)
  )
    .execute(sql`INSERT INTO patient_result_views (report_id, patient_user_id, viewer_user_id, device_class)
    VALUES (${reportId}, ${v.subjectUserId}, ${v.userId}, ${deviceClass})`);
}

/**
 * PR-15: "Ask for a copy" opens one records request per hospital holding results for this record, due in 30 days
 * (DPPA 2019 s.24(9)). A hold in the app never blocks it; the records office sees held results flagged.
 */
export async function askForCopy(
  patientUserId: string,
  clientKey: string,
  now: Date,
  database?: EmrDb,
) {
  const c = await conn(database);
  const due = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const hospitals = rowsOf<{ h: string }>(
    await c.execute(sql`SELECT DISTINCT hospital_id AS h FROM diagnostic_reports
      WHERE patient_user_id = ${patientUserId} AND kind = 'lab'`),
  );
  for (const { h } of hospitals)
    await c.execute(sql`INSERT INTO records_requests (hospital_id, patient_user_id, due_on, client_key)
      VALUES (${h}, ${patientUserId}, ${due}, ${`${clientKey}:${h}`}) ON CONFLICT DO NOTHING`);
  return hospitals.length;
}

/** The records office's list (PR-15): open requests, each with whether any of the patient's results is held. */
export async function openRecordsRequests(hospitalId: string, database?: EmrDb) {
  return rowsOf<{
    id: string;
    patientUserId: string;
    requestedAt: Date;
    dueOn: string;
    held: boolean;
  }>(
    await (
      await conn(database)
    )
      .execute(sql`SELECT q.id, q.patient_user_id AS "patientUserId", q.requested_at AS "requestedAt",
        q.due_on::text AS "dueOn",
        EXISTS (SELECT 1 FROM diagnostic_reports r
                 JOIN LATERAL (SELECT kind FROM patient_hold_events h WHERE h.report_logical_id = r.logical_id
                                ORDER BY h.id DESC LIMIT 1) last ON true
                WHERE r.patient_user_id = q.patient_user_id AND r.hospital_id = q.hospital_id
                  AND last.kind <> 'release') AS held
      FROM records_requests q WHERE q.hospital_id = ${hospitalId} AND q.fulfilled_at IS NULL
      ORDER BY q.due_on`),
  );
}
