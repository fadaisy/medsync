import "server-only";

import type { ClinicKey, DemoPatient, DemoPoint, DemoState, PointKey, WardKey } from "./state";
import { sql } from "drizzle-orm";

import { bump, DAY, demoAccount, demoPatientProfile, demoStaff, one, q } from "./state";

/**
 * Section 1: the national referral hospital's pharmacy and the people around it. Departments, points and wards are
 * found by name first, so a second load reuses them; staff and patients are new on every load.
 */

const POINTS: [PointKey, string, DemoPoint["serves"]][] = [
  ["opd", "Main outpatient pharmacy", "window"],
  ["emergency", "Emergency pharmacy", "emergency"],
  ["inpatient", "Inpatient pharmacy", "wards"],
  ["paediatrics", "Paediatric pharmacy", "all"],
  ["maternity", "Maternity pharmacy", "all"],
  ["art", "ART clinic pharmacy", "window"],
  ["ncd", "NCD clinic pharmacy", "window"],
  ["private", "Private wing pharmacy", "all"],
];
const CLINICS: [ClinicKey, string][] = [
  ["gopd", "General outpatients"],
  ["ncd", "NCD clinic"],
  ["art", "ART clinic"],
  ["popd", "Paediatric outpatients"],
  ["anc", "Antenatal clinic"],
  ["ed", "Emergency department"],
];
const WARDS: [WardKey, string][] = [
  ["medM", "Medical ward (men)"],
  ["medF", "Medical ward (women)"],
  ["surgical", "Surgical ward"],
  ["paediatric", "Paediatric ward"],
  ["maternity", "Maternity ward"],
  ["icu", "Intensive care unit"],
];

/** Who the 60 demo patients are: where they are seen and which point serves them. */
const COHORTS: { n: number; kind: DemoPatient["kind"]; clinic?: ClinicKey; ward?: WardKey; point: PointKey; child?: boolean }[] = [
  { n: 9, kind: "outpatient", clinic: "gopd", point: "opd" },
  { n: 3, kind: "outpatient", clinic: "gopd", point: "private" },
  { n: 8, kind: "outpatient", clinic: "ncd", point: "ncd" },
  { n: 6, kind: "outpatient", clinic: "art", point: "art" },
  { n: 4, kind: "outpatient", clinic: "popd", point: "paediatrics", child: true },
  { n: 3, kind: "outpatient", clinic: "anc", point: "maternity" },
  { n: 3, kind: "outpatient", clinic: "ed", point: "emergency" },
  { n: 5, kind: "inpatient", ward: "medM", point: "inpatient" },
  { n: 5, kind: "inpatient", ward: "medF", point: "inpatient" },
  { n: 4, kind: "inpatient", ward: "surgical", point: "inpatient" },
  { n: 4, kind: "inpatient", ward: "paediatric", point: "paediatrics", child: true },
  { n: 3, kind: "inpatient", ward: "maternity", point: "maternity" },
  { n: 3, kind: "inpatient", ward: "icu", point: "inpatient" },
];

const slug = (k: string) => `demo-${k}-${Math.random().toString(36).slice(2, 8)}`;

async function department(s: DemoState, name: string, kind: string, parent: string | null, code: string | null = null) {
  const [found] = await q<{ id: string }>(
    s,
    sql`SELECT id FROM hospital_departments WHERE hospital_id = ${s.h} AND name = ${name}
      AND (parent_id IS NOT DISTINCT FROM ${parent}) AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  if (found) return found.id;
  bump(s, "departments");
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO hospital_departments (hospital_id, parent_id, name, slug, kind, catalogue_code)
        VALUES (${s.h}, ${parent}, ${name}, ${slug(name.toLowerCase().replace(/\W+/g, "-"))}, ${kind}, ${code})
        RETURNING id`,
    )
  ).id;
}

