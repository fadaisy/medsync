/**
 * Pharmacy Phase 0, Step 3 (gate-a-proposal §5, §7): the four reads behind /pharmacy on the PGlite
 * lane, every migration replayed. Two hospitals (PQ-11, S16), lanes from the encounter (PQ-3, S10),
 * co-sign (S7), a returned line (S8), placement and time grouping (PQ-1, S5), find by patient number
 * (S11), the view log (RV-6, S12), emergency doses from the resus timeline (ED, S14), and a fixed
 * number of round trips (§11). Fixture medicines and doses are invented (Law 8).
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { encrypt, generateKey } from "@/lib/encryption";
import { NO_CART } from "@/lib/pharmacy/emergency-doses";
import { buildPrescriptionView } from "@/lib/pharmacy/prescription-view";
import {
  findPrescriptions,
  getEmergencyDoses,
  getPharmacyQueue,
  getPrescription,
  logPrescriptionViewed,
  patientFacts,
} from "@/lib/pharmacy/read";
import {
  authUser,
  bootLane,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
  staff,
} from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const ALL = { lane: "all", state: "all", from: "all", sort: "written", desc: false } as const;

describe.skipIf(!laneOn)("pharmacy reads (PGlite lane)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  let clinic: string;
  let ward: string;
  let doctor: string;
  let doctorAff: string;
  let consultant: string;
  let nurse: string;
  let pt: string;
  let ptCode: string;
  let ptB: string;
  let ptBCode: string;
  const enc: Record<string, string> = {};
  const P = {
    basket: randomUUID(),
    cosign: randomUUID(),
    returned: randomUUID(),
    ward: randomUUID(),
    other: randomUUID(),
  };
  const earlier = "2026-01-01T00:00:00.000Z"; // fixed, so the time key is known
  let timeKey: string;

  const rx = async (o: {
    hospitalId?: string;
    encounterId: string | null;
    placementId: string | null;
    drug: string;
    patientId?: string;
    prescriber?: string;
    state?: string;
    createdAt?: string;
    instructions?: string;
    reason?: string;
    answers?: unknown[];
    dose?: string;
  }) => {
    const [row] = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.prescriptions
           (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id, drug_name,
            dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at, updated_at,
            instructions_ciphertext, confirm_reason_ciphertext, check_answers, confirmed_flags, indication)
         VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', 'fixture', $5, $6, 'oral', 'fixture frequency', false, $7, $8,
                 CASE WHEN $8::uuid IS NULL THEN NULL ELSE (SELECT count(*) + 1 FROM public.prescriptions WHERE placement_id = $8::uuid) END,
                 coalesce($9::timestamptz, now()), coalesce($9::timestamptz, now()), $10, $11, $12::jsonb,
                 (SELECT coalesce(jsonb_agg(a->>'code'), '[]'::jsonb) FROM jsonb_array_elements($12::jsonb) a),
                 'Fixture indication')
         RETURNING id`,
        [
          o.hospitalId ?? hA,
          o.encounterId,
          o.patientId ?? pt,
          o.prescriber ?? doctor,
          o.drug,
          o.dose ?? "fixture dose",
          o.state ?? "active",
          o.placementId,
          o.createdAt ?? null,
          o.instructions ? encrypt(o.instructions) : null,
          o.reason ? encrypt(o.reason) : null,
          JSON.stringify(o.answers ?? []),
        ],
      )
    ).rows;
    return row!.id;
  };

  const cosign = (prescriptionId: string, state: string, reviewer: string | null) =>
    pg.query(
      `INSERT INTO public.clinical_cosign_requests
         (hospital_id, patient_user_id, requested_by_user_id, requested_by_affiliation_id,
          requested_by_cadre_code, action_kind, action_payload, state, reviewed_by_user_id, reviewed_at)
       VALUES ($1, $2, $3, $7, 'CLINICAL_OFFICER', 'prescription_routine', $4::jsonb, $5, $6,
               CASE WHEN $6::uuid IS NULL THEN NULL ELSE now() END)`,
      [
        hA,
        pt,
        doctor,
        JSON.stringify({ prescriptionId, encounterId: enc.open }),
        state,
        reviewer,
        doctorAff,
      ],
    );

  const profile = async (id: string) => {
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1972-03-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [id, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    return (
      await pg.query<{ code: string }>(
        `SELECT patient_code AS code FROM public.patient_profiles WHERE id = $1`,
        [id],
      )
    ).rows[0]!.code;
  };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    hA = await hospital(pg, "Rx A");
    hB = await hospital(pg, "Rx B");
    clinic = await department(pg, hA, "Diabetes clinic");
    ward = await department(pg, hA, "Ward 4A");
    const deptB = await department(pg, hB, "Medicine");
    ({ userId: doctor, affiliationId: doctorAff } = await staff(pg, {
      hospitalId: hA,
      departmentId: clinic,
    }));
    consultant = (await staff(pg, { hospitalId: hA, departmentId: clinic, cadre: "CONSULTANT" }))
      .userId;
    nurse = (await staff(pg, { hospitalId: hA, departmentId: ward, cadre: "NURSE" })).userId;
    const doctorB = (await staff(pg, { hospitalId: hB, departmentId: deptB })).userId;
    pt = await patient(pg);
    ptCode = await profile(pt);
    ptB = await patient(pg);
    ptBCode = await profile(ptB);

    enc.home = await encounter(pg, {
      hospitalId: hA,
      patientUserId: pt,
      clinicianUserId: doctor,
      departmentId: clinic,
      state: "completed",
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [enc.home]);
    enc.ward = await encounter(pg, {
      hospitalId: hA,
      patientUserId: pt,
      clinicianUserId: doctor,
      departmentId: ward,
    });
    await pg.query(`UPDATE public.encounters SET encounter_type = 'inpatient' WHERE id = $1`, [
      enc.ward,
    ]);
    enc.open = await encounter(pg, {
      hospitalId: hA,
      patientUserId: pt,
      clinicianUserId: doctor,
      departmentId: clinic,
    });
    enc.b = await encounter(pg, {
      hospitalId: hB,
      patientUserId: ptB,
      clinicianUserId: doctorB,
      departmentId: deptB,
    });

    // S5: one basket of three medicines for an outpatient sent home.
    for (const d of ["Fixture A", "Fixture B", "Fixture C"])
      await rx({ encounterId: enc.home, placementId: P.basket, drug: d });
    // S7: awaiting co-sign.
    const pending = await rx({ encounterId: enc.open, placementId: P.cosign, drug: "Fixture D" });
    await cosign(pending, "pending_review", null);
    // S8: one of two lines returned by the senior (cancelled).
    await rx({ encounterId: enc.open, placementId: P.returned, drug: "Fixture E" });
    const back = await rx({
      encounterId: enc.open,
      placementId: P.returned,
      drug: "Fixture F",
      state: "cancelled",
    });
    await cosign(back, "returned", consultant);
    // S10: an inpatient's prescription.
    await rx({
      encounterId: enc.ward,
      placementId: P.ward,
      drug: "Fixture G",
      instructions: "Fixture instruction",
      reason: "Override allergy: Senior reviewed and agreed",
      answers: [{ code: "allergy", answer: "senior_agreed", outcome: "stop" }],
      dose: "1/2 tab ",
    });
    // PQ-1: two older lines written in one transaction, no placement id.
    await rx({ encounterId: enc.open, placementId: null, drug: "Fixture H", createdAt: earlier });
    await rx({ encounterId: enc.open, placementId: null, drug: "Fixture I", createdAt: earlier });
    timeKey = `t:${enc.open}:${doctor}:${earlier}`;
    // PQ-11: another hospital.
    await rx({
      hospitalId: hB,
      encounterId: enc.b,
      placementId: P.other,
      drug: "Fixture Z",
      patientId: ptB,
      prescriber: doctorB,
    });

    // An allergy with its date (RV-3): a coded fixture substance, as the facts lane writes one.
    await pg.query(
      `INSERT INTO public.allergies (id, logical_id, hospital_id, patient_user_id, recorded_by_user_id, effective_at, source,
         trust, substance_kind, substance_code, informant)
       SELECT n, n, $1, $2, $3, now(), 'clinician', 3, 'drug_ingredient', 'penicillin', 'patient' FROM gen_random_uuid() n`,
      [hA, pt, doctor],
    );
  }, 180_000);

  it("S5, S7, S8, S10: rows, lanes and states for today", async () => {
    const q = await getPharmacyQueue(hA, "today", ALL, lane.db);
    const by = new Map(q.rows.map((r) => [r.key, r]));
    expect(by.get(P.basket)).toMatchObject({
      lane: "window",
      state: "prescribed",
      medicines: ["Fixture A", "Fixture B", "Fixture C"],
    });
    expect(by.get(P.cosign)).toMatchObject({ lane: "open", state: "awaiting_cosign" });
    expect(by.get(P.returned)!.state).toBe("prescribed");
    expect(by.get(P.returned)!.changedAt).not.toBeNull();
    expect(by.get(P.ward)).toMatchObject({ lane: "ward", checks: ["1 stop overridden"] });
    expect(by.get(P.basket)!.from.departmentName).toMatch(/Diabetes clinic/);
    expect(by.get(P.basket)!.prescriberCadre).toBe("Medical officer");
    expect(q.laneCounts.window + q.laneCounts.ward + q.laneCounts.open).toBe(q.laneCounts.all);
    expect(q.total).toBe(4);
    expect(q.serverNow).toBeInstanceOf(Date);
  });

  it("PQ-11, S16: another hospital's prescription never appears", async () => {
    const q = await getPharmacyQueue(hA, "7d", ALL, lane.db);
    expect(q.rows.some((r) => r.key === P.other)).toBe(false);
    const qb = await getPharmacyQueue(hB, "today", ALL, lane.db);
    expect(qb.rows.map((r) => r.key)).toEqual([P.other]);
    expect(await getPrescription(hA, P.other, lane.db)).toBeNull();
  });

  it("PQ-1: older lines group by time, and open by their time key", async () => {
    const view = await getPrescription(hA, timeKey, lane.db);
    expect(view!.groupedByTime).toBe(true);
    expect(view!.lines.map((l) => l.drugName)).toEqual(["Fixture H", "Fixture I"]);
    expect(await getPrescription(hA, "not-a-key", lane.db)).toBeNull();
  });

  it("RV-1, RV-2: the read list, text as stored, reasons and instructions decrypted", async () => {
    const view = await getPrescription(hA, P.ward, lane.db);
    const line = view!.lines[0]!;
    expect(line.dose).toBe("1/2 tab ");
    expect(line.instructions).toBe("Fixture instruction");
    expect(line.reasons).toBe("Override allergy: Senior reviewed and agreed");
    expect(line.indication).toBe("Fixture indication");
    const v = buildPrescriptionView({
      lines: view!.lines,
      encounter: view!.encounter,
      prescriberCadre: view!.prescriberCadre,
    });
    expect(v.lane).toBe("ward");
    expect(v.lines[0]!.overriddenStops).toEqual(["Allergy"]);
  });

  it("S8: the returned line is cancelled by the senior's cadre", async () => {
    const view = await getPrescription(hA, P.returned, lane.db);
    const v = buildPrescriptionView({
      lines: view!.lines,
      encounter: view!.encounter,
      prescriberCadre: view!.prescriberCadre,
    });
    const cancelled = v.lines.find((l) => l.state === "cancelled")!;
    expect(cancelled.stateByCadre).toBe("Consultant");
  });

  it("RV-3: current facts, each with its date", async () => {
    const f = await patientFacts(pt, new Date(), lane.db);
    expect(f.weight).toBeNull();
    expect(f.allergies.kind).toBe("listed");
    if (f.allergies.kind !== "listed") return;
    expect(f.allergies.items).toHaveLength(1);
    expect(f.allergies.items[0]!.at).toBeInstanceOf(Date);
  });

  it("S11: find by patient number; another hospital's number gives the same empty answer", async () => {
    const found = await findPrescriptions(hA, ptCode, lane.db);
    // Four placed today; the two lines written on 1 January are outside the 30-day look-back.
    expect(found.rows.length).toBe(4);
    expect(found.rows.some((r) => r.key === timeKey)).toBe(false);
    expect(found.rows[0]!.writtenAt.getTime()).toBeGreaterThanOrEqual(
      found.rows.at(-1)!.writtenAt.getTime(),
    );
    expect((await findPrescriptions(hA, ptBCode, lane.db)).rows).toEqual([]);
    expect((await findPrescriptions(hA, "MS-0000-NOPE", lane.db)).rows).toEqual([]);
  });

  it("RV-6, S12: opening writes one log row; again within a minute writes none", async () => {
    const viewer = await authUser(pg, "pharmacist");
    expect(await logPrescriptionViewed(viewer, hA, P.basket, lane.db)).toBe(true);
    expect(await logPrescriptionViewed(viewer, hA, P.basket, lane.db)).toBe(false);
    expect(await logPrescriptionViewed(viewer, hA, P.cosign, lane.db)).toBe(true);
    const rows = (
      await pg.query<{ data: Record<string, unknown> }>(
        `SELECT after_data AS data FROM public.audit_log WHERE table_name = 'pharmacy_prescription_view' AND actor_id = $1`,
        [viewer],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.data).toMatchObject({
      event: "pharmacy_prescription_viewed",
      placement: P.basket,
      hospital_id: hA,
    });
  });

  describe("emergency doses (S14)", () => {
    let episode: string;
    beforeAll(async () => {
      episode = (
        await pg.query<{ id: string }>(
          `INSERT INTO public.resus_episodes (hospital_id, patient_user_id, trigger_kind, opened_by_user_id)
           VALUES ($1, $2, 'triage_red', $3) RETURNING id`,
          [hA, pt, nurse],
        )
      ).rows[0]!.id;
      const unknown = (
        await pg.query<{ id: string }>(
          `INSERT INTO public.resus_episodes (hospital_id, trigger_kind, opened_by_user_id) VALUES ($1, 'triage_red', $2) RETURNING id`,
          [hA, nurse],
        )
      ).rows[0]!.id;
      const otherEp = (
        await pg.query<{ id: string }>(
          `INSERT INTO public.resus_episodes (hospital_id, trigger_kind) VALUES ($1, 'triage_red') RETURNING id`,
          [hB],
        )
      ).rows[0]!.id;
      const drug = (ep: string, payload: unknown, supersedes: string | null = null) =>
        pg
          .query<{ id: string }>(
            `INSERT INTO public.resus_timeline_events (episode_id, kind, recorded_by_user_id, payload, supersedes_event_id)
             VALUES ($1, 'drug', $2, $3::jsonb, $4) RETURNING id`,
            [ep, nurse, JSON.stringify(payload), supersedes],
          )
          .then((r) => r.rows[0]!.id);
      const given = (cart: string | null, extra: object = {}) => ({
        prescribing: {
          drugName: "Fixture medicine C",
          dose: "fixture amount",
          route: "IV",
          cart,
          giverUserId: nurse,
          controlled: false,
          ...extra,
        },
      });
      await drug(episode, given("Fixture cart 1"));
      await drug(episode, given("Fixture cart 1", { controlled: true, witnessUserId: doctor }));
      const wrong = await drug(episode, given("Fixture cart 2"));
      await drug(episode, given("Fixture cart 1"), wrong); // the correction replaces it
      await drug(unknown, given(null));
      await drug(episode, { label: "Fixture protocol dose", state: "indicated" });
      await drug(otherEp, given("Fixture cart 9"));
    });

    it("ED-1..ED-4: by cart, corrections replaced, other hospitals out, counts add up", async () => {
      const d = await getEmergencyDoses(hA, "7d", "all", lane.db);
      expect(d.total).toBe(4);
      expect(Object.fromEntries(d.cartCounts)).toEqual({ "Fixture cart 1": 3, [NO_CART]: 1 });
      expect(d.rows.some((r) => r.cart === "Fixture cart 2" || r.cart === "Fixture cart 9")).toBe(
        false,
      );
      const controlled = d.rows.find((r) => r.controlled)!;
      expect(controlled.witness).toEqual({ userId: doctor });
      expect(d.cadreOf.get(doctor)).toBe("Medical officer");
      expect(d.cadreOf.get(nurse)).toMatch(/Nurse/i);
      expect(d.rows.find((r) => r.cart === null)!.patientUserId).toBeNull();
      expect((await getEmergencyDoses(hA, "7d", "Fixture cart 1", lane.db)).rows).toHaveLength(3);
    });
  });

  it("§11: a fixed number of round trips whatever the row count", async () => {
    let statements = 0;
    const p = lane.pg as unknown as Record<string, (...a: unknown[]) => unknown>;
    const real = { query: p.query!, exec: p.exec! };
    p.query = (...a: unknown[]) => {
      statements += 1;
      return real.query.apply(lane.pg, a);
    };
    p.exec = (...a: unknown[]) => {
      statements += 1;
      return real.exec.apply(lane.pg, a);
    };
    const count = async () => {
      statements = 0;
      await getPharmacyQueue(hA, "today", ALL, lane.db);
      return statements;
    };
    try {
      const before = await count();
      Object.assign(p, real);
      for (let i = 0; i < 6; i++)
        await rx({ encounterId: enc.home!, placementId: randomUUID(), drug: `Fixture N${i}` });
      p.query = (...a: unknown[]) => {
        statements += 1;
        return real.query.apply(lane.pg, a);
      };
      const after = await count();
      expect(after).toBe(before);
      expect(after).toBeLessThanOrEqual(4);
    } finally {
      Object.assign(p, real);
    }
  });
});
