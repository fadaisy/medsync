/**
 * Migration 0101 on the PGlite lane: laboratory staff keep access to the patients whose specimens they
 * hold. Before it, a technologist matched only "open intake" (the patient arrived today and is still
 * waiting), so after midnight or once the visit completed a result could not be released ("No
 * legitimate clinical access to this patient"). Both bodies of the rule must agree (the set form backs
 * RLS). Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import { beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { generateKey } from "@/lib/encryption";
import {
  actAs,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
} from "./_pglite";

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";

describe.skipIf(!laneOn)("0101 — lab_work access basis", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  let doctor: EmrActor;
  let labTech: string;
  let labTechB: string;
  let nurse: string;

  const basis = async (user: string, p: string, h: string) =>
    (
      await pg.query<{ b: string | null }>(`SELECT private.patient_access_basis($1, $2, $3) AS b`, [
        user,
        p,
        h,
      ])
    ).rows[0]!.b;

  const inSet = (user: string, h: string, p: string) =>
    actAs(pg, { userId: user, role: "medsync_clinical_reader", hospitalId: h }, async (tx) =>
      (await tx.query<{ id: string }>(`SELECT private.accessible_patient_ids() AS id`)).rows.some(
        (r) => r.id === p,
      ),
    );

  /** A patient with a lab order placed by the doctor, then the encounter closed: no intake, no active encounter. */
  async function patientWithLabOrder(): Promise<string> {
    const p = await patient(pg);
    const enc = await encounter(pg, {
      hospitalId: hA,
      patientUserId: p,
      clinicianUserId: doctor.userId,
      departmentId: doctor.departmentId!,
    });
    await withPatientWrite(
      doctor,
      p,
      (ctx) =>
        placeOrders(ctx, {
          patientUserId: p,
          encounterId: enc,
          orders: [
            {
              clientKey: randomUUID(),
              testId: GLUCOSE_FASTING,
              priority: "routine",
              reasonText: "Check",
            },
          ],
        }),
      { database: lane.db },
    );
    await pg.query(`UPDATE public.encounters SET state = 'completed' WHERE id = $1`, [enc]);
    return p;
  }

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Lab work A");
    hB = await hospital(pg, "Lab work B");
    const ward = await department(pg, hA, "Ward");
    const lab = await department(pg, hA, "Laboratory");
    const labB = await department(pg, hB, "Laboratory");
    const d = await clinician(pg, { hospitalId: hA, departmentId: ward, cadre: "MEDICAL_OFFICER" });
    doctor = {
      ...d,
      fullName: null,
      hospitalId: hA,
      departmentId: ward,
      cadreCode: "MEDICAL_OFFICER",
      isClinical: true,
      surface: "doctor",
    };
    labTech = (
      await clinician(pg, { hospitalId: hA, departmentId: lab, cadre: "LAB_TECHNOLOGIST" })
    ).userId;
    labTechB = (await clinician(pg, { hospitalId: hB, departmentId: labB, cadre: "LAB_TECH" }))
      .userId;
    nurse = (await clinician(pg, { hospitalId: hA, departmentId: lab, cadre: "NURSE" })).userId;
  }, 180_000);

  it("a technologist keeps access to a patient with a recent lab order, visit closed and no intake", async () => {
    const p = await patientWithLabOrder();
    expect(await basis(labTech, p, hA)).toBe("lab_work");
    expect(await inSet(labTech, hA, p)).toBe(true);
  });

  it("no lab order, no access", async () => {
    const p = await patient(pg);
    expect(await basis(labTech, p, hA)).toBeNull();
    expect(await inSet(labTech, hA, p)).toBe(false);
  });

  it("a non-lab clinician gets nothing from a lab order", async () => {
    const p = await patientWithLabOrder();
    expect(await basis(nurse, p, hA)).toBeNull();
    expect(await inSet(nurse, hA, p)).toBe(false);
  });

  it("another hospital's lab gets nothing", async () => {
    const p = await patientWithLabOrder();
    expect(await basis(labTechB, p, hB)).toBeNull();
    expect(await basis(labTechB, p, hA)).toBeNull();
    expect(await inSet(labTechB, hB, p)).toBe(false);
  });

  it("an order older than the 30-day window grants nothing", async () => {
    const p = await patientWithLabOrder();
    await pg.exec(`SET session_replication_role = replica`);
    await pg.query(
      `UPDATE public.encounter_orders SET created_at = now() - interval '31 days' WHERE patient_user_id = $1`,
      [p],
    );
    await pg.exec(`SET session_replication_role = origin`);
    expect(await basis(labTech, p, hA)).toBeNull();
    expect(await inSet(labTech, hA, p)).toBe(false);
  });

  it("a suspended technologist loses it", async () => {
    const p = await patientWithLabOrder();
    await pg.query(`UPDATE public.staff_affiliations SET state = 'suspended' WHERE user_id = $1`, [
      labTech,
    ]);
    expect(await basis(labTech, p, hA)).toBeNull();
    await pg.query(`UPDATE public.staff_affiliations SET state = 'active' WHERE user_id = $1`, [
      labTech,
    ]);
  });

  it("the access log accepts the new basis", async () => {
    const p = await patientWithLabOrder();
    const r = await pg.query(
      `INSERT INTO public.clinical_phi_access_log (clinician_user_id, patient_user_id, hospital_id, access_basis, surface)
       VALUES ($1, $2, $3, 'lab_work', 'lab_worklist') RETURNING id`,
      [labTech, p, hA],
    );
    expect(r.rows).toHaveLength(1);
  });
});
