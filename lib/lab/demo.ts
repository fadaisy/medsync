import "server-only";

import { randomUUID } from "node:crypto";
import type { EmrActor } from "@/lib/emr/actor";
import type { EmrDb } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { EmrWriteError, withPatientWrite } from "@/lib/emr/write/context";
import { enterResults, releaseResults } from "@/lib/emr/write/results";
import { encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";

/**
 * The lab demo loader (Lab Phase 5, owner request; gate-a A19, migration 0157). Only in a hospital a superadmin has
 * marked in `lab_demo_hospitals`; never anywhere else (the foreign keys refuse it). One "lab day": eight patients
 * labelled "Demo patient NN" (accounts that cannot sign in), each with lab orders at a different stage of the
 * worklist: to collect, to receive, to result, to release, released.
 *
 * Orders, specimens and their events are written as the Lab Phase 1 trial writes them; results go through the
 * normal entry and release path as the lab user who pressed the button, so every hook (units and ranges, delta
 * checks, IPC, audit) runs. **No clinical number is invented:** a result is the middle of the hospital's own signed
 * reference range for that component, rounded to the signed decimals. A test with no signed range is ordered and
 * received only. Laboratory records are append-only, so a demo is never deleted: the demo hospital is the sandbox.
 */

export const DEMO_PATIENTS = 8;
/** Which stage each demo patient's orders reach: 1-2 to collect, 3-4 to receive, 5-6 to result, 7 to release, 8 released. */
export function stageOf(n: number): "ordered" | "collected" | "received" | "preliminary" | "final" {
  return n <= 2
    ? "ordered"
    : n <= 4
      ? "collected"
      : n <= 6
        ? "received"
        : n === 7
          ? "preliminary"
          : "final";
}
/** The middle of a signed range, at the signed decimals; null when either end is open. */
export function midValue(low: number | null, high: number | null, decimals: number | null) {
  if (low === null || high === null || high < low) return null;
  return ((low + high) / 2).toFixed(Math.max(0, Math.min(decimals ?? 1, 4)));
}

export interface DemoDeps {
  /** Creates a patient account that cannot sign in and returns its id (Supabase admin in the app, a fixture in tests). */
  makePatientUser: (label: string) => Promise<string>;
}

type Test = {
  id: string;
  display: string;
  values: { conceptId: string; value: string | null }[];
};

async function demoTests(db: EmrDb, hospitalId: string): Promise<Test[]> {
  const rows = rowsOf<{
    test: string;
    display: string;
    concept: string;
    decimals: number | null;
    low: string | null;
    high: string | null;
  }>(
    await db.execute(sql`SELECT m.test_id AS test, t.display, m.concept_id AS concept, m.decimal_places AS decimals,
        b.low::text AS low, b.high::text AS high
      FROM lab_component_measures m
      JOIN test_catalogue t ON t.id = m.test_id
      LEFT JOIN LATERAL (
        SELECT b.low, b.high FROM reference_range_versions v
          JOIN reference_range_bands b ON b.version_id = v.id
         WHERE v.hospital_id = m.hospital_id AND v.test_id = m.test_id AND v.concept_id = m.concept_id
           AND v.status = 'signed' AND v.in_force_from <= now() AND b.rejected_reason IS NULL
           AND b.sex = 'any' AND b.age_from_days IS NULL AND b.age_to_days IS NULL
         ORDER BY v.in_force_from DESC LIMIT 1) b ON true
     WHERE m.hospital_id = ${hospitalId} AND m.result_type = 'number' AND m.superseded_by IS NULL
       AND t.restricted_class IS NULL
     ORDER BY t.display, m.concept_id`),
  );
  const byTest = new Map<string, Test>();
  for (const r of rows) {
    const t = byTest.get(r.test) ?? { id: r.test, display: r.display, values: [] };
    t.values.push({
      conceptId: r.concept,
      value: midValue(
        r.low === null ? null : Number(r.low),
        r.high === null ? null : Number(r.high),
        r.decimals,
      ),
    });
    byTest.set(r.test, t);
  }
  return [...byTest.values()].slice(0, 3);
}

/** One demo lab day at a demo hospital. Returns the load id and what was written. */
export async function loadLabDemoDay(
  db: EmrDb,
  lab: EmrActor,
  deps: DemoDeps,
): Promise<{ loadId: string; counts: Record<string, number> }> {
  const h = lab.hospitalId;
  const [demo] = rowsOf<{ ok: number }>(
    await db.execute(sql`SELECT 1 AS ok FROM lab_demo_hospitals WHERE hospital_id = ${h}`),
  );
  if (!demo)
    throw new EmrWriteError(
      "forbidden",
      "This hospital is not a demo hospital. Demo data goes only into a demo hospital.",
    );
  const [doctor] = rowsOf<{ id: string; dept: string; cadre: string }>(
    await db.execute(sql`SELECT a.user_id AS id, a.department_id AS dept, c.code AS cadre
      FROM staff_affiliations a JOIN cadres c ON c.id = a.cadre_id
     WHERE a.hospital_id = ${h} AND a.state IN ('active','approved') AND a.department_id IS NOT NULL
       AND c.code IN ('MEDICAL_OFFICER','MEDICAL_OFFICER_SG','CONSULTANT','SENIOR_CONSULTANT','INTERN_DOCTOR','CLINICAL_OFFICER')
     ORDER BY a.approved_at NULLS LAST LIMIT 1`),
  );
  if (!doctor)
    throw new EmrWriteError(
      "config",
      "Add a doctor to the demo hospital first: demo orders need someone who ordered them.",
    );
  const tests = await demoTests(db, h);
  if (!tests.length)
    throw new EmrWriteError(
      "config",
      "Set up at least one numeric test with its unit (Test catalogue) in this lab first.",
    );
  const [district] = rowsOf<{ id: string }>(
    await db.execute(sql`SELECT id FROM districts LIMIT 1`),
  );
  const [load] = rowsOf<{ id: string }>(
    await db.execute(sql`INSERT INTO lab_demo_loads (hospital_id, started_by, scenario)
      VALUES (${h}, ${lab.userId}, 'lab_day') RETURNING id`),
  );
  const counts = { patients: 0, orders: 0, specimens: 0, results: 0, released: 0, notResulted: 0 };
  try {
    for (let n = 1; n <= DEMO_PATIENTS; n++) {
      const label = `Demo patient ${String(n).padStart(2, "0")}`;
      const p = await deps.makePatientUser(label);
      await db.execute(sql`INSERT INTO users (id, full_name, email, state)
        VALUES (${p}, ${label}, ${`lab-demo-${p}@demo.medsync.invalid`}, 'active') ON CONFLICT (id) DO NOTHING`);
      await db.execute(sql`INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth,
          id_type, phone_encrypted, district_id, primary_facility_id)
        VALUES (${p}, ${encrypt("Demo")}, ${encrypt(`patient ${String(n).padStart(2, "0")}`)},
          ${n % 2 ? "female" : "male"}, ${`${1960 + n * 4}-0${1 + (n % 9)}-15`}, 'none', ${encrypt("+256700000000")},
          ${district?.id ?? null}, ${h})`);
      await db.execute(sql`INSERT INTO lab_demo_patients (load_id, hospital_id, patient_user_id, label)
        VALUES (${load!.id}, ${h}, ${p}, ${label})`);
      await db.execute(sql`INSERT INTO patient_intakes (hospital_id, entry_type_code, patient_user_id, status, arrived_at)
        VALUES (${h}, 'walk_in', ${p}, 'arrived', now())`);
      const [enc] = rowsOf<{ id: string }>(
        await db.execute(sql`INSERT INTO encounters (hospital_id, patient_user_id, clinician_user_id, department_id, state, started_at)
          VALUES (${h}, ${p}, ${doctor.id}, ${doctor.dept}, 'in_progress', now()) RETURNING id`),
      );
      counts.patients += 1;
      const stage = stageOf(n);
      for (const t of tests.slice(0, n % 2 ? 2 : 1)) {
        const [order] = rowsOf<{ id: string }>(
          await db.execute(sql`INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id,
              lifecycle, hospital_id, test_id, priority, frequency, performer, intent_source, requester_cadre, effective_at,
              reason_text_ciphertext, client_key)
            VALUES (${enc!.id}, ${p}, 'lab', ${t.display}, ${doctor.id}, 'events', ${h}, ${t.id}, 'routine', 'once',
              'in_house', 'clinician', ${doctor.cadre}, now(), ${encrypt("Demo request")}, ${`lab-demo-${randomUUID()}`})
            RETURNING id`),
        );
        await db.execute(sql`INSERT INTO encounter_order_events (order_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
          VALUES (${order!.id}, ${h}, ${p}, 'placed', ${doctor.id}, ${doctor.cadre})`);
        counts.orders += 1;
        if (stage === "ordered") continue;
        const [sp] = rowsOf<{ id: string }>(
          await db.execute(sql`INSERT INTO specimens (order_id, hospital_id, patient_user_id, specimen_type, container,
              collected_at, collected_by_user_id, collector_cadre, identifiers_confirmed, label_no)
            SELECT ${order!.id}, ${h}, ${p}, coalesce(t.specimen_type, 'unknown'), coalesce(t.container, 'unknown'), now(),
              ${doctor.id}, ${doctor.cadre}, true, ${`DEMO-${n}-${counts.orders}`}
              FROM test_catalogue t WHERE t.id = ${t.id}
            RETURNING id`),
        );
        counts.specimens += 1;
        if (stage === "collected") continue;
        await db.execute(sql`INSERT INTO specimen_events (specimen_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
          VALUES (${sp!.id}, ${h}, ${p}, 'received', ${lab.userId}, ${lab.cadreCode})`);
        if (stage === "received") continue;
        const values = t.values.filter((v) => v.value !== null);
        if (values.length !== t.values.length) {
          counts.notResulted += 1; // a component without a signed range: received, left for a person
          continue;
        }
        const r = await withPatientWrite(
          lab,
          p,
          (ctx) =>
            enterResults(ctx, {
              patientUserId: p,
              orderId: order!.id,
              status: "preliminary",
              values: values.map((v) => ({ conceptId: v.conceptId, value: v.value! })),
              clientKey: `lab-demo-${randomUUID()}`,
            }),
          { database: db },
        );
        counts.results += 1;
        if (stage === "preliminary") continue;
        await withPatientWrite(
          lab,
          p,
          (ctx) =>
            releaseResults(ctx, {
              patientUserId: p,
              reportId: r.id,
              clientKey: `lab-demo-${randomUUID()}`,
            }),
          { database: db },
        );
        counts.released += 1;
      }
    }
    await db.execute(sql`UPDATE lab_demo_loads SET finished_at = now(), counts = ${JSON.stringify(counts)}::jsonb
      WHERE id = ${load!.id}`);
  } catch (e) {
    await db.execute(sql`UPDATE lab_demo_loads SET finished_at = now(), counts = ${JSON.stringify(counts)}::jsonb,
        error = ${(e instanceof Error ? e.message : String(e)).slice(0, 500)} WHERE id = ${load!.id}`);
    throw e;
  }
  return { loadId: load!.id, counts };
}

/** The demo hospital's loads, newest first, for the page. */
export async function demoLoads(db: EmrDb, hospitalId: string) {
  return rowsOf<{
    id: string;
    startedAt: Date;
    counts: Record<string, number>;
    error: string | null;
  }>(
    await db.execute(sql`SELECT id, started_at AS "startedAt", counts, error FROM lab_demo_loads
      WHERE hospital_id = ${hospitalId} ORDER BY started_at DESC LIMIT 20`),
  );
}

/** False, not an error, where 0157 is not applied yet: the lab layout asks on every page. */
export async function isDemoHospital(db: EmrDb, hospitalId: string) {
  try {
    return (
      rowsOf<{ ok: number }>(
        await db.execute(
          sql`SELECT 1 AS ok FROM lab_demo_hospitals WHERE hospital_id = ${hospitalId}`,
        ),
      ).length > 0
    );
  } catch {
    return false;
  }
}
