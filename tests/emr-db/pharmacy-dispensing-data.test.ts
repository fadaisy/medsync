/**
 * Pharmacy Phase 1, Step 2 (gate-a-proposal §8–§10): migrations 0122–0130 on the PGlite lane.
 *
 * - RLS probes: every new table × every actor (STOP 2's probe table is generated from this file).
 * - No client writes anywhere; event tables append-only for every role, the service role included.
 * - The stock guard (SL-4, SL-5), Law 3 at commit, signed sets (D-PH1-43), `pharmacy.manage` from the hub,
 *   the go-live two-person rule (RD-2), the controlled witness (PA2-6), the pharmacy's sheet states with the
 *   lab's untouched (D-PH1-46), RQ-12's legal gate, the stock-out projection (SL-9) and the nurse's chip.
 *
 * Runs with EMR_PGLITE=1 (tests/emr-db/_pglite.ts). Every medicine, batch and quantity is a fixture.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, Lane, Pg, PgQueryable } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authUser,
  bootLane,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
  probe,
  staff,
  superadmin,
} from "./_pglite";

const one = async <T = Record<string, unknown>>(pg: PgQueryable, sql: string, p?: unknown[]) =>
  (await pg.query<T>(sql, p)).rows[0] as T;
const id = async (pg: PgQueryable, sql: string, p?: unknown[]) =>
  (await one<{ id: string }>(pg, sql, p)).id;

/** Every table 0122–0130 created, with whether it is an append-only event table. */
const TABLES: [string, boolean][] = [
  ["pharmacy_signed_sets", false],
  ["pharmacy_attestations", true],
  ["pharmacy_products", false],
  ["pharmacy_product_points", false],
  ["pharmacy_national_list_editions", false],
  ["pharmacy_national_list_rows", false],
  ["pharmacy_medicine_links", false],
  ["pharmacy_batches", false],
  ["pharmacy_stock_movements", true],
  ["pharmacy_counts", true],
  ["pharmacy_count_lines", true],
  ["pharmacy_reorder_levels", true],
  ["pharmacy_stock_requests", false],
  ["pharmacy_batch_corrections", true],
  ["pharmacy_stockouts", false],
  ["pharmacy_scope_entries", true],
  ["pharmacy_line_events", true],
  ["pharmacy_queries", true],
  ["pharmacy_query_events", true],
  ["pharmacy_handovers", true],
  ["pharmacy_supplies", true],
  ["pharmacy_supply_reversals", true],
  ["pharmacy_supply_corrections", true],
  ["pharmacy_look_backs", true],
  ["pharmacy_identity_attempts", true],
  ["pharmacy_print_events", true],
  ["pharmacy_slips", true],
  ["pharmacy_patient_notices", true],
  ["pharmacy_controlled_entries", true],
  ["pharmacy_controlled_differences", false],
  ["paper_prescriptions", true],
  ["paper_prescription_lines", true],
  ["pharmacy_golive", false],
  ["pharmacy_briefings", true],
  ["pharmacy_legal_answers", true],
  ["pharmacy_pilot_notes", true],
  ["pharmacy_hospital_settings", false],
  ["prescription_cancellations", true],
  ["prescription_print_events", true],
  ["pharmacy_payment_statuses", true],
  ["pharmacy_notice_acknowledgements", true],
];

/** Tables a prescriber who may prescribe for the patient reads (PA2-5); everything else is pharmacy-only. */
const NATIONAL = new Set([
  "pharmacy_national_list_editions",
  "pharmacy_national_list_rows",
  "pharmacy_medicine_links",
]);

const PRESCRIBER_READS = new Set([
  "pharmacy_queries",
  "pharmacy_query_events",
  "pharmacy_line_events",
  "pharmacy_supplies",
  "prescription_cancellations",
  "prescription_print_events",
  "pharmacy_notice_acknowledgements",
]);