export async function setup(s: DemoState) {
  // The PHARMACY department, its eight points (live for 40 days), the clinics and the wards.
  const [pharm] = await q<{ id: string }>(
    s,
    sql`SELECT id FROM hospital_departments WHERE hospital_id = ${s.h} AND catalogue_code = 'PHARMACY'
      AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  s.pharmacyDept = pharm?.id ?? (await department(s, "Pharmacy", "support", null, "PHARMACY"));
  const liveAt = new Date(s.now.getTime() - 40 * DAY).toISOString();
  for (const [k, name, serves] of POINTS) {
    const id = await department(s, name, "support", s.pharmacyDept);
    await s.db.execute(sql`INSERT INTO pharmacy_dispensing_points (department_id, hospital_id, serves, live_at, phone)
      VALUES (${id}, ${s.h}, ${serves}, ${liveAt}::timestamptz, '+256 700 000000') ON CONFLICT (department_id) DO NOTHING`);
    s.points[k] = { key: k, id, name, serves };
  }
  for (const [k, name] of CLINICS) s.clinics[k] = await department(s, name, "clinical", null);
  for (const [k, name] of WARDS) s.wards[k] = await department(s, name, "clinical", null);

  for (const c of await q<{ code: string; name: string }>(
    s,
    sql`SELECT code, name FROM cadres WHERE code IN ('PHARMACIST', 'PHARMACY_TECH')`,
  ))
    s.cadreNames[c.code] = c.name;

  // People. The chief pharmacist heads the pharmacy in this demo hospital only (pharmacy.manage).
  const p = s.people;
  p.author = await demoAccount(s, "Demo author");
  p.cso = await demoAccount(s, "Demo clinical safety officer");
  p.chief = await demoStaff(s, "Demo chief pharmacist", s.pharmacyDept, "PHARMACIST");
  await s.db.execute(sql`INSERT INTO department_heads (hospital_id, department_id, user_id, acting)
    VALUES (${s.h}, ${s.pharmacyDept}, ${p.chief}, false)`);
  p.storekeeper = await demoStaff(s, "Demo stores officer", s.pharmacyDept, "PHARMACY_TECH");
  const keys = POINTS.map(([k]) => k);
  for (const [i, k] of keys.entries()) {
    if (i < 6) p.pharmacists.push(await demoStaff(s, `Demo pharmacist ${i + 1}`, s.points[k].id, "PHARMACIST"));
    p.techs.push(await demoStaff(s, `Demo pharmacy technician ${i + 1}`, s.points[k].id, "PHARMACY_TECH"));
  }
  const doctors: [string, string, ClinicKey][] = [
    ["Demo medical officer 1", "MEDICAL_OFFICER", "gopd"],
    ["Demo medical officer 2", "MEDICAL_OFFICER", "ed"],
    ["Demo consultant physician", "CONSULTANT", "ncd"],
    ["Demo medical officer 3", "MEDICAL_OFFICER", "art"],
    ["Demo paediatrician", "CONSULTANT", "popd"],
    ["Demo intern doctor", "INTERN_DOCTOR", "gopd"],
  ];
  for (const [label, cadre, clinic] of doctors) p.doctors.push(await demoStaff(s, label, s.clinics[clinic], cadre));
  for (const [i, w] of (["medM", "medF", "surgical", "paediatric"] as const).entries())
    p.nurses.push(await demoStaff(s, `Demo nurse ${i + 1}`, s.wards[w], "NURSE", "nurse"));
  bump(s, "staff", 2 + 2 + 6 + 8 + doctors.length + 4);

  // A cosign policy so a medical officer's routine prescription stands alone (the intern's waits for a cosign).
  await s.db.execute(sql`INSERT INTO clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
    VALUES (${s.h}, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed') ON CONFLICT DO NOTHING`);

  // Settings: ward lines are supplied per patient, so inpatient prescriptions reach the review queue.
  await s.db.execute(sql`INSERT INTO pharmacy_hospital_settings (hospital_id, individual_inpatient_supply,
      expiry_lookahead_days, updated_by) VALUES (${s.h}, true, 90, ${p.admin})
    ON CONFLICT (hospital_id) DO UPDATE SET individual_inpatient_supply = true,
      expiry_lookahead_days = coalesce(pharmacy_hospital_settings.expiry_lookahead_days, 90)`);

  // Sixty patients, each with the visit their prescriptions belong to.
  for (const c of COHORTS)
    for (let i = 0; i < c.n; i++) {
      const n = s.patients.length + 1;
      const sex: DemoPatient["sex"] = c.ward === "maternity" || c.clinic === "anc" ? "female" : n % 2 ? "female" : "male";
      const year = c.child ? 2016 + (n % 9) : 1950 + ((n * 7) % 52);
      const dob = `${year}-${String(1 + (n % 12)).padStart(2, "0")}-${String(1 + ((n * 3) % 27)).padStart(2, "0")}`;
      const id = await demoAccount(s, `Demo patient ${String(n).padStart(2, "0")}`);
      await demoPatientProfile(s, id, n, sex, dob);
      const doctor = p.doctors[n % p.doctors.length]!;
      const dept = c.kind === "outpatient" ? s.clinics[c.clinic!] : s.wards[c.ward!];
      const type = c.kind === "inpatient" ? "inpatient" : c.clinic === "ed" ? "emergency" : c.clinic === "anc" ? "antenatal" : "opd";
      const started = new Date(s.now.getTime() - (c.kind === "inpatient" ? (2 + (n % 6)) * DAY : (n % 5) * 3_600_000));
      const enc = await one<{ id: string }>(
        s,
        sql`INSERT INTO encounters (hospital_id, patient_user_id, clinician_user_id, department_id, state, started_at,
            encounter_type, disposition)
          VALUES (${s.h}, ${id}, ${doctor}, ${dept}, 'in_progress', ${started.toISOString()}::timestamptz, ${type},
            ${c.kind === "outpatient" ? "home" : null}) RETURNING id`,
      );
      s.patients.push({
        id,
        n,
        label: `Demo patient ${String(n).padStart(2, "0")}`,
        sex,
        dob,
        enc: enc.id,
        kind: c.kind,
        clinic: c.clinic ?? null,
        ward: c.ward ?? null,
        point: c.point,
      });
    }
  bump(s, "patients", s.patients.length);
}
