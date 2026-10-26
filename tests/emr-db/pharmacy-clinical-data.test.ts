/**
 * Pharmacy Phase 3, Step 2: migration 0210 on the PGlite lane (S1 to S3 for the first merge). Fixtures only.
 * Runs with EMR_PGLITE=1 (tests/emr-db/_pglite.ts).
 */
import type { Actor, Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { factsFor } from "@/lib/pharmacy/clinical/reconciliation-read";
import {
  bootLane,
  department,
  drizzleFor,
  encounter,
  hospital,
  laneOn,
  patient,
  probe,
  staff,
  superadmin,
} from "./_pglite";

const reader = (userId: string, hospitalId: string): Actor => ({
  role: "medsync_clinical_reader",
  userId,
  hospitalId,
});

describe.skipIf(!laneOn)("Pharmacy Phase 3 data layer (0210)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<
    "h" | "hB" | "pharmacist" | "tech" | "doctor" | "super" | "draft" | "inForce",
    string
  >;
  type Row = { id: string; d: string; column_default: string };
  const one = async (sql: string, p?: unknown[]) => (await pg.query<Row>(sql, p)).rows[0]!;
  const attest = async (actor: string, attester: string) =>
    (
      await one(
        `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
         VALUES ($1, $2, $3, 'signer', 'sign_content', 'passed') RETURNING id`,
        [f.h, actor, attester],
      )
    ).id;
  const entry = async (status = "draft", key = `k-${Math.random()}`) =>
    (
      await one(
        `INSERT INTO public.pharmacy_content_entries (hospital_id, pack, key, version, payload, source, status, author_user_id)
         VALUES ($1, 'interaction_pair', $2, 1, '{}'::jsonb, 'Fixture source', $3, $4) RETURNING id`,
        [f.h, key, status, f.pharmacist],
      )
    ).id;
  const sign = async (entryId: string, signer: string, exception: string | null = null) =>
    pg.query(
      `INSERT INTO public.pharmacy_content_signatures (entry_id, hospital_id, signer_user_id, role, attestation_id, exception_text)
       VALUES ($1, $2, $3, 'cso', $4, $5)`,
      [
        entryId,
        f.h,
        signer,
        await attest(f.pharmacist, signer === f.pharmacist ? f.tech : signer),
        exception,
      ],
    );
  const err = async (sql: string, p?: unknown[]) =>
    pg.query(sql, p).then(
      () => "ran",
      (e: Error) => e.message,
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Phase 3 A");
    f.hB = await hospital(pg, "Phase 3 B");
    const d = await department(pg, f.h);
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: d, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (await staff(pg, { hospitalId: f.h, departmentId: d, cadre: "PHARMACY_TECH" })).userId;
    f.doctor = (await staff(pg, { hospitalId: f.h, departmentId: d })).userId;
    f.super = await superadmin(pg);
    f.draft = await entry("draft");
    f.inForce = await entry("draft");
    await sign(f.inForce, f.pharmacist);
    await sign(f.inForce, f.tech);
    await pg.query(
      `UPDATE public.pharmacy_content_entries SET status = 'in_force', in_force_at = now() WHERE id = $1`,
      [f.inForce],
    );
  }, 180_000);

  it("CC-2: in force needs two signers, or one with a recorded exception", async () => {
    const e = await entry();
    await sign(e, f.pharmacist);
    expect(
      await err(`UPDATE public.pharmacy_content_entries SET status = 'in_force' WHERE id = $1`, [
        e,
      ]),
    ).toMatch(/two signers/);
    const x = await entry();
    await sign(x, f.pharmacist, "CSO signs alone (ADR 0281)");
    expect(
      await err(`UPDATE public.pharmacy_content_entries SET status = 'in_force' WHERE id = $1`, [
        x,
      ]),
    ).toBe("ran");
  });

  it("S3: a signed entry never changes; withdrawal is the one change; signatures and imports are append-only", async () => {
    expect(
      await err(`UPDATE public.pharmacy_content_entries SET payload = '{"x":1}' WHERE id = $1`, [
        f.inForce,
      ]),
    ).toMatch(/never changes/);
    expect(
      await err(`DELETE FROM public.pharmacy_content_entries WHERE id = $1`, [f.inForce]),
    ).toMatch(/withdrawn/);
    expect(
      await err(
        `UPDATE public.pharmacy_content_signatures SET role = 'ams_chair' WHERE entry_id = $1`,
        [f.inForce],
      ),
    ).not.toBe("ran");
    const w = await entry();
    await sign(w, f.pharmacist, "CSO signs alone (ADR 0281)");
    await pg.query(`UPDATE public.pharmacy_content_entries SET status = 'in_force' WHERE id = $1`, [
      w,
    ]);
    expect(
      await err(
        `UPDATE public.pharmacy_content_entries SET status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = 'Fixture reason', withdrawn_by = $2 WHERE id = $1`,
        [w, f.pharmacist],
      ),
    ).toBe("ran");
    expect(
      await err(`UPDATE public.pharmacy_content_entries SET status = 'in_force' WHERE id = $1`, [
        w,
      ]),
    ).toMatch(/cannot become/);
  });

  it("S2: pharmacy reads drafts; a prescriber reads only in-force entries; other hospitals and the superadmin read nothing", async () => {
    const keys = async (a: Actor) => {
      const r = await probe(pg, a, `SELECT id::text AS id FROM public.pharmacy_content_entries`);
      return r.ok ? r.rows.map((x) => x.id as string) : [r.error];
    };
    expect(await keys(reader(f.pharmacist, f.h))).toEqual(
      expect.arrayContaining([f.draft, f.inForce]),
    );
    const doctor = await keys(reader(f.doctor, f.h));
    expect(doctor).toContain(f.inForce);
    expect(doctor).not.toContain(f.draft);
    expect(await keys(reader(f.pharmacist, f.hB))).toEqual([]);
    expect(await keys(reader(f.super, f.h))).toEqual([]);
    const sig = await probe(
      pg,
      reader(f.doctor, f.h),
      `SELECT 1 FROM public.pharmacy_content_signatures`,
    );
    expect(sig.ok && sig.rows).toEqual([]);
  });

  it("no client writes anything", async () => {
    for (const t of [
      "pharmacy_content_entries",
      "pharmacy_content_signatures",
      "pharmacy_query_pcne",
    ]) {
      const r = await probe(
        pg,
        { role: "authenticated", userId: f.pharmacist },
        `DELETE FROM public.${t}`,
      );
      expect(r.ok, t).toBe(false);
    }
  });

  it("IV-2a and IX-6: a query has an intent; an interaction acceptance needs its reason", async () => {
    const c = await one(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'pharmacy_queries' AND column_name = 'intent'`,
    );
    expect(c.column_default).toMatch(/proposes_change/);
    const def = await one(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'ple_interaction_reason'`,
    );
    expect(def.d).toMatch(/accepted_interaction/);
  });

  it("0211: a submission needs a route and a date; reports and events are append-only; the new packs are allowed", async () => {
    const pt = await patient(pg);
    const r = await one(
      `INSERT INTO public.pharmacy_reaction_reports (hospital_id, patient_user_id, reference, kind, reaction_text,
         seriousness, outcome, action_taken, rechallenge, reporter, recorded_by)
       VALUES ($1, $2, 'R-ABCDEFGH', 'suspected_reaction', 'Rash after the dose', ARRAY['not_serious'], 'recovering',
         'stopped_by_clinician', 'not_given_again', 'staff', $3) RETURNING id`,
      [f.h, pt, f.pharmacist],
    );
    const ev = (extra: string) =>
      err(
        `INSERT INTO public.pharmacy_reaction_events (report_id, hospital_id, kind, actor_user_id${extra ? ", route, submitted_on" : ""})
         VALUES ($1, $2, 'submitted', $3${extra})`,
        [r.id, f.h, f.pharmacist],
      );
    expect(await ev("")).toMatch(/pre_submitted/);
    expect(await ev(", 'Med Safety app', current_date")).toBe("ran");
    expect(await err(`UPDATE public.pharmacy_reaction_reports SET outcome = 'died'`)).not.toBe(
      "ran",
    );
    expect(await err(`DELETE FROM public.pharmacy_reaction_events`)).not.toBe("ran");
    for (const pack of ["aware_pack", "review_settings", "reaction_timelines"])
      expect(await entryPack(pack)).toBe("ran");
  });
  const entryPack = (pack: string) =>
    err(
      `INSERT INTO public.pharmacy_content_entries (hospital_id, pack, key, version, payload, source, status, author_user_id)
       VALUES ($1, $2, $2, 1, '{}'::jsonb, 'Fixture source', 'draft', $3)`,
      [f.h, pack, f.pharmacist],
    );

  it("0212: one reconciliation per admission; a confirmation carries its list; a close needs a reason; append-only", async () => {
    const pt = await patient(pg);
    const dept = await department(pg, f.h, "Ward dept");
    const ward = (
      await one(
        `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward R', 'ward-r') RETURNING id`,
        [f.h, dept],
      )
    ).id;
    const src = await encounter(pg, {
      hospitalId: f.h,
      patientUserId: pt,
      clinicianUserId: f.doctor,
    });
    const adm = (
      await one(
        `INSERT INTO public.admissions (hospital_id, patient_user_id, source_encounter_id, ward_id, decided_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [f.h, pt, src, ward, f.doctor],
      )
    ).id;
    const rec = (
      await one(
        `INSERT INTO public.pharmacy_reconciliations (hospital_id, patient_user_id, admission_id, opened_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [f.h, pt, adm, f.doctor],
      )
    ).id;
    expect(
      await err(
        `INSERT INTO public.pharmacy_reconciliations (hospital_id, patient_user_id, admission_id, opened_by) VALUES ($1, $2, $3, $4)`,
        [f.h, pt, adm, f.doctor],
      ),
    ).toMatch(/unique|duplicate/i);
    const ev = (kind: string, extra = "", vals: unknown[] = []) =>
      err(
        `INSERT INTO public.pharmacy_reconciliation_events (reconciliation_id, hospital_id, kind, actor_user_id${extra})
         VALUES ($1, $2, $3, $4${vals.map((_, i) => `, $${i + 5}`).join("")})`,
        [rec, f.h, kind, f.pharmacist, ...vals],
      );
    expect(await ev("confirmed")).toMatch(/prce_confirmed/);
    expect(await ev("confirmed", ", snapshot", ['[{"key":"a"}]'])).toBe("ran");
    expect(await ev("closed", ", reason", ["other"])).toMatch(/prce_closed/);
    expect(await ev("closed", ", reason, note", ["other", "Patient phoned"])).toBe("ran");
    expect(
      await err(
        `INSERT INTO public.pharmacy_reconciliation_decisions (reconciliation_id, hospital_id, row_key, decision, decided_by)
         VALUES ($1, $2, 'med_a', 'guess', $3)`,
        [rec, f.h, f.doctor],
      ),
    ).not.toBe("ran");
    expect(await err(`DELETE FROM public.pharmacy_reconciliation_events`)).not.toBe("ran");
    expect(await entryPack("reconciliation_rules")).toBe("ran");
    const read = await factsFor(await drizzleFor(pg), f.h, rec, new Date());
    expect(read?.state).toBe("closed");
    expect(read?.facts.before).toEqual([]);
  });
});
