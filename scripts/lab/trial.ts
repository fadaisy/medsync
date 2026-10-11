/* eslint-disable no-console -- owner CLI: it reports to the terminal */
/**
 * The Lab Phase 1 timed trial at a test hospital in production (docs/lab/phase-1/trial.md).
 *
 *   npm run lab:trial -- --config trial.json                       # dry run: checks, prints the plan
 *   npm run lab:trial -- --config trial.json --apply --actor <id>  # create the trial hospital
 *   npm run lab:trial -- --close --apply --actor <id>              # close it down afterwards
 *
 * Creates "MedSync Trial Hospital" in `provisioning` (so no patient directory, booking or USSD list
 * shows it), the participants' accounts, invented patients with lab orders, and the set-up the
 * Phase 1 flags need there: units from the signed test catalogue, invented response times and
 * level-1 contacts, every one labelled as a trial fixture. No real patient, no real hospital.
 *
 * Clinical records are append-only (alerts, marks, results, audit), so the trial's records stay in
 * the database for good, under the trial hospital. --close ends it: affiliations deactivated (the lab
 * role goes with them), roles removed, accounts banned, the hospital offboarded.
 *
 * `--actor` is your own auth user id: the audit rows name you, and you countersign the trial's
 * invented response times as CSO for the trial hospital only.
 */
import { execFileSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const TRIAL_HOSPITAL = "7a1a0000-0000-4000-8000-000000000001";
export const TRIAL_SLUG = "medsync-trial-hospital";
const TAG = "TRIAL FIXTURE: invented for the Lab Phase 1 timed trial at the test hospital only";

/** Department ids are fixed so the flags can be set before seeding. */
export const TRIAL_DEPT = {
  lab: "7a1a0000-0000-4000-8000-0000000000d1",
  chemistry: "7a1a0000-0000-4000-8000-0000000000d2",
  haematology: "7a1a0000-0000-4000-8000-0000000000d3",
  emergency: "7a1a0000-0000-4000-8000-0000000000d4",
  ward: "7a1a0000-0000-4000-8000-0000000000d5",
} as const;

export type Q = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export type Person = { id: string; name: string; email: string };
export interface TrialPeople {
  doctors: Person[];
  labStaff: Person[];
  labLead: Person;
  consultant: Person;
  /** Invented patients: 3 per doctor (task A), 5 per technologist (task B). */
  patients: { id: string; label: string; task: "A" | "B"; for: string }[];
}
export interface Config {
  doctors: { name: string; email: string }[];
  labStaff: { name: string; email: string }[];
  labLeadEmail: string;
  consultantEmail: string;
}

/** Validates the participants file the owner fills in. */
export function parseConfig(raw: unknown): Config {
  const c = raw as Config;
  const email = (e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const people = (xs: unknown, what: string) => {
    if (!Array.isArray(xs) || xs.length < 1 || xs.length > 4)
      throw new Error(`${what}: give 1 to 4 people.`);
    for (const p of xs as { name: unknown; email: unknown }[])
      if (typeof p.name !== "string" || p.name.trim().length < 2 || !email(p.email))
        throw new Error(`${what}: every person needs a name and an email address.`);
  };
  people(c.doctors, "doctors");
  people(c.labStaff, "labStaff");
  if (!email(c.labLeadEmail) || !email(c.consultantEmail))
    throw new Error("labLeadEmail and consultantEmail must be email addresses.");
  const all = [
    ...c.doctors.map((d) => d.email),
    ...c.labStaff.map((d) => d.email),
    c.labLeadEmail,
    c.consultantEmail,
  ].map((e) => e.toLowerCase());
  if (new Set(all).size !== all.length) throw new Error("Every email address must be different.");
  return c;
}

/** lib/encryption.ts wire format: base64 iv:authTag:ciphertext, AES-256-GCM. */
export function encryptWith(key: string) {
  const k = Buffer.from(key, "base64");
  if (k.length !== 32) throw new Error("MEDSYNC_PHI_KEY must decode to 32 bytes.");
  return (plain: string) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", k, iv);
    const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(":");
  };
}

/** What a run needs from the database before it writes anything. */
export async function preflight(q: Q): Promise<string[]> {
  const problems: string[] = [];
  const [r] = await q(
    `SELECT to_regclass('public.critical_alerts') IS NOT NULL AS criticals,
            to_regclass('public.lab_component_measures') IS NOT NULL AS measures,
            to_regclass('public.lab_cutover') IS NOT NULL AS cutover,
            to_regprocedure('private.notify_user(uuid,text,uuid)') IS NOT NULL AS realtime,
            EXISTS (SELECT 1 FROM public.hospitals WHERE id = $1 OR slug = $2) AS exists_already,
            (SELECT count(*)::int FROM public.test_catalogue
              WHERE code IN ('test.fbc', 'test.urea_electrolytes') AND hospital_id IS NULL) AS tests,
            (SELECT count(*)::int FROM public.cadres WHERE code IN ('MEDICAL_OFFICER', 'CONSULTANT', 'LAB_TECHNOLOGIST')) AS cadres,
            (SELECT count(*)::int FROM public.districts) AS districts`,
    [TRIAL_HOSPITAL, TRIAL_SLUG],
  );
  if (!r!.criticals || !r!.measures || !r!.cutover || !r!.realtime)
    problems.push("Migrations 0102–0106 are not all applied to this database.");
  if (r!.exists_already)
    problems.push("The trial hospital already exists here (close it, or keep using it).");
  if (r!.tests !== 2) problems.push("The test catalogue lacks test.fbc or test.urea_electrolytes.");
  if (r!.cadres !== 3)
    problems.push(
      "The cadres MEDICAL_OFFICER, CONSULTANT and LAB_TECHNOLOGIST are not all present.",
    );
  if (!r!.districts) problems.push("No districts: the reference data is missing.");
  return problems;
}

/**
 * Everything after the accounts, in one transaction the caller opens. Accounts (auth users) exist
 * already: the CLI creates them through Supabase Auth, the PGlite lane inserts them.
 */
export async function seedTrial(
  q: Q,
  people: TrialPeople,
  o: { actor: string; enc: (s: string) => string },
): Promise<{ mrn: Map<string, string> }> {
  const D = TRIAL_DEPT;
  await q(
    `INSERT INTO public.hospitals (id, name, slug, level, state) VALUES ($1, 'MedSync Trial Hospital', $2, 'private', 'provisioning')`,
    [TRIAL_HOSPITAL, TRIAL_SLUG],
  );
  await q(
    `INSERT INTO public.hospital_departments (id, hospital_id, parent_id, name, slug, kind, catalogue_code, medsync_live_at)
     VALUES ($2, $1, NULL, 'Laboratory', 'laboratory', 'diagnostic', 'LABORATORY', now()),
            ($3, $1, $2, 'Clinical chemistry', 'clinical-chemistry', 'diagnostic', 'clinical_chemistry', now()),
            ($4, $1, $2, 'Haematology', 'haematology', 'diagnostic', 'haematology', now()),
            ($5, $1, NULL, 'Emergency', 'emergency', 'clinical', 'EMERGENCY', now()),
            ($6, $1, NULL, 'Trial ward', 'trial-ward', 'clinical', NULL, now())`,
    [TRIAL_HOSPITAL, D.lab, D.chemistry, D.haematology, D.emergency, D.ward],
  );

  // Staff: name and state on public.users (the auth mirror made the row), an affiliation, a role.
  const staff: [Person, string, string, "approved" | "active", string | null][] = [
    ...people.doctors.map(
      (p) => [p, D.emergency, "MEDICAL_OFFICER", "active", "clinician"] as const,
    ),
    ...people.labStaff.map((p) => [p, D.chemistry, "LAB_TECHNOLOGIST", "approved", null] as const),
    [people.labLead, D.lab, "LAB_TECHNOLOGIST", "approved", null],
    [people.consultant, D.ward, "CONSULTANT", "active", "clinician"],
  ].map((x) => [...x] as [Person, string, string, "approved" | "active", string | null]);
  for (const [p, dept, cadre, state, role] of staff) {
    await q(
      `INSERT INTO public.users (id, full_name, email, state) VALUES ($1, $2, $3, 'active')
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, state = 'active'`,
      [p.id, p.name, p.email],
    );
    await q(
      `INSERT INTO public.staff_affiliations (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state, approved_at)
       SELECT $1, $2, $3, c.id,
              coalesce((SELECT r.id FROM public.roles r WHERE r.cadre_id = c.id ORDER BY r.code LIKE '%GENERAL' DESC LIMIT 1),
                       (SELECT r.id FROM public.roles r LIMIT 1)),
              'visiting', $5::lifecycle_state, now()
         FROM public.cadres c WHERE c.code = $4`,
      [p.id, TRIAL_HOSPITAL, dept, cadre, state],
    );
    if (role)
      await q(`INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1, $2, $3)`, [
        p.id,
        role,
        TRIAL_HOSPITAL,
      ]);
  }
  await q(
    `INSERT INTO public.department_heads (hospital_id, department_id, user_id) VALUES ($1, $2, $3)`,
    [TRIAL_HOSPITAL, D.lab, people.labLead.id],
  );

  // Units for the two tests in use, from the signed catalogue's default units (never typed here).
  await q(
    `INSERT INTO public.lab_component_measures (hospital_id, test_id, concept_id, version, result_type, unit_ucum, unit_display,
       decimal_places, authored_by)
     SELECT $1, t.id, c.concept, 1, 'number', u.code, u.display, 2, $2
       FROM public.test_catalogue t
       CROSS JOIN LATERAL unnest(t.components) AS c(concept)
       JOIN public.ucum_units u ON u.code = t.default_units ->> c.concept
      WHERE t.code IN ('test.fbc', 'test.urea_electrolytes') AND t.hospital_id IS NULL`,
    [TRIAL_HOSPITAL, people.labLead.id],
  );
  const [missing] = await q(
    `SELECT count(*)::int AS n FROM public.test_catalogue t CROSS JOIN LATERAL unnest(t.components) AS c(concept)
      WHERE t.code IN ('test.fbc', 'test.urea_electrolytes') AND t.hospital_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.lab_component_measures m
                         WHERE m.hospital_id = $1 AND m.test_id = t.id AND m.concept_id = c.concept)`,
    [TRIAL_HOSPITAL],
  );
  if (missing!.n)
    throw new Error(`${missing!.n} catalogue component(s) have no curated unit: stopped.`);

  // Invented response times, signed by the trial's lab lead and you; contacts for every department.
  await q(
    `INSERT INTO public.critical_response_versions (hospital_id, version, status, ack_within_min, level1_after_min,
       level2_after_min, source, authored_by, lead_signed_by, lead_signed_at, cso_signed_by, cso_signed_at)
     VALUES ($1, 1, 'signed', 30, 20, 15, $2, $3, $3, now(), $4, now())`,
    [TRIAL_HOSPITAL, TAG, people.labLead.id, o.actor],
  );
  await q(
    `INSERT INTO public.critical_contacts (hospital_id, department_id, level, user_id, position, created_by)
     VALUES ($1, $2, 1, $4, 1, $5), ($1, $3, 1, $4, 1, $5), ($1, NULL, 2, $4, 1, $5)`,
    [TRIAL_HOSPITAL, D.emergency, D.ward, people.consultant.id, o.actor],
  );

  // Patients: invented, on an open visit, each with one lab order. Task A: U&E received in the lab,
  // ready to result (the technologist marks it critical). Task B: FBC ordered, answered by a paper form.
  const [district] = await q(
    `SELECT id FROM public.districts ORDER BY (name ILIKE 'Kampala%') DESC, name LIMIT 1`,
  );
  const mrn = new Map<string, string>();
  let n = 0;
  for (const pt of people.patients) {
    n += 1;
    const doctor =
      pt.task === "A"
        ? people.doctors.find((d) => d.id === pt.for)!
        : people.doctors[n % people.doctors.length]!;
    const [row] = await q(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id, primary_facility_id)
       VALUES ($1, $2, $3, $4, $5, 'none', $6, $7, $8) RETURNING patient_code`,
      [
        pt.id,
        o.enc("Trial"),
        o.enc(`Patient ${pt.label}`),
        n % 2 ? "female" : "male",
        `${1955 + ((n * 7) % 45)}-0${1 + (n % 9)}-1${n % 10}`,
        o.enc("+256700000000"),
        district!.id,
        TRIAL_HOSPITAL,
      ],
    );
    mrn.set(pt.id, String(row!.patient_code));
    await q(
      `INSERT INTO public.users (id, full_name, email, state) VALUES ($1, $2, $3, 'active')
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`,
      [
        pt.id,
        `Trial Patient ${pt.label}`,
        `medsync-trial-patient-${pt.label.toLowerCase()}@example.com`,
      ],
    );
    await q(
      `INSERT INTO public.patient_intakes (hospital_id, entry_type_code, patient_user_id, status, arrived_at)
       VALUES ($1, 'walk_in', $2, 'arrived', now())`,
      [TRIAL_HOSPITAL, pt.id],
    );
    const dept = pt.task === "A" ? D.emergency : D.ward;
    const [enc] = await q(
      `INSERT INTO public.encounters (hospital_id, patient_user_id, clinician_user_id, department_id, state, started_at)
       VALUES ($1, $2, $3, $4, 'in_progress', now()) RETURNING id`,
      [TRIAL_HOSPITAL, pt.id, doctor.id, dept],
    );
    const testCode = pt.task === "A" ? "test.urea_electrolytes" : "test.fbc";
    const [ord] = await q(
      `INSERT INTO public.encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id, lifecycle,
         hospital_id, test_id, priority, performer, intent_source, requester_cadre, effective_at,
         reason_text_ciphertext, fasting_required, client_key)
       SELECT $1, $2, 'lab', t.display, $3, 'events', $4, t.id, 'urgent', 'in_house', 'clinician', 'MEDICAL_OFFICER', now(),
              $5, t.fasting_required, $6
         FROM public.test_catalogue t WHERE t.code = $7 AND t.hospital_id IS NULL
       RETURNING id`,
      [
        enc!.id,
        pt.id,
        doctor.id,
        TRIAL_HOSPITAL,
        o.enc("Trial: invented request"),
        `trial-${pt.label}`,
        testCode,
      ],
    );
    await q(
      `INSERT INTO public.encounter_order_events (order_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
       VALUES ($1, $2, $3, 'placed', $4, 'MEDICAL_OFFICER')`,
      [ord!.id, TRIAL_HOSPITAL, pt.id, doctor.id],
    );
    if (pt.task === "B") continue;
    const tech = people.labStaff[0]!;
    const [sp] = await q(
      `INSERT INTO public.specimens (order_id, hospital_id, patient_user_id, specimen_type, container, collected_at,
         collected_by_user_id, collector_cadre, identifiers_confirmed, label_no)
       SELECT $1, $2, $3, coalesce(t.specimen_type, 'unknown'), coalesce(t.container, 'unknown'), now(), $4,
              'MEDICAL_OFFICER', true, $5
         FROM public.test_catalogue t WHERE t.code = 'test.urea_electrolytes' AND t.hospital_id IS NULL
       RETURNING id`,
      [ord!.id, TRIAL_HOSPITAL, pt.id, doctor.id, `TRIAL-${pt.label}`],
    );
    await q(
      `INSERT INTO public.specimen_events (specimen_id, hospital_id, patient_user_id, kind, actor_user_id, actor_cadre)
       VALUES ($1, $2, $3, 'received', $4, 'LAB_TECHNOLOGIST')`,
      [sp!.id, TRIAL_HOSPITAL, pt.id, tech.id],
    );
  }
  return { mrn };
}

/** After the trial: nobody can work at the trial hospital any more; its records stay, labelled. */
export async function closeTrial(q: Q): Promise<string[]> {
  const users = await q(
    `SELECT DISTINCT user_id FROM public.staff_affiliations WHERE hospital_id = $1`,
    [TRIAL_HOSPITAL],
  );
  await q(
    `UPDATE public.staff_affiliations SET state = 'deactivated' WHERE hospital_id = $1 AND state <> 'deactivated'`,
    [TRIAL_HOSPITAL],
  );
  await q(`DELETE FROM public.user_roles WHERE hospital_id = $1`, [TRIAL_HOSPITAL]);
  await q(`UPDATE public.hospitals SET state = 'offboarded' WHERE id = $1`, [TRIAL_HOSPITAL]);
  return users.map((u) => String(u.user_id));
}

/** Task A: 3 patients per doctor; task B: 5 per technologist. Ids come from the accounts made. */
export function patientLabels(c: Config) {
  return [
    ...c.doctors.flatMap((_, d) =>
      [1, 2, 3].map((k) => ({ label: `A${d + 1}${k}`, task: "A" as const, doctor: d })),
    ),
    ...c.labStaff.flatMap((_, t) =>
      [1, 2, 3, 4, 5].map((k) => ({ label: `B${t + 1}${k}`, task: "B" as const, doctor: -1 })),
    ),
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const apply = args.includes("--apply");
  const close = args.includes("--close");
  const actor = arg("--actor");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (apply && (!actor || !UUID.test(actor))) {
    console.error("--apply needs --actor <your auth user id>.");
    process.exit(1);
  }

  // This folder's env files; in a worktree, the main checkout's (as scripts/migrate.ts does).
  let envDir = process.cwd();
  if (![".env", ".env.local"].some((f) => existsSync(join(envDir, f)))) {
    try {
      envDir = dirname(
        execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
          encoding: "utf8",
        }).trim(),
      );
    } catch {}
  }
  for (const f of [".env", ".env.local"])
    if (existsSync(join(envDir, f))) process.loadEnvFile(join(envDir, f));
  const need = [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MEDSYNC_PHI_KEY",
  ];
  const absent = need.filter((k) => !process.env[k]);
  if (absent.length) {
    console.error(`Missing in the env files (${envDir}): ${absent.join(", ")}.`);
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL!).hostname;
  console.log(`Database: ${host}   Mode: ${apply ? "APPLY" : "dry run (nothing is written)"}`);

  const { default: postgres } = await import("postgres");
  const { createClient } = await import("@supabase/supabase-js");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ).auth.admin;
  const q: Q = (text, params) => sql.unsafe(text, (params ?? []) as never[]) as never;

  try {
    if (close) {
      if (!apply) {
        console.log(
          "Would deactivate every affiliation, remove roles, ban the accounts and offboard the hospital.",
        );
        return;
      }
      let users: string[] = [];
      await sql.begin(async (tx) => {
        const tq: Q = (text, params) => tx.unsafe(text, (params ?? []) as never[]) as never;
        await tq(
          `SELECT set_config('app.user_id', $1, true), set_config('request.jwt.claim.sub', $1, true)`,
          [actor],
        );
        users = await closeTrial(tq);
      });
      for (const id of users) await auth.updateUserById(id, { ban_duration: "876000h" });
      console.log(
        `Closed. ${users.length} staff accounts banned; the trial hospital is offboarded.`,
      );
      return;
    }

    const cfgPath = arg("--config");
    if (!cfgPath)
      throw new Error("Give --config <participants file> (see docs/lab/phase-1/trial.md).");
    const cfg = parseConfig(JSON.parse(readFileSync(cfgPath, "utf8")));
    const problems = await preflight(q);
    if (problems.length) throw new Error(problems.join("\n"));
    const labels = patientLabels(cfg);
    console.log(
      `Plan: the trial hospital (${TRIAL_HOSPITAL}, provisioning), ${cfg.doctors.length} doctor(s), ` +
        `${cfg.labStaff.length} technologist(s), a lab lead and an on-call consultant account, ${labels.length} invented patients.`,
    );
    if (!apply) {
      console.log("Checks passed. Re-run with --apply --actor <your auth user id> to create it.");
      return;
    }

    // Accounts through Supabase Auth (the auth mirror trigger makes each public.users row).
    const made: { name: string; email: string; password: string; id: string }[] = [];
    const account = async (name: string, email: string, staff: boolean) => {
      const password = randomBytes(12).toString("base64url");
      const { data, error } = await auth.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, medsync_trial: true },
      });
      if (error || !data.user)
        throw new Error(
          `${email}: ${error?.message ?? "not created"} (use an address that has no MedSync account).`,
        );
      if (staff) made.push({ name, email, password, id: data.user.id });
      return { id: data.user.id, name, email };
    };
    const doctors: Person[] = [];
    for (const d of cfg.doctors) doctors.push(await account(d.name, d.email, true));
    const labStaff: Person[] = [];
    for (const t of cfg.labStaff) labStaff.push(await account(t.name, t.email, true));
    const labLead = await account("Trial lab lead", cfg.labLeadEmail, true);
    const consultant = await account("Trial on-call consultant", cfg.consultantEmail, true);
    const patients: TrialPeople["patients"] = [];
    for (const l of labels) {
      const p = await account(
        `Trial Patient ${l.label}`,
        `medsync-trial-patient-${l.label.toLowerCase()}@example.com`,
        false,
      );
      patients.push({
        id: p.id,
        label: l.label,
        task: l.task,
        for: l.task === "A" ? doctors[l.doctor]!.id : "",
      });
    }

    let result: { mrn: Map<string, string> } | null = null;
    await sql.begin(async (tx) => {
      const tq: Q = (text, params) => tx.unsafe(text, (params ?? []) as never[]) as never;
      await tq(
        `SELECT set_config('app.user_id', $1, true), set_config('request.jwt.claim.sub', $1, true)`,
        [actor],
      );
      result = await seedTrial(
        tq,
        { doctors, labStaff, labLead, consultant, patients },
        {
          actor: actor!,
          enc: encryptWith(process.env.MEDSYNC_PHI_KEY!),
        },
      );
    });

    console.log(
      "\nCreated. Hand each person their own line; this is the only time the passwords are shown.\n",
    );
    for (const m of made) console.log(`  ${m.name.padEnd(28)} ${m.email.padEnd(36)} ${m.password}`);
    console.log(
      "\nTask A patients (U&E received, ready to result; each doctor ordered their own three):",
    );
    for (const p of patients.filter((x) => x.task === "A"))
      console.log(
        `  ${result!.mrn.get(p.id)}  Trial Patient ${p.label}  → ${doctors.find((d) => d.id === p.for)!.name}`,
      );
    console.log("\nTask B patients (FBC ordered; write one MRN on each paper form):");
    for (const p of patients.filter((x) => x.task === "B"))
      console.log(`  ${result!.mrn.get(p.id)}  Trial Patient ${p.label}`);
    console.log(
      `\nUnits come from the signed catalogue's defaults; every component allows 2 decimal places (trial set-up).` +
        `\nNext: add ${TRIAL_HOSPITAL} to LAB_WORKSPACE, LAB_CRITICALS, LAB_UNITS_RANGES, LAB_DOWNTIME (and EMR_V1 if it is a list) in Vercel, then redeploy.`,
    );
  } catch (e) {
    console.error(`Stopped: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
