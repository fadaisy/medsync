/**
 * Lab Phase 1, Step 2 (gate-a-proposal §5): migrations 0102–0106 on the PGlite lane. Every new table
 * is read only through the clinical reader, scoped to the hospital and, for patient-bearing rows, to
 * the reader's access or recipiency; no client writes anywhere; the event and mark tables are
 * append-only for every role; signed sets are frozen and only move forward; a measure is immutable; a
 * form number is entered once; the per-user realtime topic reaches only its user. Fixture values are
 * invented and named as fixtures: none is a clinical number. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Actor, Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { generateKey } from "@/lib/encryption";
import {
  actAs,
  authUser,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  probe,
} from "./_pglite";

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";
const key = () => `k-${randomUUID()}`;

const NEW_TABLES = [
  "lab_settings",
  "critical_response_versions",
  "critical_contacts",
  "critical_alerts",
  "critical_marks",
  "critical_alert_events",
  "escalation_heartbeats",
  "lab_sms_templates",
  "ucum_units",
  "lab_component_measures",
  "lab_result_snapshots",
  "reference_range_versions",
  "reference_range_bands",
  "critical_limit_versions",
  "critical_limits",
  "downtime_periods",
  "downtime_form_numbers",
  "downtime_entries",
  "downtime_drills",
  "lab_briefings",
  "lab_cutover",
] as const;

describe.skipIf(!laneOn)("Lab Phase 1 data layer (0102–0106)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  const a: Record<string, EmrActor> = {};
  let recipient: string;
  let stranger: string;
  let readerB: string;
  let patientId: string;
  let reportId: string;
  let observationId: string;
  let alertId: string;
  let testId: string;

  const reader = (userId: string, hospitalId: string): Actor => ({
    userId,
    role: "medsync_clinical_reader",
    hospitalId,
  });
  const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await pg.query<T>(sql, params)).rows[0]!;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Safety A");
    hB = await hospital(pg, "Safety B");
    const ward = await department(pg, hA, "Ward");
    const other = await department(pg, hA, "Other ward");
    const lab = await department(pg, hA, "Laboratory");
    const wardB = await department(pg, hB, "Ward B");
    const make = async (h: string, d: string, cadreCode: string, surface: EmrActor["surface"]) => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
    });
    a.doctor = await make(hA, ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(hA, ward, "NURSE", "nurse");
    a.lab = await make(hA, lab, "LAB_TECHNOLOGIST", "lab");
    recipient = (await clinician(pg, { hospitalId: hA, departmentId: other, cadre: "CONSULTANT" }))
      .userId;
    stranger = (
      await clinician(pg, { hospitalId: hA, departmentId: other, cadre: "MEDICAL_OFFICER" })
    ).userId;
    readerB = (
      await clinician(pg, { hospitalId: hB, departmentId: wardB, cadre: "MEDICAL_OFFICER" })
    ).userId;

    // A released report through the real write paths.
    patientId = await patient(pg);
    await intake(pg, { hospitalId: hA, patientUserId: patientId });
    const enc = await encounter(pg, {
      hospitalId: hA,
      patientUserId: patientId,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    const as = <T>(actor: EmrActor, fn: (ctx: WriteCtx) => Promise<T>) =>
      withPatientWrite(actor, patientId, fn, { database: lane.db });
    const order = await as(a.doctor!, (ctx) =>
      placeOrders(ctx, {
        patientUserId: patientId,
        encounterId: enc,
        orders: [
          { clientKey: key(), testId: GLUCOSE_FASTING, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    const sp = await as(a.nurse!, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: patientId,
        orderId: order.id,
        identifiersConfirmed: true,
        fastingState: "fasting",
        fastingHours: 9,
        clientKey: key(),
      }),
    );
    await as(a.lab!, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: patientId, specimenId: sp.id, clientKey: key() }),
    );
    const prelim = await as(a.lab!, (ctx) =>
      enterResults(ctx, {
        patientUserId: patientId,
        orderId: order.id,
        status: "preliminary",
        values: [{ conceptId: "obs.glucose", value: "5.1", unit: "mmol/L" }],
        clientKey: key(),
      }),
    );
    const fin = await as(a.lab!, (ctx) =>
      releaseResults(ctx, { patientUserId: patientId, reportId: prelim.id, clientKey: key() }),
    );
    reportId = fin.id;
    observationId = (
      await one<{ id: string }>(`SELECT id FROM clinical_observations WHERE report_id = $1`, [
        reportId,
      ])
    ).id;
    testId = (
      await one<{ test_id: string }>(`SELECT test_id FROM diagnostic_reports WHERE id = $1`, [
        reportId,
      ])
    ).test_id;
    const labUser = a.lab!.userId;
    // Close the visit: open_intake would give every clinician at the hospital access, and these probes
    // need a clinician with none. The lab keeps lab_work; the doctor keeps department_recent.
    await pg.query(`UPDATE patient_intakes SET status = 'completed' WHERE patient_user_id = $1`, [
      patientId,
    ]);
    await pg.exec(`GRANT SELECT ON realtime.messages TO authenticated`); // as Supabase grants it

    // One row in every new table, as the owner (the write paths come in Steps 3–8).
    await pg.query(`INSERT INTO lab_settings (hospital_id, lab_phone) VALUES ($1, 'fixture-ext')`, [
      hA,
    ]);
    await pg.query(
      `INSERT INTO critical_response_versions (hospital_id, version, ack_within_min, source, authored_by)
       VALUES ($1, 1, 1, 'fixture: invented for tests', $2)`,
      [hA, labUser],
    );
    await pg.query(
      `INSERT INTO critical_contacts (hospital_id, department_id, level, user_id) VALUES ($1, $2, 1, $3)`,
      [hA, other, recipient],
    );
    alertId = (
      await one<{ id: string }>(
        `INSERT INTO critical_alerts (hospital_id, patient_user_id, report_id, state, sub_state, created_by)
         VALUES ($1, $2, $3, 'open', 'sent', $4) RETURNING id`,
        [hA, patientId, reportId, labUser],
      )
    ).id;
    await pg.query(
      `INSERT INTO critical_marks (alert_id, report_id, hospital_id, patient_user_id, concept_id, source, check_kind,
         sample_checked, actor_id) VALUES ($1, $2, $3, $4, 'obs.glucose', 'manual', 'checked_not_repeated', true, $5)`,
      [alertId, reportId, hA, patientId, labUser],
    );
    await pg.query(
      `INSERT INTO critical_alert_events (alert_id, hospital_id, kind, actor_id) VALUES ($1, $2, 'created', $3)`,
      [alertId, hA, labUser],
    );
    await pg.query(
      `INSERT INTO critical_alert_events (alert_id, hospital_id, kind, level, recipient_id, channel, outcome)
       VALUES ($1, $2, 'notified', 0, $3, 'app', 'queued')`,
      [alertId, hA, recipient],
    );
    await pg.query(`INSERT INTO escalation_heartbeats (source) VALUES ('lazy')`);
    await pg.query(
      `INSERT INTO lab_sms_templates (hospital_id, kind, version, body, authored_by) VALUES ($1, 'level0', 1, 'Fixture template body', $2)`,
      [hA, labUser],
    );
    const measure = await one<{ id: string }>(
      `INSERT INTO lab_component_measures (hospital_id, test_id, concept_id, version, result_type, unit_ucum, unit_display,
         decimal_places, authored_by) VALUES ($1, $2, 'obs.glucose', 1, 'number', 'mmol/L', 'mmol/L', 1, $3) RETURNING id`,
      [hA, testId, labUser],
    );
    await pg.query(
      `INSERT INTO lab_result_snapshots (observation_id, report_id, hospital_id, patient_user_id, measure_id, measure_version,
         value_decimal, value_text, unit_ucum, unit_display, range_state)
       VALUES ($1, $2, $3, $4, $5, 1, 5.1, '5.1', 'mmol/L', 'mmol/L', 'no_signed_range')`,
      [observationId, reportId, hA, patientId, measure.id],
    );
    const rv = await one<{ id: string }>(
      `INSERT INTO reference_range_versions (hospital_id, test_id, concept_id, unit_ucum, version, authored_by)
       VALUES ($1, $2, 'obs.glucose', 'mmol/L', 1, $3) RETURNING id`,
      [hA, testId, labUser],
    );
    await pg.query(
      `INSERT INTO reference_range_bands (version_id, sex, low, high, source) VALUES ($1, 'any', 1, 2, 'fixture')`,
      [rv.id],
    );
    const lv = await one<{ id: string }>(
      `INSERT INTO critical_limit_versions (hospital_id, version, authored_by) VALUES ($1, 1, $2) RETURNING id`,
      [hA, labUser],
    );
    await pg.query(
      `INSERT INTO critical_limits (version_id, test_id, concept_id, unit_ucum, low, reference_id, source)
       VALUES ($1, $2, 'obs.glucose', 'mmol/L', 1, 'FX-1', 'fixture')`,
      [lv.id, testId],
    );
    await pg.query(
      `INSERT INTO downtime_periods (hospital_id, starts_at, ends_at, reason, recorded_by)
       VALUES ($1, now() - interval '2 hours', now() - interval '1 hour', 'network', $2)`,
      [hA, labUser],
    );
    await pg.query(
      `INSERT INTO downtime_form_numbers (hospital_id, number, reserved_by) VALUES ($1, 1, $2), ($1, 2, $2)`,
      [hA, labUser],
    );
    await pg.query(
      `UPDATE downtime_form_numbers SET state = 'entered', report_id = $2 WHERE hospital_id = $1 AND number = 1`,
      [hA, reportId],
    );
    await pg.query(
      `INSERT INTO downtime_entries (report_id, hospital_id, patient_user_id, form_number, collected_at, resulted_at,
         released_on_paper_by, entered_by) VALUES ($1, $2, $3, 1, now() - interval '90 minutes', now() - interval '80 minutes',
         'Fixture tech', $4)`,
      [reportId, hA, patientId, labUser],
    );
    await pg.query(
      `INSERT INTO downtime_drills (hospital_id, held_on, participants, what_was_done, recorded_by)
       VALUES ($1, current_date, 'fixture team', 'fixture drill', $2)`,
      [hA, labUser],
    );
    await pg.query(
      `INSERT INTO lab_briefings (hospital_id, held_on, audience, recorded_by) VALUES ($1, current_date, 'fixture wards', $2)`,
      [hA, labUser],
    );
    await pg.query(
      `INSERT INTO lab_cutover (hospital_id, conditions, requested_by) VALUES ($1, '{}'::jsonb, $2)`,
      [hA, labUser],
    );
  }, 240_000);

  const count = async (actor: Actor, table: string) => {
    const r = await probe(pg, actor, `SELECT count(*)::int AS n FROM public.${table}`);
    return r.ok ? (r.rows[0]!.n as number) : -1;
  };

  it("every new table: no client INSERT, UPDATE or DELETE", async () => {
    const client = await authUser(pg, "client");
    for (const t of NEW_TABLES) {
      const me: Actor = { userId: client, role: "authenticated" };
      const ins = await probe(pg, me, `INSERT INTO public.${t} DEFAULT VALUES`);
      const upd = await probe(
        pg,
        me,
        `UPDATE public.${t} SET ${t === "ucum_units" ? "display" : "hospital_id"} = ${t === "ucum_units" ? "'x'" : "hospital_id"}`,
      );
      const del = await probe(pg, me, `DELETE FROM public.${t}`);
      expect(ins.ok, `${t} insert`).toBe(false);
      expect(upd.ok ? upd.affected : 0, `${t} update`).toBe(0);
      expect(del.ok ? del.affected : 0, `${t} delete`).toBe(0);
    }
  });

  it("anonymous reads nothing", async () => {
    for (const t of NEW_TABLES) {
      const r = await probe(
        pg,
        { userId: null, role: "anon" },
        `SELECT count(*)::int AS n FROM public.${t}`,
      );
      expect(r.ok ? (r.rows[0]!.n as number) : 0, t).toBe(0);
    }
  });

  it("another hospital's reader sees none of hospital A's rows", async () => {
    for (const t of NEW_TABLES) {
      if (["escalation_heartbeats", "ucum_units"].includes(t)) continue; // no hospital
      expect(await count(reader(readerB, hB), t), t).toBe(0);
    }
  });

  it("the lab, with lab_work access, sees the alert, its marks and events", async () => {
    const me = reader(a.lab!.userId, hA);
    expect(await count(me, "critical_alerts")).toBe(1);
    expect(await count(me, "critical_marks")).toBe(1);
    expect(await count(me, "critical_alert_events")).toBe(2);
    expect(await count(me, "lab_result_snapshots")).toBe(1);
  });

  it("a recipient with no access basis still sees the alert they were notified of (D-LAB1-29)", async () => {
    const me = reader(recipient, hA);
    expect(await count(me, "critical_alerts")).toBe(1);
    expect(await count(me, "lab_result_snapshots")).toBe(0); // the chart's own rule still applies
  });

  it("a clinician with neither access nor recipiency sees no alert, but sees the hospital's set-up", async () => {
    const me = reader(stranger, hA);
    expect(await count(me, "critical_alerts")).toBe(0);
    expect(await count(me, "critical_alert_events")).toBe(0);
    expect(await count(me, "critical_marks")).toBe(0);
    expect(await count(me, "lab_settings")).toBe(1);
    expect(await count(me, "reference_range_bands")).toBe(1);
  });

  it("events, marks, snapshots and downtime entries are append-only, for the owner too", async () => {
    for (const [t, where] of [
      ["critical_alert_events", `alert_id = '${alertId}'`],
      ["critical_marks", `alert_id = '${alertId}'`],
      ["lab_result_snapshots", `observation_id = '${observationId}'`],
      ["downtime_entries", `report_id = '${reportId}'`],
    ] as const) {
      await expect(
        pg.query(`UPDATE public.${t} SET hospital_id = hospital_id WHERE ${where}`),
        `${t} update`,
      ).rejects.toThrow();
      await expect(
        pg.query(`DELETE FROM public.${t} WHERE ${where}`),
        `${t} delete`,
      ).rejects.toThrow();
    }
  });

  it("an alert has only the shapes CA-2 allows", async () => {
    await expect(
      pg.query(`UPDATE critical_alerts SET state = 'acknowledged' WHERE id = $1`, [alertId]),
    ).rejects.toThrow(/ca_ack_shape/);
    await expect(
      pg.query(`UPDATE critical_alerts SET state = 'closed' WHERE id = $1`, [alertId]),
    ).rejects.toThrow();
  });

  it("a signed set needs two different signers, is frozen, and only moves forward", async () => {
    const lv = await one<{ id: string }>(
      `SELECT id FROM critical_limit_versions WHERE hospital_id = $1`,
      [hA],
    );
    const lead = a.lab!.userId;
    await expect(
      pg.query(
        `UPDATE critical_limit_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), cso_signed_by = $2,
           cso_signed_at = now(), in_force_from = now() WHERE id = $1`,
        [lv.id, lead],
      ),
    ).rejects.toThrow(/clv_signed_by_two/);
    await pg.query(
      `UPDATE critical_limit_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), cso_signed_by = $3,
         cso_signed_at = now(), in_force_from = now() WHERE id = $1`,
      [lv.id, lead, recipient],
    );
    await expect(
      pg.query(
        `INSERT INTO critical_limits (version_id, test_id, concept_id, unit_ucum, high, reference_id, source)
         VALUES ($1, $2, 'obs.glucose', 'mmol/L', 3, 'FX-2', 'fixture')`,
        [lv.id, testId],
      ),
    ).rejects.toThrow(/frozen/);
    await expect(
      pg.query(`UPDATE critical_limit_versions SET status = 'draft' WHERE id = $1`, [lv.id]),
    ).rejects.toThrow(/moves forward/);
    await expect(
      pg.query(`UPDATE critical_limit_versions SET cso_signed_by = $2 WHERE id = $1`, [
        lv.id,
        lead,
      ]),
    ).rejects.toThrow();
  });

  it("a measure is immutable; only superseded_by is set, once", async () => {
    const m = await one<{ id: string }>(
      `SELECT id FROM lab_component_measures WHERE hospital_id = $1`,
      [hA],
    );
    await expect(
      pg.query(`UPDATE lab_component_measures SET unit_ucum = 'mg/dL' WHERE id = $1`, [m.id]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pg.query(`DELETE FROM lab_component_measures WHERE id = $1`, [m.id]),
    ).rejects.toThrow(/never deleted/);
  });

  it("a form number is entered once", async () => {
    await expect(
      pg.query(
        `UPDATE downtime_form_numbers SET state = 'voided', voided_reason = 'fixture' WHERE hospital_id = $1 AND number = 1`,
        [hA],
      ),
    ).rejects.toThrow(/already entered/);
  });

  it("SMS templates need two different approvers", async () => {
    const t = await one<{ id: string }>(`SELECT id FROM lab_sms_templates WHERE kind = 'level0'`);
    await expect(
      pg.query(
        `UPDATE lab_sms_templates SET status = 'approved', first_approver = $2, approved_by = $2 WHERE id = $1`,
        [t.id, recipient],
      ),
    ).rejects.toThrow(/lst_two_approvers/);
  });

  it("the cut-over needs a second approver", async () => {
    const c = await one<{ id: string; requested_by: string }>(
      `SELECT id, requested_by FROM lab_cutover WHERE hospital_id = $1`,
      [hA],
    );
    await expect(
      pg.query(`UPDATE lab_cutover SET approved_by = $2, switched_at = now() WHERE id = $1`, [
        c.id,
        c.requested_by,
      ]),
    ).rejects.toThrow(/lc_second_approver/);
  });

  it("the per-user realtime topic reaches only its user, and carries no patient detail", async () => {
    await pg.query(`SELECT private.notify_user($1, 'created', $2)`, [recipient, alertId]);
    const msg = await one<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM realtime.messages WHERE topic = $1 ORDER BY id DESC LIMIT 1`,
      [`user:${recipient}`],
    );
    expect(Object.keys(msg.payload).sort()).toEqual(["alertId", "at", "kind"]);
    const hear = (userId: string, topic: string) =>
      actAs(pg, { userId, role: "authenticated" }, async (tx) => {
        await tx.query(`SELECT set_config('realtime.topic', $1, true)`, [topic]);
        return (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM realtime.messages`))
          .rows[0]!.n;
      });
    expect(await hear(recipient, `user:${recipient}`)).toBeGreaterThan(0);
    expect(await hear(stranger, `user:${recipient}`)).toBe(0);
  });
});
