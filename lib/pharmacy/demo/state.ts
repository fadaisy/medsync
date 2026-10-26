import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { SQL } from "drizzle-orm";
import type { z } from "zod";
import { randomUUID } from "node:crypto";

import { encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";

/**
 * The pharmacy demo's shared state (ADR 0450). Sections run in order and add what later ones need. Every demo person
 * and patient is a real account that can never sign in (banned for a century in the app, an `.invalid` address), with
 * "Demo" in the name. Every dose, frequency and direction is `[demo dose]`.
 */

export const DAY = 86_400_000;
export const DEMO_DOSE = "[demo dose]";

export interface DemoDeps {
  /** Creates an account that cannot sign in and returns its id (Supabase admin in the app, a fixture in tests). */
  makeUser: (label: string) => Promise<string>;
}

export type PointKey = "opd" | "emergency" | "inpatient" | "paediatrics" | "maternity" | "art" | "ncd" | "private";
export type ClinicKey = "gopd" | "ncd" | "art" | "popd" | "anc" | "ed";
export type WardKey = "medM" | "medF" | "surgical" | "paediatric" | "maternity" | "icu";

export type DemoPoint = { key: PointKey; id: string; name: string; serves: "window" | "wards" | "emergency" | "all" };
export type DemoPatient = {
  id: string;
  n: number;
  label: string;
  sex: "female" | "male";
  dob: string;
  /** The visit the patient's prescriptions belong to. */
  enc: string;
  /** Outpatients collect at a window; inpatients are on a ward. */
  kind: "outpatient" | "inpatient";
  clinic: ClinicKey | null;
  ward: WardKey | null;
  /** The point that serves this patient's prescriptions. */
  point: PointKey;
};
export type DemoMedicine = {
  id: string;
  name: string;
  /** The product's name on the shelf, e.g. "Amoxicillin capsules". */
  product: string;
  unit: "tablet" | "capsule" | "vial" | "ampoule" | "bottle" | "sachet" | "bag" | "tube" | "pen" | "inhaler";
  controlled: boolean;
};

export type DemoPeople = {
  admin: string;
  chief: string;
  cso: string;
  author: string;
  pharmacists: string[];
  techs: string[];
  doctors: string[];
  nurses: string[];
  storekeeper: string;
};

export interface DemoState {
  db: EmrDb;
  h: string;
  now: Date;
  loadId: string;
  deps: DemoDeps;
  district: string | null;
  people: DemoPeople;
  pharmacyDept: string;
  points: Record<PointKey, DemoPoint>;
  clinics: Record<ClinicKey, string>;
  wards: Record<WardKey, string>;
  patients: DemoPatient[];
  medicines: DemoMedicine[];
  /** Filled by the stock section: medicine id → point → product and its batches (oldest expiry first). */
  stock: Map<string, Map<PointKey, { productId: string; batches: string[] }>>;
  /** Cadre code → its name in `cadres`, as the app's actor carries it (filled by setup). */
  cadreNames: Record<string, string>;
  counts: Record<string, number>;
  notes: Record<string, string>;
}

export const key = (prefix = "pharmacy-demo") => `${prefix}-${randomUUID()}`;
export const bump = (s: DemoState, k: string, by = 1) => (s.counts[k] = (s.counts[k] ?? 0) + by);
export const at = (s: DemoState, daysAgo: number, hour = 9) => {
  const d = new Date(s.now.getTime() - daysAgo * DAY);
  d.setUTCHours(hour - 3, (daysAgo * 7) % 60, 0, 0); // East Africa Time is UTC+3
  return d;
};

/** Runs one statement and returns its rows. */
export async function q<T>(s: Pick<DemoState, "db">, query: SQL): Promise<T[]> {
  return rowsOf<T>(await s.db.execute(query));
}
export async function one<T>(s: Pick<DemoState, "db">, query: SQL): Promise<T> {
  const [row] = await q<T>(s, query);
  if (!row) throw new Error("The demo expected a row and got none.");
  return row;
}

/* ─── People ─────────────────────────────────────────────────────────── */

export async function demoAccount(s: Pick<DemoState, "db" | "deps">, label: string) {
  const id = await s.deps.makeUser(label);
  await s.db.execute(sql`INSERT INTO users (id, full_name, email, state)
    VALUES (${id}, ${label}, ${`pharmacy-demo-${id}@demo.medsync.invalid`}, 'active') ON CONFLICT (id) DO NOTHING`);
  return id;
}

/** A demo staff member with an active affiliation in a department, as an approved sign-up leaves them. */
export async function demoStaff(
  s: Pick<DemoState, "db" | "deps" | "h">,
  label: string,
  dept: string,
  cadre: string,
  role: "clinician" | "nurse" | null = "clinician",
) {
  const id = await demoAccount(s, label);
  await s.db.execute(sql`INSERT INTO staff_affiliations (user_id, hospital_id, department_id, cadre_id, role_id,
      employment_type, state, approved_at)
    SELECT ${id}, ${s.h}, ${dept}, c.id,
      coalesce((SELECT r.id FROM roles r WHERE r.cadre_id = c.id LIMIT 1), (SELECT r.id FROM roles r LIMIT 1)),
      'full_time', 'active', now() - interval '60 days'
      FROM cadres c WHERE c.code = ${cadre}`);
  if (role)
    await s.db.execute(sql`INSERT INTO user_roles (user_id, role, hospital_id) VALUES (${id}, ${role}, ${s.h})
      ON CONFLICT DO NOTHING`);
  return id;
}

export async function demoPatientProfile(s: DemoState, id: string, n: number, sex: "female" | "male", dob: string) {
  const nn = String(n).padStart(2, "0");
  await s.db.execute(sql`INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth,
      id_type, phone_encrypted, district_id, primary_facility_id)
    VALUES (${id}, ${encrypt("Demo")}, ${encrypt(`patient ${nn}`)}, ${sex}, ${dob}, 'none', ${encrypt("+256700000000")},
      ${s.district}, ${s.h})`);
  await s.db.execute(sql`INSERT INTO pharmacy_demo_patients (load_id, hospital_id, patient_user_id, label)
    VALUES (${s.loadId}, ${s.h}, ${id}, ${`Demo patient ${nn}`})`);
}

/** A pharmacy actor as the app builds one, on permission map v2 (the demo hospital is listed in PHARMACY_DEV_HOSPITALS). */
export function pharmacyActor(s: DemoState, userId: string, cadre: "PHARMACIST" | "PHARMACY_TECH", point: PointKey | null): PharmacyActor {
  return {
    userId,
    hospitalId: s.h,
    cadreCode: cadre,
    cadreName: s.cadreNames[cadre] ?? cadre,
    pointId: point ? s.points[point].id : null,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  };
}

/** A pharmacy write through the action's own path (Zod, permission and point, one transaction). Throws on refusal. */
export async function write<I, R extends { id: string }>(
  s: DemoState,
  actor: PharmacyActor,
  schema: z.ZodType<I>,
  need: PharmacyNeed,
  fn: (ctx: PharmacyCtx, input: I) => Promise<R>,
  raw: Record<string, unknown>,
  now = s.now,
): Promise<R> {
  const r = await runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, actor, need, fn, { database: s.db, now });
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r.data!;
}