describe.skipIf(!laneOn)("Pharmacy Phase 1 data layer (0122–0130)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    for (const h of ["A", "B"]) {
      f[`h${h}`] = await hospital(pg, `Pharm1 ${h}`);
      f[`pharmDept${h}`] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f[`h${h}`], `pharmacy-${h.toLowerCase()}-${Date.now()}`],
      );
      f[`point${h}`] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, 'Outpatient pharmacy', $3, 'support') RETURNING id`,
        [f[`h${h}`], f[`pharmDept${h}`], `op-${h.toLowerCase()}-${Date.now()}`],
      );
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
        [f[`point${h}`], f[`h${h}`]],
      );
    }
    const clinic = await department(pg, f.hA!, "Clinic");
    f.pharmacist = (
      await staff(pg, { hospitalId: f.hA!, departmentId: f.pointA!, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (
      await staff(pg, { hospitalId: f.hA!, departmentId: f.pointA!, cadre: "PHARMACY_TECH" })
    ).userId;
    f.pharmacistB = (
      await staff(pg, { hospitalId: f.hB!, departmentId: f.pointB!, cadre: "PHARMACIST" })
    ).userId;
    f.doctor = (
      await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    f.nurse = (await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "NURSE" })).userId;
    f.reception = (
      await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "RECEPTION" })
    ).userId;
    f.lab = (
      await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "LAB_TECHNOLOGIST" })
    ).userId;
    f.admin = await authUser(pg, "hospital-admin");
    await pg.query(
      `INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
      [f.admin, f.hA],
    );
    f.superadmin = await superadmin(pg);
    await pg.query(
      `INSERT INTO public.clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
       VALUES ($1, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed')
       ON CONFLICT DO NOTHING`,
      [f.hA],
    );
    f.patient = await patient(pg);
    f.encounter = await encounter(pg, {
      hospitalId: f.hA!,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
    });
    f.rx = await id(
      pg,
      `INSERT INTO public.prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre,
         drug_id, drug_name, dose, route, frequency, is_emergency, state)
       VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', 'fixture_tablet_a', 'Fixture tablet A', '[fixture dose]', 'oral',
               '[fixture frequency]', false, 'active') RETURNING id`,
      [f.hA, f.encounter, f.patient, f.doctor],
    );
    await seedEveryTable();
  }, 180_000);

  /** One row in every new table at hospital A, written as the owner (the server's path). */
  async function seedEveryTable() {
    const { hA, pointA, pharmacist, tech, patient: pt, rx } = f;
    f.signed = await id(
      pg,
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, authored_by)
       VALUES ($1, 'lane_rule', 1, '{"reasons":[]}', repeat('a', 64), $2) RETURNING id`,
      [hA, pharmacist],
    );
    f.attest = await id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, 'witness', 'controlled_supply', 'passed') RETURNING id`,
      [hA, pharmacist, tech],
    );
    f.product = await id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, strength, issue_unit, created_by)
       VALUES ($1, 'fixture_tablet_a', 'Fixture tablet A 28s', '[S1]', 'tablet', $2) RETURNING id`,
      [hA, pharmacist],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
      [f.product, pointA, hA],
    );
    f.edition = await id(
      pg,
      `INSERT INTO public.pharmacy_national_list_editions (name, source_ref, imported_by)
       VALUES ('Fixture list', 'fixture', $1) RETURNING id`,
      [pharmacist],
    );
    f.nlRow = await id(
      pg,
      `INSERT INTO public.pharmacy_national_list_rows (edition_id, generic_name) VALUES ($1, 'Fixture A') RETURNING id`,
      [f.edition],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_medicine_links (medicine_id, row_id, edition_id, linked_by)
       VALUES ('fixture_tablet_a', $1, $2, $3)`,
      [f.nlRow, f.edition, pharmacist],
    );
    f.batch = await batch("FX-001", "2099-12-31");
    f.received = await move(f.batch, "received", 50, { source_kind: "delivery" });
    f.count = await id(
      pg,
      `INSERT INTO public.pharmacy_counts (hospital_id, dispensing_point_id, scope, medicine_id, counted_by)
       VALUES ($1, $2, 'medicine', 'fixture_tablet_a', $3) RETURNING id`,
      [hA, pointA, tech],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_count_lines (count_id, batch_id, counted_quantity, recorded_balance)
       VALUES ($1, $2, 50, 50)`,
      [f.count, f.batch],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_reorder_levels (hospital_id, dispensing_point_id, medicine_id, level, set_by)
       VALUES ($1, $2, 'fixture_tablet_a', NULL, $3)`,
      [hA, pointA, pharmacist],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_scope_entries (hospital_id, prescription_id, dispensing_point_id, brought_by)
       VALUES ($1, $2, $3, $4)`,
      [hA, rx, pointA, tech],
    );
    f.accepted = await id(
      pg,
      `INSERT INTO public.pharmacy_line_events (hospital_id, prescription_id, patient_user_id, dispensing_point_id,
         kind, lane, actor_user_id) VALUES ($1, $2, $3, $4, 'accepted', 'pharmacist_first', $5) RETURNING id`,
      [hA, rx, pt, pointA, pharmacist],
    );
    f.query = await id(
      pg,
      `INSERT INTO public.pharmacy_queries (hospital_id, patient_user_id, scope, prescription_id, type_code, proposal,
         dispensing_point_id, sender_user_id) VALUES ($1, $2, 'line', $3, 'dose_unclear', 'Fixture proposal', $4, $5)
       RETURNING id`,
      [hA, pt, rx, pointA, pharmacist],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_query_events (query_id, hospital_id, kind, recipient_user_id, recipient_role, actor_user_id)
       VALUES ($1, $2, 'notified', $3, 'prescriber', $4)`,
      [f.query, hA, f.doctor, pharmacist],
    );
    f.handover = await handover("seed-handover-0001");
    f.supply = await supply(f.handover, f.batch, 10);
    await pg.query(
      `INSERT INTO public.pharmacy_look_backs (hospital_id, supply_id, kind, reasons, actor_user_id)
       VALUES ($1, $2, 'flagged', '{identity_not_checked}', $3)`,
      [hA, f.supply, tech],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_identity_attempts (hospital_id, patient_user_id, handover_key, identifier, outcome, actor_user_id)
       VALUES ($1, $2, 'seed-handover-0001', 'date_of_birth', 'match', $3)`,
      [hA, pt, tech],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_print_events (hospital_id, dispensing_point_id, kind, ref_id, actor_user_id)
       VALUES ($1, $2, 'label', $3, $4)`,
      [hA, pointA, f.supply, tech],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_slips (hospital_id, dispensing_point_id, code, patient_user_id, prescription_ids, printed_by)
       VALUES ($1, $2, 'ABCD2345', $3, ARRAY[$4::uuid], $5)`,
      [hA, pointA, pt, rx, tech],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_patient_notices (hospital_id, dispensing_point_id, prescription_id, patient_user_id,
         kind, channel, outcome, sent_by) VALUES ($1, $2, $3, $4, 'in_stock', 'in_app', 'not_sent', $5)`,
      [hA, pointA, rx, pt, tech],
    );
    // A second supply to reverse and one to correct.
    const h2 = await handover("seed-handover-0002");
    const s2 = await supply(h2, f.batch, 2);
    const back = await move(f.batch, "reversed", 2, { source_kind: "reversal", source_id: s2 });
    await pg.query(
      `INSERT INTO public.pharmacy_supply_reversals (supply_id, hospital_id, dispensing_point_id, reason_code, pack_fit,
         returned_movement_id, actor_user_id) VALUES ($1, $2, $3, 'handed_back', true, $4, $5)`,
      [s2, hA, pointA, back, pharmacist],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_supply_corrections (supply_id, hospital_id, reason_code, actor_user_id)
       VALUES ($1, $2, 'wrong_patient', $3)`,
      [f.supply, hA, pharmacist],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_controlled_entries (hospital_id, dispensing_point_id, medicine_id, kind, count_id,
         witness_attestation_id, actor_user_id) VALUES ($1, $2, 'fixture_tablet_a', 'count', $3, $4, $5)`,
      [hA, pointA, f.count, f.attest, pharmacist],
    );
    const correction = await move(f.batch, "count_correction", -1, {
      source_kind: "count",
      reason_code: "not_found",
    });
    await pg.query(
      `INSERT INTO public.pharmacy_controlled_differences (hospital_id, dispensing_point_id, count_id, batch_id,
         counted_quantity, recorded_balance, supplier_user_id, witness_attestation_id, correction_movement_id)
       VALUES ($1, $2, $3, $4, 37, 38, $5, $6, $7)`,
      [hA, pointA, f.count, f.batch, pharmacist, f.attest, correction],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_stock_requests (hospital_id, from_point_id, to_point_id, medicine_id, requested_by)
       SELECT $1, $2, $3, 'fixture_tablet_a', $4 WHERE false`,
      [hA, pointA, pointA, tech],
    );
    const period = await id(
      pg,
      `INSERT INTO public.downtime_periods (hospital_id, starts_at, ends_at, reason, recorded_by)
       VALUES ($1, now() - interval '3 hours', now() - interval '1 hour', 'network', $2) RETURNING id`,
      [hA, pharmacist],
    );
    f.period = period;
    f.paper = await id(
      pg,
      `INSERT INTO public.paper_prescriptions (hospital_id, dispensing_point_id, patient_user_id, prescriber_name,
         prescriber_cadre, written_on, sheet_number, transcribed_by)
       VALUES ($1, $2, $3, 'Fixture prescriber', 'Medical officer', current_date, 31, $4) RETURNING id`,
      [hA, pointA, pt, tech],
    );
    await pg.query(
      `INSERT INTO public.paper_prescription_lines (paper_prescription_id, hospital_id, line_no, medicine_as_written,
         directions_as_written) VALUES ($1, $2, 1, 'Fixture tablet A', '[as written]')`,
      [f.paper, hA],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_golive (hospital_id, dispensing_point_id, action, conditions, requested_by)
       VALUES ($1, $2, 'switch_on', '{}', $3)`,
      [hA, pointA, f.admin],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_briefings (hospital_id, audience, held_on, recorded_by)
       VALUES ($1, 'pharmacy', current_date, $2)`,
      [hA, f.admin],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_legal_answers (hospital_id, question, answer, source_ref, given_by, given_on, recorded_by)
       VALUES ($1, 6, 'Fixture answer', 'fixture-ref', 'Fixture adviser', current_date, $2)`,
      [hA, f.admin],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_pilot_notes (hospital_id, dispensing_point_id, note, written_by)
       VALUES ($1, $2, 'A fixture note on how the pilot went, long enough.', $3)`,
      [hA, pointA, pharmacist],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, updated_by) VALUES ($1, $2)`,
      [hA, f.admin],
    );
    await pg.query(
      `INSERT INTO public.prescription_cancellations (prescription_id, hospital_id, patient_user_id, reason_code, actor_user_id)
       SELECT $1, $2, $3, 'fixture', $4 WHERE false`,
      [rx, hA, pt, f.doctor],
    );
    const rx2 = await id(
      pg,
      `INSERT INTO public.prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre,
         drug_id, drug_name, dose, route, frequency, is_emergency, state)
       VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', 'fixture_tablet_b', 'Fixture tablet B', '[fixture dose]', 'oral',
               '[fixture frequency]', false, 'cancelled') RETURNING id`,
      [hA, f.encounter, pt, f.doctor],
    );
    await pg.query(
      `INSERT INTO public.prescription_cancellations (prescription_id, hospital_id, patient_user_id, reason_code, actor_user_id)
       VALUES ($1, $2, $3, 'stopped', $4)`,
      [rx2, hA, pt, f.doctor],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_payment_statuses (hospital_id, patient_user_id, prescription_id, status,
         dispensing_point_id, actor_user_id) VALUES ($1, $2, $3, 'paid', $4, $5)`,
      [hA, pt, rx, pointA, tech],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_notice_acknowledgements (hospital_id, patient_user_id, line_event_id, choice,
         actor_user_id) VALUES ($1, $2, $3, 'left_as_is', $4)`,
      [hA, pt, f.accepted, f.doctor],
    );
    await pg.query(
      `INSERT INTO public.prescription_print_events (prescription_id, hospital_id, patient_user_id, printed_by)
       VALUES ($1, $2, $3, $4)`,
      [rx, hA, pt, f.doctor],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_stock_requests (hospital_id, from_point_id, to_point_id, medicine_id, requested_by)
       VALUES ($1, $2, $3, 'fixture_tablet_a', $4)`,
      [hA, pointA, await secondPoint(), tech],
    );
    // A batch correction (SL-11), and a medicine that ran out (SL-9).
    const fx2 = await batch("FX-002", "2099-06-30");
    await pg.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO public.pharmacy_batch_corrections (batch_id, hospital_id, old_batch_number, new_batch_number,
           old_expiry, new_expiry, actor_user_id, reason)
         VALUES ($1, $2, 'FX-002', 'FX-002', '2099-06-30', '2099-07-31', $3, 'Expiry mistyped at receipt')`,
        [fx2, hA, pharmacist],
      );
      await tx.query(`UPDATE public.pharmacy_batches SET expiry = '2099-07-31' WHERE id = $1`, [
        fx2,
      ]);
    });
    const productY = await id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
       VALUES ($1, 'fixture_tablet_y', 'Fixture tablet Y', 'tablet', $2) RETURNING id`,
      [hA, pharmacist],
    );
    const fy = await id(
      pg,
      `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
         first_batch_number, first_expiry, created_by)
       VALUES ($1, $2, $3, 'FY-1', '2099-01-01', 'FY-1', '2099-01-01', $4) RETURNING id`,
      [hA, pointA, productY, tech],
    );
    await move(fy, "received", 1, { source_kind: "delivery" });
    await move(fy, "adjusted", -1, { source_kind: "adjustment", reason_code: "damaged" });
  }

  async function secondPoint() {
    if (f.point2) return f.point2;
    f.point2 = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
       VALUES ($1, $2, 'Inpatient pharmacy', $3, 'support') RETURNING id`,
      [f.hA, f.pharmDeptA, `ip-${Date.now()}`],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'wards')`,
      [f.point2, f.hA],
    );
    return f.point2;
  }

  async function batch(number: string, expiry: string, monthOnly = false, db: PgQueryable = pg) {
    return id(
      db,
      `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
         expiry_month_only, first_batch_number, first_expiry, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $4, $5, $7) RETURNING id`,
      [f.hA, f.pointA, f.product, number, expiry, monthOnly, f.tech],
    );
  }

  async function move(
    batchId: string,
    kind: string,
    quantity: number,
    o: { source_kind: string; source_id?: string; reason_code?: string; downtime?: boolean },
    db: PgQueryable = pg,
  ) {
    return id(
      db,
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind, source_id, reason_code, downtime)
       VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8, $9, $10) RETURNING id`,
      [
        f.hA,
        f.pointA,
        batchId,
        kind,
        quantity,
        f.tech,
        o.source_kind,
        o.source_id ?? null,
        o.reason_code ?? null,
        o.downtime ?? false,
      ],
    );
  }

  async function handover(key: string, db: PgQueryable = pg) {
    return id(
      db,
      `INSERT INTO public.pharmacy_handovers (hospital_id, dispensing_point_id, patient_user_id, collector,
         identity_route, second_identifier, label_mode, actor_user_id, client_key)
       VALUES ($1, $2, $3, 'patient', 'two_identifiers', 'date_of_birth', 'printed', $4, $5) RETURNING id`,
      [f.hA, f.pointA, f.patient, f.tech, key],
    );
  }

  /** A supply and its movement, as recordHandover writes them: one transaction. */
  async function supply(
    handoverId: string,
    batchId: string,
    quantity: number,
    db?: PgQueryable,
  ): Promise<string> {
    if (!db) return pg.transaction((tx) => supply(handoverId, batchId, quantity, tx));
    const supplyId = await id(
      db,
      `INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id, supplying_hospital_id,
         patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, supplied_at)
       VALUES ($1, $2, $3, $2, $4, $5, $6, $7, $8, 'tablet', now()) RETURNING id`,
      [handoverId, f.hA, f.pointA, f.patient, f.rx, f.product, batchId, quantity],
    );
    await move(batchId, "supplied", -quantity, { source_kind: "supply", source_id: supplyId }, db);
    return supplyId;
  }

  const reader = (userId: string | undefined, hospitalId = f.hA): Actor => ({
    userId: userId ?? null,
    role: "medsync_clinical_reader",
    hospitalId,
  });

  const visible = async (actor: Actor, table: string) => {
    const r = await probe(pg, actor, `SELECT count(*)::int AS n FROM public.${table}`);
    return r.ok ? (r.rows[0]!.n as number) : `error: ${r.error}`;
  };

  /* ─── RLS probes ──────────────────────────────────────────────────── */

  it.each(TABLES.map(([t]) => t))("%s: the pharmacy of the hospital reads it", async (t) => {
    const pharmacistSees = await visible(reader(f.pharmacist), t);
    const techSees = await visible(reader(f.tech), t);
    if (t === "pharmacy_attestations") {
      // Attestations are for the in-charge only (pharmacy.manage); neither holds a hub assignment here.
      expect([pharmacistSees, techSees]).toEqual([0, 0]);
    } else {
      expect(String(pharmacistSees)).toMatch(/^[1-9]/);
      expect(techSees).toBe(pharmacistSees);
    }
  });

  it.each(TABLES.map(([t]) => t))(
    "%s: another hospital's pharmacist, nurses, reception, lab, admins, superadmin read nothing",
    async (t) => {
      const actors: Actor[] = [
        reader(f.pharmacistB, f.hB),
        reader(f.pharmacistB, f.hA),
        reader(f.nurse),
        reader(f.reception),
        reader(f.lab),
        reader(f.admin),
        reader(f.superadmin),
        reader(undefined),
      ];
      const seen = await Promise.all(actors.map((a) => visible(a, t)));
      // The national list is national reference data: another hospital's pharmacy reads it at its own
      // hospital (the first actor). Everyone else, and that pharmacist at the wrong hospital, reads nothing.
      if (NATIONAL.has(t)) expect(seen.shift()).toBeGreaterThan(0);
      expect(seen).toEqual(seen.map(() => 0));
    },
  );

  it.each(TABLES.map(([t]) => t))(
    "%s: the prescriber reads it only where PA2-5 says, and never stock",
    async (t) => {
      const n = await visible(reader(f.doctor), t);
      if (PRESCRIBER_READS.has(t)) expect(n).toBeGreaterThan(0);
      else expect(n).toBe(0);
    },
  );

  it.each(TABLES.map(([t]) => t))(
    "%s: anon and authenticated clients cannot read or write it",
    async (t) => {
      for (const role of ["anon", "authenticated"] as const) {
        const actor: Actor = { userId: role === "anon" ? null : f.pharmacist!, role };
        const read = await probe(pg, actor, `SELECT 1 FROM public.${t} LIMIT 1`);
        expect(read.ok).toBe(false);
        const write = await probe(pg, actor, `DELETE FROM public.${t}`);
        expect(write.ok).toBe(false);
      }
      const asReader = await probe(pg, reader(f.pharmacist), `DELETE FROM public.${t}`);
      expect(asReader.ok).toBe(false);
    },
  );

  /* ─── Append-only, every role ─────────────────────────────────────── */

  it.each(TABLES.filter(([, ao]) => ao).map(([t]) => t))(
    "%s: UPDATE and DELETE are refused for the owner and for the service role",
    async (t) => {
      const col = t === "pharmacy_count_lines" ? "counted_quantity" : "hospital_id";
      for (const sql of [`UPDATE public.${t} SET ${col} = ${col}`, `DELETE FROM public.${t}`]) {
        const asOwner = await pg
          .transaction(async (tx) => {
            await tx.query(sql);
            await tx.rollback();
            return "ran";
          })
          .catch((e: Error) => e.message);
        expect(asOwner).toMatch(/append-only/);
        const asService = await pg
          .transaction(async (tx) => {
            await tx.exec("SET LOCAL ROLE service_role");
            await tx.query(sql);
            await tx.rollback();
            return "ran";
          })
          .catch((e: Error) => e.message);
        expect(asService).toMatch(/append-only|permission denied/);
      }
    },
  );

  /* ─── The stock guard (SL-4, SL-5, DT-7) ──────────────────────────── */

  it("refuses a live movement that would take a batch below zero, naming what it holds", async () => {
    const r = await pg
      .transaction(async (tx) => {
        const b = await batch("FX-LOW", "2099-01-31", false, tx);
        await move(b, "received", 3, { source_kind: "delivery" }, tx);
        await move(b, "transfer_out", -4, { source_kind: "transfer" }, tx);
        await tx.rollback();
        return "ran";
      })
      .catch((e: Error) => e.message);
    expect(r).toMatch(/batch FX-LOW holds 3/);
  });

  it("lets a back-entered movement go below zero (DT-7)", async () => {
    const r = await pg.transaction(async (tx) => {
      const b = await batch("FX-DT", "2099-01-31", false, tx);
      await move(b, "transfer_out", -4, { source_kind: "downtime", downtime: true }, tx);
      const { s } = await one<{ s: number }>(
        tx,
        `SELECT sum(quantity)::int AS s FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
        [b],
      );
      await tx.rollback();
      return s;
    });
    expect(r).toBe(-4);
  });

  it("refuses a live supply from an expired batch; a month-only expiry runs to the month's end (SL-5)", async () => {
    const expired = await pg
      .transaction(async (tx) => {
        const b = await batch("FX-OLD", "2020-01-01", false, tx);
        await move(b, "received", 5, { source_kind: "delivery" }, tx);
        const h = await handover("expired-handover-01", tx);
        await supply(h, b, 1, tx);
        await tx.rollback();
        return "ran";
      })
      .catch((e: Error) => e.message);
    expect(expired).toMatch(/expired on 2020-01-01/);
    const { d } = await one<{ d: string }>(
      pg,
      `SELECT private.pharmacy_expires_on('2027-02-01', true)::text AS d`,
    );
    expect(d).toBe("2027-02-28");
  });

  it("refuses a batch number already at the point (SL-3)", async () => {
    const r = await pg
      .transaction(async (tx) => {
        await batch("FX-001", "2098-01-01", false, tx);
        await tx.rollback();
        return "ran";
      })
      .catch((e: Error) => e.message);
    expect(r).toMatch(/duplicate key|unique/);
  });

  it("changes a batch's number or expiry only beside a correction, and keeps the first values (SL-11)", async () => {
    const bare = await pg
      .transaction(async (tx) => {
        await tx.query(`UPDATE public.pharmacy_batches SET expiry = '2098-01-01' WHERE id = $1`, [
          f.batch,
        ]);
        await tx.rollback();
        return "ran";
      })
      .catch((e: Error) => e.message);
    expect(bare).toMatch(/correction is recorded first/);
    const corrected = await pg.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO public.pharmacy_batch_corrections (batch_id, hospital_id, old_batch_number, new_batch_number,
           old_expiry, new_expiry, actor_user_id, reason)
         VALUES ($1, $2, 'FX-001', 'FX-001', '2099-12-31', '2098-01-01', $3, 'Expiry mistyped at receipt')`,
        [f.batch, f.hA, f.pharmacist],
      );
      await tx.query(`UPDATE public.pharmacy_batches SET expiry = '2098-01-01' WHERE id = $1`, [
        f.batch,
      ]);
      const row = await one<{ expiry: string; first_expiry: string }>(
        tx,
        `SELECT expiry::text, first_expiry::text FROM public.pharmacy_batches WHERE id = $1`,
        [f.batch],
      );
      await tx.rollback();
      return row;
    });
    expect(corrected).toEqual({ expiry: "2098-01-01", first_expiry: "2099-12-31" });
  });

  it("locks a product's issue unit once stock has moved (CT-4)", async () => {
    const r = await pg
      .transaction(async (tx) => {
        await tx.query(`UPDATE public.pharmacy_products SET issue_unit = 'strip' WHERE id = $1`, [
          f.product,
        ]);
        await tx.rollback();
        return "ran";
      })
      .catch((e: Error) => e.message);
    expect(r).toMatch(/issue unit is fixed/);
  });

  /* ─── Law 3 at commit ─────────────────────────────────────────────── */

  const atCommit = (fn: (tx: PgQueryable) => Promise<unknown>) =>
    pg
      .transaction(async (tx) => {
        await fn(tx);
        await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
        await tx.rollback();
        return "committed";
      })
      .catch((e: Error) => e.message);

  it("a supply with its movement commits", async () => {
    expect(
      await atCommit(async (tx) => supply(await handover("law3-ok-0001", tx), f.batch!, 1, tx)),
    ).toBe("committed");
  });

  it("a supply without its movement does not commit", async () => {
    const r = await atCommit(async (tx) => {
      const h = await handover("law3-bare-0001", tx);
      await tx.query(
        `INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id, supplying_hospital_id,
           patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, supplied_at)
         VALUES ($1, $2, $3, $2, $4, $5, $6, $7, 1, 'tablet', now())`,
        [h, f.hA, f.pointA, f.patient, f.rx, f.product, f.batch],
      );
    });
    expect(r).toMatch(/exactly one is required \(Law 3\)/);
  });

  it("a supplied movement without its supply does not commit", async () => {
    const r = await atCommit((tx) => move(f.batch!, "supplied", -1, { source_kind: "supply" }, tx));
    expect(r).toMatch(/without its supply \(Law 3\)/);
  });

  it("a supply whose movement takes a different quantity does not commit", async () => {
    const r = await atCommit(async (tx) => {
      const h = await handover("law3-diff-0001", tx);
      const s = await id(
        tx,
        `INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id, supplying_hospital_id,
           patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, supplied_at)
         VALUES ($1, $2, $3, $2, $4, $5, $6, $7, 2, 'tablet', now()) RETURNING id`,
        [h, f.hA, f.pointA, f.patient, f.rx, f.product, f.batch],
      );
      await move(f.batch!, "supplied", -1, { source_kind: "supply", source_id: s }, tx);
    });
    expect(r).toMatch(/disagree on batch, point or quantity/);
  });

  it("a hand-over's client key is written once (SU-10)", async () => {
    const r = await atCommit((tx) => handover("seed-handover-0001", tx));
    expect(r).toMatch(/duplicate key|unique/);
  });

  /* ─── Signed sets (D-PH1-43) ──────────────────────────────────────── */

  it("signing needs a second signer or a written exception, and signed content never changes", async () => {
    const same = await atCommit((tx) =>
      tx.query(
        `UPDATE public.pharmacy_signed_sets SET status = 'signed', first_signer = $2, second_signer = $2,
           signed_at = now() WHERE id = $1`,
        [f.signed, f.pharmacist],
      ),
    );
    expect(same).toMatch(/pss_signed/);
    const withException = await pg.transaction(async (tx) => {
      await tx.query(
        `UPDATE public.pharmacy_signed_sets SET status = 'signed', first_signer = $2, signed_at = now(),
           exception_text = 'No second eligible person at this hospital yet' WHERE id = $1`,
        [f.signed, f.pharmacist],
      );
      const edit = await tx
        .query(
          `UPDATE public.pharmacy_signed_sets SET content = '{"reasons":["x"]}' WHERE id = $1`,
          [f.signed],
        )
        .then(() => "edited")
        .catch((e: Error) => e.message);
      await tx.rollback();
      return edit;
    });
    expect(withException).toMatch(/only retires; its content never changes/);
  });

  /* ─── Permissions in SQL agree with the map; manage comes from the hub ── */

  it("private.pharmacy_cadre_permissions equals permission map v2 for every cadre", async () => {
    const map = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/pharmacy/permission-map.v2.json"), "utf8"),
    ) as { cadres: Record<string, string[]> };
    for (const cadre of [
      ...Object.keys(map.cadres),
      "NURSE",
      "MEDICAL_OFFICER",
      "LAB_TECHNOLOGIST",
    ]) {
      const { p } = await one<{ p: string[] }>(
        pg,
        `SELECT private.pharmacy_cadre_permissions($1) AS p`,
        [cadre],
      );
      expect(new Set(p)).toEqual(new Set(map.cadres[cadre] ?? []));
    }
  });

  it("pharmacy.manage is held while a hub head assignment on a dispensing point is open (PA2-3)", async () => {
    const can = (tx: PgQueryable) =>
      one<{ c: boolean }>(tx, `SELECT private.pharmacy_can_user($1, $2, 'pharmacy.manage') AS c`, [
        f.tech,
        f.hA,
      ]);
    const r = await pg.transaction(async (tx) => {
      const before = (await can(tx)).c;
      await tx.query(
        `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
        [f.hA, f.pointA, f.tech],
      );
      const during = (await can(tx)).c;
      await tx.query(
        `UPDATE public.department_heads SET ends_at = now() - interval '1 second' WHERE user_id = $1`,
        [f.tech],
      );
      const after = (await can(tx)).c;
      const nurseHead = await one<{ c: boolean }>(
        tx,
        `WITH h AS (INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day'))
         SELECT private.pharmacy_can_user($3, $1, 'pharmacy.manage') AS c`,
        [f.hA, f.pointA, f.nurse],
      );
      await tx.rollback();
      return [before, during, after, nurseHead.c];
    });
    expect(r).toEqual([false, true, false, false]);
  });

  /* ─── Going live, settings, controlled, downtime ──────────────────── */

  it("the requester cannot approve their own go-live; another person's approval stamps the point (RD-2)", async () => {
    const self = await atCommit((tx) =>
      tx.query(
        `UPDATE public.pharmacy_golive SET approved_by = requested_by, approved_at = now()
          WHERE dispensing_point_id = $1`,
        [f.pointA],
      ),
    );
    expect(self).toMatch(/pg_second_person/);
    const live = await pg.transaction(async (tx) => {
      await tx.query(
        `UPDATE public.pharmacy_golive SET approved_by = $2, approved_at = now() WHERE dispensing_point_id = $1`,
        [f.pointA, f.pharmacist],
      );
      const r = await one<{ live: boolean }>(
        tx,
        `SELECT live_at IS NOT NULL AS live FROM public.pharmacy_dispensing_points WHERE department_id = $1`,
        [f.pointA],
      );
      await tx.rollback();
      return r.live;
    });
    expect(live).toBe(true);
  });

  it("supply without a pharmacist needs a second approver and legal question 1 on record (RQ-12)", async () => {
    const noLegal = await atCommit((tx) =>
      tx.query(
        `UPDATE public.pharmacy_hospital_settings SET supply_without_pharmacist = true,
           supply_without_pharmacist_requested_by = $2, supply_without_pharmacist_approved_by = $3 WHERE hospital_id = $1`,
        [f.hA, f.admin, f.pharmacist],
      ),
    );
    expect(noLegal).toMatch(/legal question 1/);
    const withLegal = await atCommit(async (tx) => {
      await tx.query(
        `INSERT INTO public.pharmacy_legal_answers (question, answer, source_ref, given_by, given_on, recorded_by)
         VALUES (1, 'Fixture interim answer', 'fixture-ref', 'Fixture adviser', current_date, $1)`,
        [f.admin],
      );
      await tx.query(
        `UPDATE public.pharmacy_hospital_settings SET supply_without_pharmacist = true,
           supply_without_pharmacist_requested_by = $2, supply_without_pharmacist_approved_by = $3 WHERE hospital_id = $1`,
        [f.hA, f.admin, f.pharmacist],
      );
    });
    expect(withLegal).toBe("committed");
  });

  it("a controlled entry refuses an attestation that is not a separate, passed witness for this actor (PA2-6)", async () => {
    const selfWitness = await atCommit((tx) =>
      tx.query(
        `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
         VALUES ($1, $2, $2, 'witness', 'controlled_supply', 'passed')`,
        [f.hA, f.pharmacist],
      ),
    );
    expect(selfWitness).toMatch(/pa_not_self/);
    const otherActor = await atCommit((tx) =>
      tx.query(
        `INSERT INTO public.pharmacy_controlled_entries (hospital_id, dispensing_point_id, medicine_id, kind, count_id,
           witness_attestation_id, actor_user_id) VALUES ($1, $2, 'fixture_tablet_a', 'count', $3, $4, $5)`,
        [f.hA, f.pointA, f.count, f.attest, f.tech],
      ),
    );
    expect(otherActor).toMatch(/does not stand for this entry/);
  });

  it("pharmacy sheets move unused → to_enter → complete and never take a lab state (D-PH1-46)", async () => {
    const r = await pg.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO public.downtime_form_numbers (hospital_id, number, reserved_by, workspace, dispensing_point_id)
         VALUES ($1, 9001, $2, 'pharmacy', $3)`,
        [f.hA, f.tech, f.pointA],
      );
      const labState = await tx
        .query(
          `UPDATE public.downtime_form_numbers SET state = 'entered' WHERE number = 9001 AND hospital_id = $1`,
          [f.hA],
        )
        .then(() => "moved")
        .catch((e: Error) => (/dfn_workspace|cannot move/.test(e.message) ? "refused" : e.message));
      return { labState };
    });
    expect(r.labState).toBe("refused");
    const moves = await pg.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO public.downtime_form_numbers (hospital_id, number, reserved_by, workspace, dispensing_point_id)
         VALUES ($1, 9002, $2, 'pharmacy', $3)`,
        [f.hA, f.tech, f.pointA],
      );
      await tx.query(
        `UPDATE public.downtime_form_numbers SET state = 'to_enter', downtime_period_id = $2
          WHERE number = 9002 AND hospital_id = $1`,
        [f.hA, f.period],
      );
      await tx.query(
        `UPDATE public.downtime_form_numbers SET state = 'complete', completed_at = now(), completed_by = $2
          WHERE number = 9002 AND hospital_id = $1`,
        [f.hA, f.tech],
      );
      const back = await tx
        .query(
          `UPDATE public.downtime_form_numbers SET state = 'to_enter' WHERE number = 9002 AND hospital_id = $1`,
          [f.hA],
        )
        .then(() => "moved")
        .catch((e: Error) => e.message);
      await tx.rollback();
      return back;
    });
    expect(moves).toMatch(/cannot move from complete to to_enter/);
  });

  it("projects a stock-out when the unexpired total reaches zero, and ends it on the next receipt (SL-9)", async () => {
    const r = await pg.transaction(async (tx) => {
      const product = await id(
        tx,
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, 'fixture_tablet_z', 'Fixture tablet Z', 'tablet', $2) RETURNING id`,
        [f.hA, f.tech],
      );
      const b = await id(
        tx,
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by) VALUES ($1, $2, $3, 'FZ-1', '2099-01-01', 'FZ-1', '2099-01-01', $4)
         RETURNING id`,
        [f.hA, f.pointA, product, f.tech],
      );
      await move(b, "received", 2, { source_kind: "delivery" }, tx);
      await move(b, "adjusted", -2, { source_kind: "adjustment", reason_code: "damaged" }, tx);
      const open = await one<{ n: number }>(
        tx,
        `SELECT count(*)::int AS n FROM public.pharmacy_stockouts WHERE medicine_id = 'fixture_tablet_z' AND ended_at IS NULL`,
      );
      await move(b, "received", 1, { source_kind: "delivery" }, tx);
      const closed = await one<{ n: number }>(
        tx,
        `SELECT count(*)::int AS n FROM public.pharmacy_stockouts WHERE medicine_id = 'fixture_tablet_z' AND ended_at IS NOT NULL`,
      );
      await tx.rollback();
      return [open.n, closed.n];
    });
    expect(r).toEqual([1, 1]);
  });

  it("the nurse's chip reads one word, and only for a patient the nurse may see (D-PH1-33)", async () => {
    const asDoctor = await probe(
      pg,
      reader(f.doctor),
      `SELECT public.pharmacy_line_review_state($1) AS s`,
      [f.rx],
    );
    expect(asDoctor.ok && asDoctor.rows[0]!.s).toBe("queried");
    const otherHospital = await probe(
      pg,
      reader(f.pharmacistB, f.hB),
      `SELECT public.pharmacy_line_review_state($1) AS s`,
      [f.rx],
    );
    expect(otherHospital.ok && otherHospital.rows[0]!.s).toBe(null);
  });

  it("a query's notification goes to the recipient's own topic, with no PHI (D-PH1-47)", async () => {
    const { payload, topic, event } = await one<{
      payload: Record<string, unknown>;
      topic: string;
      event: string;
    }>(
      pg,
      `SELECT payload, topic, event FROM realtime.messages WHERE topic = 'user:' || $1 ORDER BY id DESC LIMIT 1`,
      [f.doctor],
    );
    expect(event).toBe("pharmacy");
    expect(topic).toBe(`user:${f.doctor}`);
    expect(Object.keys(payload).sort()).toEqual(["at", "kind", "ref"]);
  });
});
