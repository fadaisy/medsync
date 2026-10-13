/**
 * Pharmacy Phase 1, gate-a-proposal §10: the races PGlite cannot run, on a real Postgres with two
 * connections. Owner-run only, against the dev Supabase (MEDSYNC_ALLOW_RLS_DB_WRITES=1 and a dev
 * DATABASE_URL); it SKIPS otherwise. Never point it at production: it leaves fixture rows in
 * append-only tables that cannot be deleted.
 *
 *   1. Two supplies of the last unit of one batch at the same moment: exactly one commits (the batch
 *      row lock in 0124's guard).
 *   2. Two hand-overs of one line at two points at the same moment: exactly one supplies it (the
 *      per-line advisory lock every supply writer takes, then the outcome re-check).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RLS_TESTS_ENABLED } from "./_helpers";

/** The lock key every pharmacy writer takes per line (lib/pharmacy/supply, Step 6). */
export const lineLockKey = (prescriptionId: string) => `pharmacy-line:${prescriptionId}`;

describe.skipIf(!RLS_TESTS_ENABLED)("pharmacy races on real Postgres (two connections)", () => {
  const url = process.env.DATABASE_URL!;
  const a = postgres(url, { prepare: false, max: 1 });
  const b = postgres(url, { prepare: false, max: 1 });
  const setup = postgres(url, { prepare: false, max: 1 });
  const f = {} as Record<string, string> & {
    h: string;
    patient: string;
    doctor: string;
    actor: string;
    rx: string;
    product: string;
  };

  beforeAll(async () => {
    const tag = `race-${Date.now()}`;
    const [h] = await setup`INSERT INTO public.hospitals (name, slug, level)
      VALUES (${`Race fixture ${tag}`}, ${tag}, 'national_referral') RETURNING id`;
    f.h = h!.id;
    const [dept] =
      await setup`INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
      VALUES (${f.h}, 'Pharmacy', ${`${tag}-ph`}, 'support', 'PHARMACY') RETURNING id`;
    for (const p of ["A", "B"]) {
      const [pt] =
        await setup`INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
        VALUES (${f.h}, ${dept!.id}, ${`Point ${p}`}, ${`${tag}-${p}`}, 'support') RETURNING id`;
      f[`point${p}`] = pt!.id;
      await setup`INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves)
        VALUES (${pt!.id}, ${f.h}, 'window')`;
    }
    for (const who of ["actor", "patient", "doctor"]) {
      const [u] =
        await setup`INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), ${`${tag}-${who}@medsync.local`}) RETURNING id`;
      f[who] = u!.id;
    }
    const [enc] =
      await setup`INSERT INTO public.encounters (hospital_id, patient_user_id, clinician_user_id, state, started_at)
      VALUES (${f.h}, ${f.patient!}, ${f.doctor!}, 'in_progress', now()) RETURNING id`;
    const [rx] =
      await setup`INSERT INTO public.prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id,
        prescriber_cadre, drug_id, drug_name, dose, route, frequency, is_emergency, state)
      VALUES (${f.h}, ${enc!.id}, ${f.patient!}, ${f.doctor!}, 'MEDICAL_OFFICER', 'fixture_tablet_a', 'Fixture tablet A',
              '[fixture dose]', 'oral', '[fixture frequency]', false, 'active') RETURNING id`;
    f.rx = rx!.id;
    const [prod] =
      await setup`INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
      VALUES (${f.h}, 'fixture_tablet_a', 'Fixture tablet A', 'tablet', ${f.actor!}) RETURNING id`;
    f.product = prod!.id;
    for (const p of ["A", "B", "R"]) {
      const point = p === "R" ? "A" : p;
      const [bt] =
        await setup`INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number,
          expiry, first_batch_number, first_expiry, created_by)
        VALUES (${f.h}, ${f[`point${point}`]!}, ${f.product}, ${`FX-${p}`}, '2099-01-01', ${`FX-${p}`}, '2099-01-01', ${f.actor!})
        RETURNING id`;
      f[`batch${p}`] = bt!.id;
      await setup`INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
          effective_at, actor_user_id, source_kind) VALUES (${f.h}, ${f[`point${point}`]!}, ${bt!.id}, 'received', 1, now(),
          ${f.actor!}, 'delivery')`;
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.all([a.end(), b.end(), setup.end()]);
  });

  /** One hand-over of the fixture line from `point`'s batch, as recordHandover writes it. */
  const handOver = (sql: postgres.Sql, point: "A" | "B", batch: "A" | "B" | "R", asLine: boolean) =>
    sql.begin(async (tx) => {
      if (asLine) {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${lineLockKey(f.rx!)}))`;
        const [done] = await tx`SELECT 1 FROM public.pharmacy_line_events
          WHERE prescription_id = ${f.rx!} AND kind = 'supplied'`;
        if (done) throw new Error("already_supplied");
      }
      const [h] =
        await tx`INSERT INTO public.pharmacy_handovers (hospital_id, dispensing_point_id, patient_user_id,
          collector, identity_route, second_identifier, label_mode, actor_user_id, client_key)
        VALUES (${f.h!}, ${f[`point${point}`]!}, ${f.patient!}, 'patient', 'two_identifiers', 'date_of_birth', 'printed',
          ${f.actor!}, ${`race-${point}-${Math.random().toString(36).slice(2)}`}) RETURNING id`;
      const [s] =
        await tx`INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id,
          supplying_hospital_id, patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, supplied_at)
        VALUES (${h!.id}, ${f.h!}, ${f[`point${point}`]!}, ${f.h!}, ${f.patient!}, ${f.rx!}, ${f.product!},
          ${f[`batch${batch}`]!}, 1, 'tablet', now()) RETURNING id`;
      await tx`INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
          effective_at, actor_user_id, source_kind, source_id)
        VALUES (${f.h!}, ${f[`point${point}`]!}, ${f[`batch${batch}`]!}, 'supplied', -1, now(), ${f.actor!}, 'supply', ${s!.id})`;
      if (asLine)
        await tx`INSERT INTO public.pharmacy_line_events (hospital_id, prescription_id, patient_user_id, dispensing_point_id,
          kind, quantity_supplied, handover_id, actor_user_id)
        VALUES (${f.h!}, ${f.rx!}, ${f.patient!}, ${f[`point${point}`]!}, 'supplied', 1, ${h!.id}, ${f.actor!})`;
      // Hold the transaction open briefly so the two genuinely overlap.
      await tx`SELECT pg_sleep(0.2)`;
    });

  it("two supplies of the last unit of one batch: exactly one commits", async () => {
    const results = await Promise.allSettled([
      handOver(a, "A", "R", false),
      handOver(b, "A", "R", false),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(failed.reason)).toMatch(/holds 0/);
  });

  it("two hand-overs of one line at two points: exactly one supplies it", async () => {
    // Different points, different batches, one unit each: only the line lock can stop the second.
    const results = await Promise.allSettled([
      handOver(a, "A", "A", true),
      handOver(b, "B", "B", true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [n] = await setup`SELECT count(*)::int AS n FROM public.pharmacy_line_events
      WHERE prescription_id = ${f.rx!} AND kind = 'supplied'`;
    expect(n!.n).toBe(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(failed.reason)).toMatch(/already_supplied/);
  });
});
