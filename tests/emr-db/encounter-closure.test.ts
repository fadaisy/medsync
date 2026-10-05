/**
 * Migration 0091 on the PGlite lane (ADRs 0198–0200, 0203): the admission functions write the admission, the bed
 * and the close in one transaction; Arriving becomes Occupied on arrival, which opens the inpatient encounter and
 * ends nursing elsewhere; the guards keep admissions, assignments and summary decisions as written; RLS reads.
 * Runs only with EMR_PGLITE=1 (see _pglite.ts).
 */
import { randomUUID } from "node:crypto";
import type { Pg } from "./_pglite";
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
} from "./_pglite";

const BOOT_MS = 180_000;

describe.skipIf(!laneOn)("0091 — admission with a bed, on real SQL", () => {
  let pg: Pg;
  let h: string;
  let dept: string;
  let doctor: string;
  let nurse: string;
  let ward: string;
  let otherWard: string;
  let beds: Record<string, string>;

  beforeAll(async () => {
    pg = (await bootLane()).pg;
    h = await hospital(pg, "Closure");
    dept = await department(pg, h);
    doctor = (await staff(pg, { hospitalId: h, departmentId: dept })).userId;
    nurse = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "NURSE" })).userId;
    ward = await makeWard(["1", "2", "3", "4"]);
    otherWard = await makeWard(["E1"]);
    beds = Object.fromEntries(
      (
        await pg.query<{ id: string; label: string }>(
          `SELECT id, label FROM public.hospital_beds WHERE ward_id = $1`,
          [ward],
        )
      ).rows.map((r) => [r.label, r.id]),
    );
  }, BOOT_MS);

  async function makeWard(labels: string[]): Promise<string> {
    const s = randomUUID().slice(0, 8);
    const id = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug, bed_count)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [h, dept, `Medical ${s}`, `med-${s}`, labels.length],
      )
    ).rows[0]!.id;
    for (const label of labels)
      await pg.query(
        `INSERT INTO public.hospital_beds (hospital_id, ward_id, label) VALUES ($1, $2, $3)`,
        [h, id, label],
      );
    return id;
  }

  async function visit() {
    const p = await patient(pg);
    const e = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doctor,
      departmentId: dept,
    });
    return { p, e };
  }

  const call = async (fn: string, payload: Record<string, unknown>) =>
    (
      await pg.query<{ r: Record<string, unknown> }>(`SELECT public.${fn}($1::jsonb) AS r`, [
        JSON.stringify(payload),
      ])
    ).rows[0]!.r;

  const refusal = async (fn: string, payload: Record<string, unknown>) => {
    try {
      await call(fn, payload);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error(`${fn} should have refused`);
  };

  const row = async (sql: string, params: unknown[]) =>
    (await pg.query<Record<string, unknown>>(sql, params)).rows[0]!;

  it("admits with a bed: the admission, an Arriving assignment and the close, together", async () => {
    const { p, e } = await visit();
    const r = await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: ward,
      bed_id: beds["1"],
      disposition_detail: { plan_said: "admit" },
    });
    expect(r.bed).toBe("1");
    const adm = await row(`SELECT * FROM public.admissions WHERE id = $1`, [r.admission_id]);
    expect(adm).toMatchObject({
      status: "bed_allocated",
      patient_user_id: p,
      source_encounter_id: e,
    });
    const asg = await row(`SELECT * FROM public.bed_assignments WHERE id = $1`, [r.assignment_id]);
    expect(asg).toMatchObject({ admission_id: r.admission_id, arrived_at: null, ended_at: null });
    const enc = await row(
      `SELECT state, disposition, closure_kind, completed_by, disposition_detail FROM public.encounters WHERE id = $1`,
      [e],
    );
    expect(enc).toMatchObject({
      state: "completed",
      disposition: "admitted",
      closure_kind: "clinical",
      completed_by: doctor,
    });
    expect(enc.disposition_detail).toMatchObject({
      plan_said: "admit",
      admission_id: r.admission_id,
      ward_id: ward,
      bed: "1",
    });
    const ev = await row(
      `SELECT label FROM public.encounter_events WHERE encounter_id = $1 AND kind = 'disposition'`,
      [e],
    );
    expect(ev.label).toMatch(/admitted to Medical .*, bed 1$/);
  });

  it("refuses a bed that was just taken, and writes nothing for the second visit", async () => {
    const first = await visit();
    await call("admit_from_encounter", {
      encounter_id: first.e,
      actor: doctor,
      ward_id: ward,
      bed_id: beds["2"],
    });
    const second = await visit();
    const msg = await refusal("admit_from_encounter", {
      encounter_id: second.e,
      actor: doctor,
      ward_id: ward,
      bed_id: beds["2"],
    });
    expect(msg).toMatch(/^AD409 Bed 2 was just taken/);
    expect((await row(`SELECT state FROM public.encounters WHERE id = $1`, [second.e])).state).toBe(
      "in_progress",
    );
    const n = await row(
      `SELECT count(*)::int AS n FROM public.admissions WHERE patient_user_id = $1`,
      [second.p],
    );
    expect(n.n).toBe(0);
  });

  it("refuses a bed being cleaned, and needs a reason to admit without a bed", async () => {
    await pg.query(
      `INSERT INTO public.bed_state_events (hospital_id, bed_id, state, set_by) VALUES ($1, $2, 'cleaning', $3)`,
      [h, beds["3"], nurse],
    );
    const { e } = await visit();
    expect(
      await refusal("admit_from_encounter", {
        encounter_id: e,
        actor: doctor,
        ward_id: ward,
        bed_id: beds["3"],
      }),
    ).toMatch(/being cleaned/);
    expect(
      await refusal("admit_from_encounter", { encounter_id: e, actor: doctor, ward_id: ward }),
    ).toMatch(/^AD400/);
    const r = await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: ward,
      bed_wait_reason: "no_free_bed",
    });
    expect(r.assignment_id).toBeNull();
    const adm = await row(`SELECT status, bed_wait_reason FROM public.admissions WHERE id = $1`, [
      r.admission_id,
    ]);
    expect(adm).toEqual({ status: "awaiting_bed", bed_wait_reason: "no_free_bed" });
    const enc = await row(`SELECT disposition_detail FROM public.encounters WHERE id = $1`, [e]);
    expect(enc.disposition_detail).toMatchObject({ bed: "waiting" });
  });

  it("keeps one open admission per patient", async () => {
    const { p, e } = await visit();
    await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: ward,
      bed_wait_reason: "floor",
    });
    const again = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doctor,
      departmentId: dept,
    });
    expect(
      await refusal("admit_from_encounter", {
        encounter_id: again,
        actor: doctor,
        ward_id: ward,
        bed_wait_reason: "floor",
      }),
    ).toMatch(/already has an open admission/);
  });

  it("Arrived: the bed is Occupied, the inpatient encounter opens once, nursing elsewhere ends", async () => {
    const { p, e } = await visit();
    const r = await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: ward,
      bed_id: beds["4"],
    });
    const nursing = async (wardId: string) =>
      (
        await pg.query<{ id: string }>(
          `INSERT INTO public.nursing_assignments (hospital_id, ward_id, department_id, nurse_user_id, patient_user_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [h, wardId, dept, nurse, p],
        )
      ).rows[0]!.id;
    const inEu = await nursing(otherWard);
    const onWard = await nursing(ward);

    const done = await call("confirm_bed_arrival", {
      hospital_id: h,
      assignment_id: r.assignment_id,
      actor: nurse,
    });
    expect(done.nursing_ended).toBe(1);
    const enc = await row(
      `SELECT encounter_type, state, clinician_user_id, department_id, visit_id FROM public.encounters WHERE id = $1`,
      [done.inpatient_encounter_id],
    );
    expect(enc).toEqual({
      encounter_type: "inpatient",
      state: "in_progress",
      clinician_user_id: doctor,
      department_id: dept,
      visit_id: null,
    });
    const adm = await row(
      `SELECT status, arrived_by, inpatient_encounter_id FROM public.admissions WHERE id = $1`,
      [r.admission_id],
    );
    expect(adm).toEqual({
      status: "arrived",
      arrived_by: nurse,
      inpatient_encounter_id: done.inpatient_encounter_id,
    });
    const ends = await pg.query<{ id: string; ended: boolean }>(
      `SELECT id, ends_at IS NOT NULL AS ended FROM public.nursing_assignments WHERE id = ANY($1::uuid[])`,
      [[inEu, onWard]],
    );
    expect(Object.fromEntries(ends.rows.map((x) => [x.id, x.ended]))).toEqual({
      [inEu]: true,
      [onWard]: false,
    });
    expect(
      await refusal("confirm_bed_arrival", {
        hospital_id: h,
        assignment_id: r.assignment_id,
        actor: nurse,
      }),
    ).toMatch(/Nobody is arriving/);
  });

  it("cancels an allocation back to the waiting list, re-allocates, then ends the admission", async () => {
    const extra = await makeWard(["X1", "X2"]);
    const [x1, x2] = (
      await pg.query<{ id: string }>(
        `SELECT id FROM public.hospital_beds WHERE ward_id = $1 ORDER BY label`,
        [extra],
      )
    ).rows.map((b) => b.id);
    const { e } = await visit();
    const r = await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: extra,
      bed_id: x1,
    });
    await call("release_admission_bed", {
      hospital_id: h,
      admission_id: r.admission_id,
      actor: nurse,
      reason: "Bed needed for a transfer",
      outcome: "wait",
    });
    const asg = await row(
      `SELECT ended_at IS NOT NULL AS ended, reason FROM public.bed_assignments WHERE id = $1`,
      [r.assignment_id],
    );
    expect(asg).toEqual({ ended: true, reason: "Bed needed for a transfer" });
    expect(
      (await row(`SELECT status FROM public.admissions WHERE id = $1`, [r.admission_id])).status,
    ).toBe("awaiting_bed");

    const again = await call("allocate_admission_bed", {
      hospital_id: h,
      admission_id: r.admission_id,
      bed_id: x2,
      actor: nurse,
    });
    expect(again.bed).toBe("X2");
    await call("release_admission_bed", {
      hospital_id: h,
      admission_id: r.admission_id,
      actor: nurse,
      reason: "Went to theatre instead",
      outcome: "end",
    });
    const adm = await row(
      `SELECT status, cancelled_by, cancel_reason FROM public.admissions WHERE id = $1`,
      [r.admission_id],
    );
    expect(adm).toEqual({
      status: "cancelled",
      cancelled_by: nurse,
      cancel_reason: "Went to theatre instead",
    });
    const open = await row(
      `SELECT count(*)::int AS n FROM public.bed_assignments WHERE admission_id = $1 AND ended_at IS NULL`,
      [r.admission_id],
    );
    expect(open.n).toBe(0);
  });

  it("guards: an admission only moves forward, an arrival is stamped once, nothing is deleted", async () => {
    const { e } = await visit();
    const r = await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: ward,
      bed_wait_reason: "extra_bed",
    });
    await expect(
      pg.query(`UPDATE public.admissions SET ward_id = $2 WHERE id = $1`, [
        r.admission_id,
        otherWard,
      ]),
    ).rejects.toThrow(/Only an admission's status moves/);
    await expect(
      pg.query(`UPDATE public.admissions SET status = 'arrived' WHERE id = $1`, [r.admission_id]),
    ).rejects.toThrow(/cannot go from awaiting_bed to arrived/);
    await expect(
      pg.query(`DELETE FROM public.admissions WHERE id = $1`, [r.admission_id]),
    ).rejects.toThrow(/kept for good/);
  });

  it("RLS: staff read admissions, a patient does not; only the service role runs the functions", async () => {
    const { p, e } = await visit();
    await call("admit_from_encounter", {
      encounter_id: e,
      actor: doctor,
      ward_id: ward,
      bed_wait_reason: "no_free_bed",
    });
    const asDoctor = await probe(
      pg,
      { userId: doctor, role: "authenticated" },
      `SELECT id FROM public.admissions WHERE patient_user_id = $1`,
      [p],
    );
    expect(asDoctor.ok && asDoctor.rows.length).toBe(1);
    const asPatient = await probe(
      pg,
      { userId: p, role: "authenticated" },
      `SELECT id FROM public.admissions WHERE patient_user_id = $1`,
      [p],
    );
    expect(asPatient.ok && asPatient.rows.length).toBe(0);
    const direct = await probe(
      pg,
      { userId: doctor, role: "authenticated" },
      `SELECT public.admit_from_encounter('{}'::jsonb)`,
    );
    expect(direct.ok).toBe(false);
    expect(!direct.ok && direct.error).toMatch(/permission denied/);
  });

  it("visit summaries: the patient reads their own current shared copy only; a decision is kept as made", async () => {
    const { p, e } = await visit();
    const other = await patient(pg);
    const held = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.patient_visit_summaries
           (hospital_id, patient_user_id, encounter_id, version, state, hold_reason, decided_by)
         VALUES ($1, $2, $3, 1, 'held', 'tell_in_person', $4) RETURNING id`,
        [h, p, e, doctor],
      )
    ).rows[0]!.id;
    const read = (who: string) =>
      probe(
        pg,
        { userId: who, role: "authenticated" },
        `SELECT version FROM public.patient_visit_summaries WHERE encounter_id = $1`,
        [e],
      );
    const heldRead = await read(p);
    expect(heldRead.ok && heldRead.rows).toEqual([]);

    const sharedId = randomUUID();
    await pg.query(
      `UPDATE public.patient_visit_summaries SET superseded_at = now(), superseded_by = $2 WHERE id = $1`,
      [held, sharedId],
    );
    await pg.query(
      `INSERT INTO public.patient_visit_summaries
         (id, hospital_id, patient_user_id, encounter_id, version, state, copy_ciphertext, decided_by)
       VALUES ($1, $2, $3, $4, 2, 'shared', 'iv:tag:ct', $5)`,
      [sharedId, h, p, e, doctor],
    );
    const mine = await read(p);
    expect(mine.ok && mine.rows).toEqual([{ version: 2 }]);
    const theirs = await read(other);
    expect(theirs.ok && theirs.rows).toEqual([]);

    await expect(
      pg.query(`UPDATE public.patient_visit_summaries SET copy_ciphertext = 'x' WHERE id = $1`, [
        sharedId,
      ]),
    ).rejects.toThrow(/only superseded, once/);
    await expect(
      pg.query(
        `UPDATE public.patient_visit_summaries SET superseded_at = now(), superseded_by = $2 WHERE id = $1`,
        [held, randomUUID()],
      ),
    ).rejects.toThrow(/only superseded, once/);
    const writes = await probe(
      pg,
      { userId: p, role: "authenticated" },
      `INSERT INTO public.patient_visit_summaries
         (hospital_id, patient_user_id, encounter_id, version, state, copy_ciphertext, decided_by)
       VALUES ($1, $2, $3, 3, 'shared', 'x', $2)`,
      [h, p, e],
    );
    expect(writes.ok).toBe(false);
  });

  it("the old direct assignment by ward staff is still Occupied at once (no admission)", async () => {
    const someone = await authUser(pg, "walkin");
    const extra = await makeWard(["D1"]);
    const bed = (await row(`SELECT id FROM public.hospital_beds WHERE ward_id = $1`, [extra]))
      .id as string;
    await pg.query(
      `INSERT INTO public.bed_assignments (hospital_id, ward_id, bed_id, patient_user_id, started_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [h, extra, bed, someone, nurse],
    );
    await expect(
      pg.query(
        `UPDATE public.bed_assignments SET arrived_at = now(), arrived_by = $2 WHERE bed_id = $1 AND ended_at IS NULL`,
        [bed, nurse],
      ),
    ).rejects.toThrow(/bed_assignments_arrival_check/);
  });
});