/**
 * A pharmacy signed set, signed by two demo signers (the chief pharmacist and the demo CSO), as the signing page leaves
 * one. The database computes its hash (0135). Retires an earlier signed version of the same kind first.
 */
export async function signSet(s: DemoState, kind: string, content: unknown) {
  const [prev] = await q<{ version: number }>(
    s,
    sql`SELECT coalesce(max(version), 0)::int AS version FROM pharmacy_signed_sets WHERE hospital_id = ${s.h} AND kind = ${kind}`,
  );
  await s.db.execute(sql`UPDATE pharmacy_signed_sets SET status = 'retired', retired_at = now()
    WHERE hospital_id = ${s.h} AND kind = ${kind} AND status = 'signed'`);
  const row = await one<{ id: string }>(
    s,
    sql`INSERT INTO pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
      first_signer, first_signer_role, second_signer, second_signer_role, signed_at)
    VALUES (${s.h}, ${kind}, ${(prev?.version ?? 0) + 1}, ${JSON.stringify(content)}::jsonb, repeat('0', 64), 'signed',
      ${s.people.author}, ${s.people.chief}, 'Demo chief pharmacist', ${s.people.cso}, 'Demo clinical safety officer',
      now()) RETURNING id`,
  );
  bump(s, "signed_sets");
  return row.id;
}

/** The chief pharmacist at a point, with pharmacy.manage and pharmacy.store as the head of the PHARMACY department holds them. */
export function chiefActor(s: DemoState, point: PointKey | null): PharmacyActor {
  const a = pharmacyActor(s, s.people.chief, "PHARMACIST", point);
  return { ...a, access: { ...a.access, permissions: new Set([...a.access.permissions, "pharmacy.manage", "pharmacy.store"]) } } as PharmacyActor;
}

/** A passed witness attestation (password and TOTP in the app), by another demo person, for a controlled step. */
export async function witness(s: DemoState, actor: string, attester: string, action: string) {
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
        VALUES (${s.h}, ${actor}, ${attester}, 'witness', ${action}, 'passed') RETURNING id`,
    )
  ).id;
}
