/**
 * The timed-trial seed (scripts/lab/trial.ts) against every migration on the PGlite lane: it builds a
 * hospital the Phase 1 production gates accept, hidden from patients, and --close leaves nobody able
 * to work there. Accounts are inserted directly here; the CLI makes them through Supabase Auth.
 * Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import type { Person, TrialPeople } from "@/scripts/lab/trial";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { generateKey } from "@/lib/encryption";
import { departmentsWithoutLevel1, testsWithoutUnit } from "@/lib/lab/criticals/readiness";
import { legacyWritesOpen } from "@/lib/lab/cutover-store";
import {
  closeTrial,
  encryptWith,
  parseConfig,
  patientLabels,
  preflight,
  seedTrial,
  TRIAL_DEPT,
  TRIAL_HOSPITAL,
} from "@/scripts/lab/trial";
import { authUser, bootLane, laneOn } from "./_pglite";

vi.mock("@/db", () => ({ db: undefined }));

const CONFIG = {
  doctors: [
    { name: "Doctor One (trial)", email: "d1@example.com" },
    { name: "Doctor Two (trial)", email: "d2@example.com" },
  ],
  labStaff: [{ name: "Technologist One (trial)", email: "t1@example.com" }],
  labLeadEmail: "lead@example.com",
  consultantEmail: "oncall@example.com",
};

describe.skipIf(!laneOn)("Lab Phase 1 timed-trial seed", () => {
  let lane: Lane;
  let pg: Pg;
  let actor: string;
  let people: TrialPeople;
  let mrn: Map<string, string>;
  const q = (text: string, params?: unknown[]) =>
    pg.query<Record<string, unknown>>(text, params).then((r) => r.rows);
  const person = async (name: string, email: string): Promise<Person> => ({
    id: await authUser(pg, "trial"),
    name,
    email,
  });

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    actor = await authUser(pg, "owner");
    const cfg = parseConfig(CONFIG);
    const doctors = await Promise.all(cfg.doctors.map((d) => person(d.name, d.email)));
    const labStaff = await Promise.all(cfg.labStaff.map((d) => person(d.name, d.email)));
    const patients = [];
    for (const l of patientLabels(cfg))
      patients.push({
        id: await authUser(pg, "patient"),
        label: l.label,
        task: l.task,
        for: l.task === "A" ? doctors[l.doctor]!.id : "",
      });
    people = {
      doctors,
      labStaff,
      labLead: await person("Trial lab lead", cfg.labLeadEmail),
      consultant: await person("Trial on-call consultant", cfg.consultantEmail),
      patients,
    };
    expect(await preflight(q)).toEqual([]);
    await pg.query("BEGIN");
    ({ mrn } = await seedTrial(q, people, { actor, enc: encryptWith(generateKey()) }));
    await pg.query("COMMIT");
  }, 300_000);
  afterAll(() => undefined);

  it("refuses a bad participants file", () => {
    expect(() => parseConfig({ ...CONFIG, doctors: [] })).toThrow(/1 to 4/);
    expect(() => parseConfig({ ...CONFIG, consultantEmail: CONFIG.labLeadEmail })).toThrow(
      /different/,
    );
  });

  it("the hospital is hidden from patients and a second run is refused", async () => {
    const [h] = await q(`SELECT state FROM public.hospitals WHERE id = $1`, [TRIAL_HOSPITAL]);
    expect(h!.state).toBe("provisioning");
    expect(await preflight(q)).toEqual([
      "The trial hospital already exists here (close it, or keep using it).",
    ]);
  });

  it("the production gates accept it: units for every test in use, a level-1 contact everywhere", async () => {
    const db = lane.db as never;
    expect(await testsWithoutUnit(TRIAL_HOSPITAL, new Date(), db)).toEqual([]);
    expect(await departmentsWithoutLevel1(TRIAL_HOSPITAL, new Date(), db)).toEqual([]);
    const [t] = await q(
      `SELECT status, source FROM critical_response_versions WHERE hospital_id = $1`,
      [TRIAL_HOSPITAL],
    );
    expect(t).toMatchObject({ status: "signed" });
    expect(String(t!.source)).toMatch(/^TRIAL FIXTURE/);
    expect(await legacyWritesOpen(TRIAL_HOSPITAL, lane.db)).toBe(true);
  });

  it("technologists get lab access from the affiliation, doctors their role", async () => {
    const roles = await q(
      `SELECT user_id, role FROM public.user_roles WHERE hospital_id = $1 ORDER BY role`,
      [TRIAL_HOSPITAL],
    );
    const lab = roles.filter((r) => r.role === "lab_tech").map((r) => r.user_id);
    expect(lab).toEqual(expect.arrayContaining([people.labStaff[0]!.id, people.labLead.id]));
    const clin = roles.filter((r) => r.role === "clinician").map((r) => r.user_id);
    expect(clin).toEqual(expect.arrayContaining(people.doctors.map((d) => d.id)));
  });

  it("task A: three received U&E specimens per doctor; task B: five FBC orders per technologist", async () => {
    const a = await q(
      `SELECT o.authored_by_user_id AS doctor, count(*)::int AS n
         FROM public.encounter_orders o JOIN public.specimen_events e ON e.specimen_id IN
              (SELECT s.id FROM public.specimens s WHERE s.order_id = o.id) AND e.kind = 'received'
        WHERE o.hospital_id = $1 AND o.text ILIKE 'Urea%' GROUP BY 1`,
      [TRIAL_HOSPITAL],
    );
    expect(a.map((r) => r.n)).toEqual([3, 3]);
    const [b] = await q(
      `SELECT count(*)::int AS n FROM public.encounter_orders o
        WHERE o.hospital_id = $1 AND o.text ILIKE 'Full blood%'
          AND NOT EXISTS (SELECT 1 FROM public.specimens s WHERE s.order_id = o.id)`,
      [TRIAL_HOSPITAL],
    );
    expect(b!.n).toBe(5);
    expect([...mrn.values()].every((m) => /^MS-/.test(m))).toBe(true);
    const enc = await q(
      `SELECT DISTINCT department_id FROM public.encounters WHERE hospital_id = $1`,
      [TRIAL_HOSPITAL],
    );
    expect(enc.map((e) => e.department_id).sort()).toEqual(
      [TRIAL_DEPT.emergency, TRIAL_DEPT.ward].sort(),
    );
  });

  it("--close: affiliations deactivated, roles gone (lab access with them), hospital offboarded", async () => {
    const users = await closeTrial(q);
    expect(users.length).toBe(5);
    const [n] = await q(`SELECT count(*)::int AS n FROM public.user_roles WHERE hospital_id = $1`, [
      TRIAL_HOSPITAL,
    ]);
    expect(n!.n).toBe(0);
    const [h] = await q(`SELECT state FROM public.hospitals WHERE id = $1`, [TRIAL_HOSPITAL]);
    expect(h!.state).toBe("offboarded");
  });
});
