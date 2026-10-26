/**
 * 0189 (ADR 0414): the patient's own conditions, allergies and family history. The patient writes
 * and retires their own rows and nothing else; an edit retires the row it replaces; an allergy
 * retires "no known allergies"; nobody deletes; the care team reads active rows, a stranger nothing.
 * Runs only with EMR_PGLITE=1 (see _pglite.ts).
 */
import type { Lane } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  actAs,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
  probe,
} from "./_pglite";

describe.skipIf(!laneOn)("0189 patient_reported_history", () => {
  let lane: Lane;
  let pt: string;
  let other: string;
  let doc: string;
  let stranger: string;
  let hospitalId: string;
  let row: string;
  let nka: string;

  beforeAll(async () => {
    lane = await bootLane();
    const { pg } = lane;
    hospitalId = await hospital(pg);
    const dep = await department(pg, hospitalId);
    pt = await patient(pg);
    other = await patient(pg);
    doc = (await clinician(pg, { hospitalId, departmentId: dep })).userId;
    stranger = (await clinician(pg, { hospitalId, departmentId: dep })).userId;
    await encounter(pg, { hospitalId, patientUserId: pt, clinicianUserId: doc });
    row = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id, onset_year)
         VALUES ($1, 'condition', 'hypertension', 2019) RETURNING id`,
        [pt],
      )
    ).rows[0]!.id;
    nka = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.patient_reported_history (patient_user_id, kind) VALUES ($1, 'no_known_allergies') RETURNING id`,
        [pt],
      )
    ).rows[0]!.id;
  }, 120_000);

  const me = () => ({ userId: pt, role: "authenticated" as const });

  it("the patient inserts their own rows in the catalogue's shape, never someone else's", async () => {
    const ok = await probe(
      lane.pg,
      me(),
      `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id, relation)
       VALUES ($1, 'family', 'diabetes', 'mother') RETURNING id`,
      [pt],
    );
    expect(ok.ok).toBe(true);
    const theirs = await probe(
      lane.pg,
      me(),
      `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id) VALUES ($1, 'condition', 'gout')`,
      [other],
    );
    expect(theirs.ok).toBe(false);
    const badShape = await probe(
      lane.pg,
      me(),
      `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id) VALUES ($1, 'family', 'diabetes')`,
      [pt],
    );
    expect(badShape.ok).toBe(false);
    const otherNoText = await probe(
      lane.pg,
      me(),
      `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id) VALUES ($1, 'condition', 'other')`,
      [pt],
    );
    expect(otherNoText.ok).toBe(false);
  });

  it("retires but never revives, edits, or deletes", async () => {
    const retire = await probe(
      lane.pg,
      me(),
      `UPDATE public.patient_reported_history SET state = 'removed', removed_at = now() WHERE id = $1`,
      [row],
    );
    expect(retire.ok && retire.affected).toBe(1);
    const edit = await probe(
      lane.pg,
      me(),
      `UPDATE public.patient_reported_history SET onset_year = 2001 WHERE id = $1`,
      [row],
    );
    expect(edit.ok).toBe(false);
    const del = await probe(
      lane.pg,
      me(),
      `DELETE FROM public.patient_reported_history WHERE id = $1`,
      [row],
    );
    expect(del.ok).toBe(false);
  });

  it("an edit retires the row it replaces; an allergy retires no-known-allergies", async () => {
    const states = await actAs(lane.pg, me(), async (tx) => {
      await tx.query(
        `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id, onset_year, resolved, supersedes_id)
         VALUES ($1, 'condition', 'hypertension', 2018, true, $2)`,
        [pt, row],
      );
      await tx.query(
        `INSERT INTO public.patient_reported_history (patient_user_id, kind, item_id, reactions, severity)
         VALUES ($1, 'allergy', 'penicillins', '{rash}', 'mild')`,
        [pt],
      );
      return (
        await tx.query<{ id: string; state: string }>(
          `SELECT id, state FROM public.patient_reported_history WHERE id = ANY($1)`,
          [[row, nka]],
        )
      ).rows;
    });
    expect(states.every((s) => s.state === "removed")).toBe(true);
  });

  it("the care team reads active rows; a clinician with no relationship reads nothing", async () => {
    const team = await probe(
      lane.pg,
      { userId: doc, role: "authenticated" },
      `SELECT id FROM public.patient_reported_history WHERE patient_user_id = $1`,
      [pt],
    );
    expect(team.ok && team.rows.length).toBe(2);
    const none = await probe(
      lane.pg,
      { userId: stranger, role: "authenticated" },
      `SELECT id FROM public.patient_reported_history WHERE patient_user_id = $1`,
      [pt],
    );
    expect(none.ok && none.rows.length).toBe(0);
    const reader = await probe(
      lane.pg,
      { userId: doc, role: "medsync_clinical_reader", hospitalId },
      `SELECT id FROM public.patient_reported_history WHERE patient_user_id = $1`,
      [pt],
    );
    expect(reader.ok && reader.rows.length).toBe(2);
  });
});
