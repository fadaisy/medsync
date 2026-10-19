import "server-only";

import { randomUUID } from "node:crypto";
import type { EmrActor } from "@/lib/emr/actor";
import type { EmrDb } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { EmrWriteError, withPatientWrite } from "@/lib/emr/write/context";
import { acknowledgeResults, enterResults, releaseResults } from "@/lib/emr/write/results";
import { encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";
import { DEMO_SECTIONS } from "./demo-sections";

/**
 * The lab demo loader (owner requests, 17 and 18 Oct 2026; gate-a A19, migrations 0157 and 0158). Only in a hospital a
 * superadmin marked in `lab_demo_hospitals`. One press fills every lab page through the real stores:
 *
 *  - Demo people: patients "Demo patient NN" and staff "Demo lab lead", "Demo CSO" and so on. Every account is banned
 *    for a century and has an `.invalid` address, so nobody can sign in as them. Demo staff sign the demo's settings
 *    through the normal signing code, as distinct people (the owner chose this for demo hospitals only); none is a
 *    superadmin.
 *  - Numbers: units, decimals and LOINC codes from the catalogue research; reference ranges from the research's
 *    published Ugandan studies, with their citations. Where no published value exists (response times, QC targets,
 *    delta limits, control ranges) the value is derived from those ranges and labelled "Demo".
 *  - Each section runs in its own transactions; one that fails is recorded on the load and the rest carry on.
 *
 * Laboratory records are append-only, so a demo is never deleted: the demo hospital is the sandbox.
 */

export const DEMO_PATIENTS = 8;
/** Which stage each worklist patient's orders reach: 1-2 to collect, 3-4 to receive, 5-6 to result, 7 to release, 8 released. */
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
/** A value at a fraction of the band width from the low end (0.5 = middle, 1.5 = half a band above), at the decimals. */
export function bandValue(low: number, high: number, at: number, decimals: number | null) {
  return (low + (high - low) * at).toFixed(Math.max(0, Math.min(decimals ?? 1, 4)));
}

export interface DemoDeps {
  /** Creates an account that cannot sign in and returns its id (Supabase admin in the app, a fixture in tests). */
  makePatientUser: (label: string) => Promise<string>;
}

export type Band = { low: number; high: number };
export type DemoComponent = {
  conceptId: string;
  decimals: number | null;
  unit: string | null;
  bands: { any?: Band; female?: Band; male?: Band };
};
export type DemoTest = { id: string; code: string; display: string; components: DemoComponent[] };
export type DemoPatient = {
  id: string;
  n: number;
  label: string;
  sex: "female" | "male";
  surname: string;
  dob: string;
  enc: string;
};
export type DemoPeople = Record<
  "author" | "lead" | "cso" | "dp" | "ipcLead" | "ipcNurse" | "nurse" | "tech2",
  string
>;

export interface DemoState {
  db: EmrDb;
  lab: EmrActor;
  doctorActor: EmrActor;
  h: string;
  now: Date;
  loadId: string;
  deps: DemoDeps;
  doctor: { id: string; dept: string; cadre: string; affiliation: string };
  labDept: string;
  district: string | null;
  people: DemoPeople;
  tests: DemoTest[];
  patients: DemoPatient[];
  counts: Record<string, number>;
  notes: Record<string, string>;
}

export const DAY = 86_400_000;
export const key = () => `lab-demo-${randomUUID()}`;
export const bump = (s: DemoState, k: string, by = 1) => (s.counts[k] = (s.counts[k] ?? 0) + by);

/** A band for this patient's sex, else the any-sex band, else the first one there is. */
export function bandFor(c: DemoComponent, sex: "female" | "male"): Band | null {
  return c.bands[sex] ?? c.bands.any ?? c.bands.female ?? c.bands.male ?? null;
}
/** Values at `at` of the band for every component, or null when one component has no band. */
export function valuesFor(t: DemoTest, sex: "female" | "male", at = 0.5) {
  const out: { conceptId: string; value: string }[] = [];
  for (const c of t.components) {
    const b = bandFor(c, sex);
    if (!b) return null;
    out.push({ conceptId: c.conceptId, value: bandValue(b.low, b.high, at, c.decimals) });
  }
  return out;
}

/** Numeric tests here whose every numeric component has a measure and a signed band (sex-specific allowed). */
export async function demoTests(db: EmrDb, hospitalId: string): Promise<DemoTest[]> {
  const rows = rowsOf<{
    test: string;
    code: string;
    display: string;
    concept: string;
    decimals: number | null;
    unit: string | null;
    sex: string | null;
    low: string | null;
    high: string | null;
  }>(
    await db.execute(sql`SELECT m.test_id AS test, t.code, t.display, m.concept_id AS concept,
        m.decimal_places AS decimals, m.unit_ucum AS unit, b.sex, b.low::text AS low, b.high::text AS high
      FROM lab_component_measures m
      JOIN test_catalogue t ON t.id = m.test_id
      LEFT JOIN reference_range_versions v ON v.hospital_id = m.hospital_id AND v.test_id = m.test_id
        AND v.concept_id = m.concept_id AND v.status = 'signed' AND v.in_force_from <= now()
      LEFT JOIN reference_range_bands b ON b.version_id = v.id AND b.rejected_reason IS NULL
        AND (b.age_to_days IS NULL OR b.age_to_days > 6570)
     WHERE m.hospital_id = ${hospitalId} AND m.result_type = 'number' AND m.superseded_by IS NULL
       AND t.restricted_class IS NULL
     ORDER BY t.display, m.concept_id`),
  );
  const byTest = new Map<string, DemoTest>();
  for (const r of rows) {
    const t = byTest.get(r.test) ?? {
      id: r.test,
      code: r.code,
      display: r.display,
      components: [],
    };
    let c = t.components.find((x) => x.conceptId === r.concept);
    if (!c) {
      c = { conceptId: r.concept, decimals: r.decimals, unit: r.unit, bands: {} };
      t.components.push(c);
    }
    if (r.low !== null && r.high !== null && r.sex) {
      const sex = r.sex as "any" | "female" | "male";
      c.bands[sex] ??= { low: Number(r.low), high: Number(r.high) };
    }
    byTest.set(r.test, t);
  }
  return [...byTest.values()].filter((t) =>
    t.components.every((c) => c.bands.any || c.bands.female || c.bands.male),
  );
}

/* ─── People ─────────────────────────────────────────────────────────── */

async function demoAccount(s: Pick<DemoState, "db" | "deps">, label: string) {
  const id = await s.deps.makePatientUser(label);
  await s.db.execute(sql`INSERT INTO users (id, full_name, email, state)
    VALUES (${id}, ${label}, ${`lab-demo-${id}@demo.medsync.invalid`}, 'active') ON CONFLICT (id) DO NOTHING`);
  return id;
}

/** A demo staff member with an affiliation in a department (needed to collect, record checks or transcribe). */
async function demoStaff(
  s: Pick<DemoState, "db" | "deps" | "h">,
  label: string,
  dept: string,
  cadre: string,
) {
  const id = await demoAccount(s, label);
  await s.db
    .execute(sql`INSERT INTO staff_affiliations (user_id, hospital_id, department_id, cadre_id, role_id,
      employment_type, state, approved_at)
    SELECT ${id}, ${s.h}, ${dept}, c.id,
      coalesce((SELECT r.id FROM roles r WHERE r.cadre_id = c.id LIMIT 1), (SELECT r.id FROM roles r LIMIT 1)),
      'full_time', 'active', now()
      FROM cadres c WHERE c.code = ${cadre}`);
  return id;
}

async function people(s: DemoState): Promise<DemoPeople> {
  const p = {
    author: await demoAccount(s, "Demo author"),
    lead: await demoStaff(s, "Demo lab lead", s.labDept, "LAB_TECHNOLOGIST"),
    cso: await demoAccount(s, "Demo CSO"),
    dp: await demoAccount(s, "Demo data protection lead"),
    ipcLead: await demoAccount(s, "Demo IPC lead"),
    ipcNurse: await demoStaff(s, "Demo IPC link nurse", s.doctor.dept, "NURSE"),
    nurse: await demoStaff(s, "Demo nurse", s.doctor.dept, "NURSE"),
    tech2: await demoStaff(s, "Demo second technician", s.labDept, "LAB_TECHNOLOGIST"),
  };
  // The demo lab lead is an acting head of the laboratory; the designations exist only in this demo hospital.
  await s.db.execute(sql`INSERT INTO department_heads (hospital_id, department_id, user_id, acting)
    VALUES (${s.h}, ${s.labDept}, ${p.lead}, true)`);
  await s.db
    .execute(sql`INSERT INTO hospital_designations (hospital_id, role, user_id, starts_on, set_by) VALUES
    (${s.h}, 'data_protection_lead', ${p.dp}, current_date - 1, ${s.lab.userId}),
    (${s.h}, 'ipc_lead', ${p.ipcLead}, current_date - 1, ${s.lab.userId}),
    (${s.h}, 'ipc_link_nurse', ${p.ipcNurse}, current_date - 1, ${s.lab.userId}),
    (${s.h}, 'surveillance_focal_person', ${p.ipcLead}, current_date - 1, ${s.lab.userId})`);
  bump(s, "staff", 8);
  return p;
}

/* ─── Patients, orders, specimens ────────────────────────────────────── */

export async function newPatient(s: DemoState, sex?: "female" | "male"): Promise<DemoPatient> {
  const n = s.patients.length + 1;
  const nn = String(n).padStart(2, "0");
  const label = `Demo patient ${nn}`;
  const sx = sex ?? (n % 2 ? "female" : "male");
  const dob = `${1960 + ((n * 4) % 40)}-0${1 + (n % 9)}-15`;
  const id = await s.deps.makePatientUser(label);
  await s.db.execute(sql`INSERT INTO users (id, full_name, email, state)
    VALUES (${id}, ${label}, ${`lab-demo-${id}@demo.medsync.invalid`}, 'active') ON CONFLICT (id) DO NOTHING`);
  await s.db
    .execute(sql`INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth,
      id_type, phone_encrypted, district_id, primary_facility_id)
    VALUES (${id}, ${encrypt("Demo")}, ${encrypt(`patient ${nn}`)}, ${sx}, ${dob}, 'none', ${encrypt("+256700000000")},
      ${s.district}, ${s.h})`);
  await s.db
    .execute(sql`INSERT INTO lab_demo_patients (load_id, hospital_id, patient_user_id, label)
    VALUES (${s.loadId}, ${s.h}, ${id}, ${label})`);
  await s.db
    .execute(sql`INSERT INTO patient_intakes (hospital_id, entry_type_code, patient_user_id, status, arrived_at)
    VALUES (${s.h}, 'walk_in', ${id}, 'arrived', now())`);
  const [enc] = rowsOf<{ id: string }>(
    await s.db
      .execute(sql`INSERT INTO encounters (hospital_id, patient_user_id, clinician_user_id, department_id, state, started_at)
      VALUES (${s.h}, ${id}, ${s.doctor.id}, ${s.doctor.dept}, 'in_progress', now()) RETURNING id`),
  );
  const p = { id, n, label, sex: sx, surname: `patient ${nn}`, dob, enc: enc!.id };
  s.patients.push(p);
  bump(s, "patients");
  return p;
}

export async function placeOrder(s: DemoState, p: DemoPatient, testId: string, at = s.now) {
  const [order] = rowsOf<{ id: string }>(
    await s.db
      .execute(sql`INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id,
        lifecycle, hospital_id, test_id, priority, frequency, performer, intent_source, requester_cadre, effective_at,
        reason_text_ciphertext, client_key, created_at)
      SELECT ${p.enc}, ${p.id}, 'lab', t.display, ${s.doctor.id}, 'events', ${s.h}, t.id, 'routine', 'once', 'in_house',
        'clinician', ${s.doctor.cadre}, ${at.toISOString()}::timestamptz, ${encrypt("Demo request")}, ${key()},
        ${at.toISOString()}::timestamptz
        FROM test_catalogue t WHERE t.id = ${testId}
      RETURNING id`),
  );
  await s.db
    .execute(sql`INSERT INTO encounter_order_events (order_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
    VALUES (${order!.id}, ${s.h}, ${p.id}, 'placed', ${s.doctor.id}, ${s.doctor.cadre})`);
  bump(s, "orders");
  return order!.id;
}

export async function collect(s: DemoState, p: DemoPatient, orderId: string, at = s.now) {
  const [sp] = rowsOf<{ id: string }>(
    await s.db
      .execute(sql`INSERT INTO specimens (order_id, hospital_id, patient_user_id, specimen_type, container,
        collected_at, collected_by_user_id, collector_cadre, identifiers_confirmed, label_no)
      SELECT ${orderId}, ${s.h}, ${p.id}, coalesce(t.specimen_type, 'unknown'), coalesce(t.container, 'unknown'),
        ${at.toISOString()}::timestamptz, ${s.doctor.id}, ${s.doctor.cadre}, true, ${`DEMO-${p.n}-${randomUUID().slice(0, 6)}`}
        FROM encounter_orders o JOIN test_catalogue t ON t.id = o.test_id WHERE o.id = ${orderId}
      RETURNING id`),
  );
  bump(s, "specimens");
  return sp!.id;
}

export async function receive(s: DemoState, p: DemoPatient, specimenId: string) {
  await s.db
    .execute(sql`INSERT INTO specimen_events (specimen_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
    VALUES (${specimenId}, ${s.h}, ${p.id}, 'received', ${s.lab.userId}, ${s.lab.cadreCode})`);
}

/** Order, collect, receive, and (optionally) enter and release, all at `at`. */
export async function runTest(
  s: DemoState,
  p: DemoPatient,
  t: DemoTest,
  o: {
    values?: { conceptId: string; value?: string; code?: string }[];
    stop?: "received" | "preliminary" | "final";
    at?: Date;
  } = {},
) {
  const at = o.at ?? s.now;
  const orderId = await placeOrder(s, p, t.id, at);
  const specimenId = await collect(s, p, orderId, at);
  await receive(s, p, specimenId);
  const stop = o.stop ?? "final";
  if (stop === "received") return { orderId, specimenId, reportId: null as string | null };
  const values = o.values ?? valuesFor(t, p.sex);
  if (!values) return { orderId, specimenId, reportId: null as string | null };
  const r = await withPatientWrite(
    s.lab,
    p.id,
    (ctx) =>
      enterResults(ctx, {
        patientUserId: p.id,
        orderId,
        status: "preliminary",
        values,
        clientKey: key(),
      }),
    { database: s.db, now: at },
  );
  bump(s, "results");
  if (stop === "preliminary") return { orderId, specimenId, reportId: r.id };
  const rel = await withPatientWrite(
    s.lab,
    p.id,
    (ctx) => releaseResults(ctx, { patientUserId: p.id, reportId: r.id, clientKey: key() }),
    { database: s.db, now: at },
  );
  bump(s, "released");
  return { orderId, specimenId, reportId: rel.id };
}

export async function review(s: DemoState, p: DemoPatient, reportId: string) {
  await withPatientWrite(
    s.doctorActor,
    p.id,
    (ctx) =>
      acknowledgeResults(ctx, {
        patientUserId: p.id,
        items: [{ reportId, action: "seen" }],
        clientKey: key(),
      }),
    { database: s.db },
  );
  bump(s, "reviewed");
}

/* ─── The worklist section (the original demo lab day) ───────────────── */

async function worklist(s: DemoState) {
  const tests = s.tests;
  for (let i = 1; i <= DEMO_PATIENTS; i++) {
    const p = await newPatient(s);
    const stage = stageOf(i);
    for (const t of tests.slice(0, i % 2 ? 2 : 1)) {
      const orderId = await placeOrder(s, p, t.id);
      if (stage === "ordered") continue;
      const sp = await collect(s, p, orderId);
      if (stage === "collected") continue;
      await receive(s, p, sp);
      if (stage === "received") continue;
      const values = valuesFor(t, p.sex);
      if (!values) continue;
      const r = await withPatientWrite(
        s.lab,
        p.id,
        (ctx) =>
          enterResults(ctx, {
            patientUserId: p.id,
            orderId,
            status: "preliminary",
            values,
            clientKey: key(),
          }),
        { database: s.db },
      );
      bump(s, "results");
      if (stage === "preliminary") continue;
      const rel = await withPatientWrite(
        s.lab,
        p.id,
        (ctx) => releaseResults(ctx, { patientUserId: p.id, reportId: r.id, clientKey: key() }),
        { database: s.db },
      );
      bump(s, "released");
      await review(s, p, rel.id);
    }
  }
}

/* ─── The load ───────────────────────────────────────────────────────── */

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

/** One demo load at a demo hospital: every section in order. Returns the load id, what was written, and any section that stopped. */
export async function loadLabDemo(
  db: EmrDb,
  lab: EmrActor,
  deps: DemoDeps,
  now = new Date(),
): Promise<{ loadId: string; counts: Record<string, number>; notes: Record<string, string> }> {
  const h = lab.hospitalId;
  if (!(await isDemoHospital(db, h)))
    throw new EmrWriteError(
      "forbidden",
      "This hospital is not a demo hospital. Demo data goes only into a demo hospital.",
    );
  const [doctor] = rowsOf<{ id: string; dept: string; cadre: string; affiliation: string }>(
    await db.execute(sql`SELECT a.user_id AS id, a.department_id AS dept, c.code AS cadre, a.id AS affiliation
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
  const [labDept] = rowsOf<{ id: string }>(
    await db.execute(sql`SELECT id FROM hospital_departments WHERE hospital_id = ${h} AND catalogue_code = 'LABORATORY'
      ORDER BY created_at LIMIT 1`),
  );
  if (!labDept && !lab.departmentId)
    throw new EmrWriteError("config", "The demo hospital needs a Laboratory department.");
  const [district] = rowsOf<{ id: string }>(
    await db.execute(sql`SELECT id FROM districts LIMIT 1`),
  );
  const [load] = rowsOf<{ id: string }>(
    await db.execute(sql`INSERT INTO lab_demo_loads (hospital_id, started_by, scenario)
      VALUES (${h}, ${lab.userId}, 'lab_day') RETURNING id`),
  );
  const s: DemoState = {
    db,
    lab,
    doctorActor: {
      userId: doctor.id,
      fullName: null,
      hospitalId: h,
      departmentId: doctor.dept,
      affiliationId: doctor.affiliation,
      cadreCode: doctor.cadre,
      isClinical: true,
      surface: "doctor",
    } as EmrActor,
    h,
    now,
    loadId: load!.id,
    deps,
    doctor,
    labDept: labDept?.id ?? lab.departmentId!,
    district: district?.id ?? null,
    people: {} as DemoPeople,
    tests: [],
    patients: [],
    counts: {},
    notes: {},
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      s.notes[name] = (e instanceof Error ? e.message : String(e)).slice(0, 240);
    }
  };
  await step("people", async () => {
    s.people = await people(s);
  });
  for (const [name, fn] of DEMO_SECTIONS.before) await step(name, () => fn(s));
  s.tests = await demoTests(db, h);
  if (!s.tests.length) s.notes.tests = "No numeric test has a unit and a signed range yet.";
  else {
    await step("worklist", () => worklist(s));
    for (const [name, fn] of DEMO_SECTIONS.after) await step(name, () => fn(s));
  }
  const error = Object.keys(s.notes).length
    ? Object.entries(s.notes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
        .slice(0, 500)
    : null;
  await db.execute(sql`UPDATE lab_demo_loads SET finished_at = now(), counts = ${JSON.stringify(s.counts)}::jsonb,
      error = ${error} WHERE id = ${s.loadId}`);
  return { loadId: s.loadId, counts: s.counts, notes: s.notes };
}

/** Kept for callers of the first version: the same full load. */
export const loadLabDemoDay = loadLabDemo;

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
