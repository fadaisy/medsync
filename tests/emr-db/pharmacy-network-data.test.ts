/**
 * Pharmacy Phase 4, Step 2: migrations 0230 and 0231 on the PGlite lane (S2 and S3, and the database backstops).
 * Fixtures only. Runs with EMR_PGLITE=1 (tests/emr-db/_pglite.ts).
 */
import type { Actor, Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authUser,
  bootLane,
  department,
  hospital,
  laneOn,
  patient,
  probe,
  staff,
  superadmin,
} from "./_pglite";

const reader = (userId: string, hospitalId: string | null): Actor => ({
  role: "medsync_clinical_reader",
  userId,
  hospitalId,
});

describe.skipIf(!laneOn)("Pharmacy Phase 4 data layer (0230, 0231)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<
    | "h"
    | "hB"
    | "pharmacist"
    | "pharmacistB"
    | "doctor"
    | "patient"
    | "other"
    | "line"
    | "cdLine"
    | "auth"
    | "v1"
    | "v2"
    | "partnerA"
    | "partnerB"
    | "staffA"
    | "staffB"
    | "agreementA"
    | "agreementB"
    | "consentA"
    | "routingA",
    string
  >;
  const one = async (sql: string, p?: unknown[]) =>
    (await pg.query<{ id: string }>(sql, p)).rows[0]!.id;
  const err = async (sql: string, p?: unknown[]) =>
    pg.query(sql, p).then(
      () => "ran",
      (e: Error) => e.message,
    );
  const line = (controlled = false) =>
    one(
      `INSERT INTO public.prescriptions (hospital_id, patient_user_id, prescriber_user_id, drug_id, drug_name, dose, route, controlled)
       VALUES ($1, $2, $3, 'metformin', 'Metformin', 'as written', 'oral', $4) RETURNING id`,
      [f.h, f.patient, f.doctor, controlled],
    );
  const authorise = (prescriptionId: string) =>
    one(
      `INSERT INTO public.prescription_repeat_authorisations (hospital_id, patient_user_id, prescription_id,
         further_supplies, min_interval_days, not_after, rule_version, prescriber_user_id)
       VALUES ($1, $2, $3, 2, 28, current_date + 90, 1, $4) RETURNING id`,
      [f.h, f.patient, prescriptionId, f.doctor],
    );
  const partner = (name: string) =>
    one(
      `INSERT INTO public.partner_pharmacies (trading_name, district) VALUES ($1, 'Kampala') RETURNING id`,
      [name],
    );
  const agreement = (partnerId: string, hospitalId: string) =>
    one(
      `INSERT INTO public.partner_agreements (hospital_id, partner_id, reference, starts_on, kinds, dispensing_point_ids,
         template_version, created_by)
       VALUES ($1, $2, 'AG-fixture', current_date, ARRAY['refills'], ARRAY[gen_random_uuid()], 1, $3) RETURNING id`,
      [hospitalId, partnerId, f.pharmacist],
    );
  const consent = (partnerId: string, lines: string[]) =>
    one(
      `INSERT INTO public.pharmacy_routing_consents (hospital_id, patient_user_id, partner_id, given_by, how,
         wording_version, prescription_ids)
       VALUES ($1, $2, $3, 'patient', 'app', 1, $4::uuid[]) RETURNING id`,
      [f.h, f.patient, partnerId, lines],
    );
  const route = (
    lineId: string,
    partnerId: string,
    agreementId: string,
    consentId: string,
    code: string,
  ) =>
    pg.query<{ id: string }>(
      `INSERT INTO public.pharmacy_routings (hospital_id, patient_user_id, prescription_id, partner_id, agreement_id,
         consent_id, code, routed_quantity, routed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 30, $8) RETURNING id`,
      [f.h, f.patient, lineId, partnerId, agreementId, consentId, code, f.pharmacist],
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Phase 4 A");
    f.hB = await hospital(pg, "Phase 4 B");
    const d = await department(pg, f.h);
    const dB = await department(pg, f.hB);
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: d, cadre: "PHARMACIST" })
    ).userId;
    f.pharmacistB = (
      await staff(pg, { hospitalId: f.hB, departmentId: dB, cadre: "PHARMACIST" })
    ).userId;
    f.doctor = (await staff(pg, { hospitalId: f.h, departmentId: d })).userId;
    f.patient = await patient(pg);
    f.other = await patient(pg);
    f.line = await line();
    f.cdLine = await line(true);
    f.auth = await authorise(f.line);
    f.v1 = await superadmin(pg);
    f.v2 = await superadmin(pg);
    for (const v of [f.v1, f.v2])
      await pg.query(`INSERT INTO public.network_verifiers (user_id, named_by) VALUES ($1, $1)`, [
        v,
      ]);
    f.partnerA = await partner("Partner A");
    f.partnerB = await partner("Partner B");
    f.staffA = await authUser(pg, "partner-a");
    f.staffB = await authUser(pg, "partner-b");
    await pg.query(
      `INSERT INTO public.partner_staff (partner_id, user_id, permission, approved_by)
       VALUES ($1, $2, 'network.supply', $5), ($3, $4, 'network.supply', $5)`,
      [f.partnerA, f.staffA, f.partnerB, f.staffB, f.v1],
    );
    f.agreementA = await agreement(f.partnerA, f.h);
    f.agreementB = await agreement(f.partnerB, f.hB);
    f.consentA = await consent(f.partnerA, [f.line]);
    f.routingA = (
      await route(f.line, f.partnerA, f.agreementA, f.consentA, "ABCDEFGH")
    ).rows[0]!.id;
  }, 180_000);

  it("RP-2: a controlled line never carries a repeat authorisation", async () => {
    expect(
      await authorise(f.cdLine).then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toMatch(/never repeated/);
  });

  it("RI-1: one open repeat instance per line", async () => {
    const make = () =>
      pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_repeat_instances (hospital_id, patient_user_id, authorisation_id, prescription_id,
           ordinal, created_by) VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
        [f.h, f.patient, f.auth, f.line, f.pharmacist],
      );
    const first = (await make()).rows[0]!.id;
    expect(
      await make().then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toMatch(/already has an open repeat/);
    await pg.query(
      `INSERT INTO public.pharmacy_repeat_instance_events (instance_id, hospital_id, kind, reason_code, actor_user_id)
       VALUES ($1, $2, 'closed', 'fixture', $3)`,
      [first, f.h, f.pharmacist],
    );
    expect(
      await make().then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toBe("ran");
  });

  it("RN-2: the first answer to a renewal request wins", async () => {
    const r = await one(
      `INSERT INTO public.prescription_renewal_requests (hospital_id, patient_user_id, prescription_id, reason, asked_by,
         asked_by_user_id) VALUES ($1, $2, $3, 'none_left', 'patient', $2) RETURNING id`,
      [f.h, f.patient, f.line],
    );
    const answer = (kind: string) =>
      err(
        `INSERT INTO public.prescription_renewal_events (renewal_id, hospital_id, kind, actor_user_id)
         VALUES ($1, $2, $3, $4)`,
        [r, f.h, kind, f.doctor],
      );
    expect(await answer("visit_needed")).toBe("ran");
    expect(await answer("withdrawn")).not.toBe("ran");
  });

  it("PN-4: a named verifier, a second confirmer, and nobody with an interest", async () => {
    const lic = await one(
      `INSERT INTO public.partner_licences (partner_id, licence_number, expires_on, recorded_by)
       VALUES ($1, 'L-1', current_date + 300, $2) RETURNING id`,
      [f.partnerA, f.v1],
    );
    const rp = await one(
      `INSERT INTO public.partner_pharmacists (partner_id, name, registration_number, recorded_by)
       VALUES ($1, 'Fixture Pharmacist', 'R-1', $2) RETURNING id`,
      [f.partnerA, f.v1],
    );
    const verify = (actor: string) =>
      pg.query<{ id: string }>(
        `INSERT INTO public.partner_verifications (partner_id, kind, licence_id, pharmacist_id, how, standard_version,
           actor_user_id) VALUES ($1, 'verified', $2, $3, 'Documents seen', 1, $4) RETURNING id`,
        [f.partnerA, lic, rp, actor],
      );
    expect(
      await verify(f.pharmacist).then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toMatch(/named network verifier/);
    const v = (await verify(f.v1)).rows[0]!.id;
    const confirm = (actor: string) =>
      err(
        `INSERT INTO public.partner_verifications (partner_id, kind, verification_id, actor_user_id)
         VALUES ($1, 'confirmed', $2, $3)`,
        [f.partnerA, v, actor],
      );
    expect(await confirm(f.v1)).toMatch(/second person/);
    await pg.query(
      `INSERT INTO public.partner_interests (partner_id, holder, interest, user_id, recorded_by)
       VALUES ($1, 'A verifier', 'Fixture interest', $2, $3)`,
      [f.partnerA, f.v2, f.v1],
    );
    expect(await confirm(f.v2)).toMatch(/disclosed interest/);
  });

  it("AG-1: switching an agreement on needs a second approver", async () => {
    expect(
      await err(
        `INSERT INTO public.partner_agreement_events (agreement_id, hospital_id, kind, actor_user_id, second_approver_user_id)
         VALUES ($1, $2, 'switched_on', $3, $3)`,
        [f.agreementA, f.h, f.pharmacist],
      ),
    ).not.toBe("ran");
    expect(
      await err(
        `INSERT INTO public.partner_agreement_events (agreement_id, hospital_id, kind, actor_user_id, second_approver_user_id)
         VALUES ($1, $2, 'switched_on', $3, $4)`,
        [f.agreementA, f.h, f.pharmacist, f.doctor],
      ),
    ).toBe("ran");
  });

  it("Law 5 and Law 7: no controlled routing, no routing without consent, one live routing per line", async () => {
    const cdConsent = await consent(f.partnerA, [f.cdLine]);
    expect(
      await route(f.cdLine, f.partnerA, f.agreementA, cdConsent, "CDCDCDCD").then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toMatch(/controlled medicine is never routed/);
    const other = await line();
    expect(
      await route(other, f.partnerA, f.agreementA, f.consentA, "OTHERLNE").then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toMatch(/no consent/);
    expect(
      await route(f.line, f.partnerA, f.agreementA, f.consentA, "SECONDRT").then(
        () => "ran",
        (e: Error) => e.message,
      ),
    ).toMatch(/already routed/);
  });

  it("S2: partner staff see only routings to their own pharmacy, and nothing of the record", async () => {
    const rows = async (a: Actor, sql: string) => {
      const r = await probe(pg, a, sql);
      return r.ok ? r.rows.length : r.error;
    };
    expect(await rows(reader(f.staffA, null), `SELECT 1 FROM public.pharmacy_routings`)).toBe(1);
    expect(await rows(reader(f.staffB, null), `SELECT 1 FROM public.pharmacy_routings`)).toBe(0);
    expect(
      await rows(reader(f.staffA, null), `SELECT 1 FROM public.pharmacy_routing_consents`),
    ).toBe(0);
    expect(await rows(reader(f.staffA, null), `SELECT 1 FROM public.partner_pharmacies`)).toBe(1);
    expect(
      await rows(reader(f.staffA, null), `SELECT 1 FROM public.prescription_repeat_authorisations`),
    ).toBe(0);
    const rx = await probe(pg, reader(f.staffA, null), `SELECT 1 FROM public.prescriptions`);
    expect(rx.ok ? rx.rows.length : 0).toBe(0);
    // Another hospital's pharmacist sees none of this hospital's routings or requests.
    expect(await rows(reader(f.pharmacistB, f.hB), `SELECT 1 FROM public.pharmacy_routings`)).toBe(
      0,
    );
    expect(
      await rows(
        reader(f.pharmacistB, f.hB),
        `SELECT 1 FROM public.prescription_repeat_authorisations`,
      ),
    ).toBe(0);
    // The hospital's pharmacist and the patient see theirs; another patient does not.
    expect(await rows(reader(f.pharmacist, f.h), `SELECT 1 FROM public.pharmacy_routings`)).toBe(1);
    expect(await rows(reader(f.patient, null), `SELECT 1 FROM public.pharmacy_routings`)).toBe(1);
    expect(await rows(reader(f.other, null), `SELECT 1 FROM public.pharmacy_routings`)).toBe(0);
    // A declined routing disappears from the partner's view.
    await pg.query(
      `INSERT INTO public.pharmacy_routing_events (routing_id, hospital_id, kind, reason_code, actor_user_id)
       VALUES ($1, $2, 'partner_declined', 'not_in_stock', $3)`,
      [f.routingA, f.h, f.staffA],
    );
    expect(await rows(reader(f.staffA, null), `SELECT 1 FROM public.pharmacy_routings`)).toBe(0);
    // The network verifier reads the register but no routing or consent.
    expect(await rows(reader(f.v1, null), `SELECT 1 FROM public.partner_pharmacies`)).toBe(2);
    expect(await rows(reader(f.v1, null), `SELECT 1 FROM public.pharmacy_routings`)).toBe(0);
  });

  it("S3: no UPDATE or DELETE on the immutable tables, and no client writes anything", async () => {
    const immutable: Array<[string, string]> = [
      ["prescription_repeat_authorisations", f.auth],
      ["pharmacy_routing_consents", f.consentA],
      ["pharmacy_routings", f.routingA],
    ];
    for (const [t, id] of immutable) {
      expect(await err(`UPDATE public.${t} SET id = id WHERE id = $1`, [id])).not.toBe("ran");
      expect(await err(`DELETE FROM public.${t} WHERE id = $1`, [id])).not.toBe("ran");
    }
    expect(await err(`DELETE FROM public.partner_staff WHERE user_id = $1`, [f.staffA])).toMatch(
      /never deleted/,
    );
    expect(
      await err(`UPDATE public.partner_staff SET permission = 'network.admin' WHERE user_id = $1`, [
        f.staffA,
      ]),
    ).toMatch(/only by being ended/);
    for (const t of [
      "prescription_repeat_authorisations",
      "pharmacy_refill_requests",
      "pharmacy_routings",
      "partner_pharmacies",
      "patient_collectors",
    ]) {
      const w = await probe(
        pg,
        { role: "authenticated", userId: f.patient },
        `DELETE FROM public.${t}`,
      );
      expect(w.ok).toBe(false);
    }
  });
});
