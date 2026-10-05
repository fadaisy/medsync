/**
 * §8.4 access probe suite. For every NCD table and every actor (the eight NCD roles, another
 * facility's registry lead, an unauthenticated app session, the anon role, and a superadmin who is
 * also on staff here), attempt select, insert, update and delete, and assert the allow/deny that
 * lib/ncdreg/table-access.ts × lib/ncdreg/capabilities.ts predict. PGlite lane only.
 */
import type { Pg, PgQueryable } from "../emr-db/_pglite";
import type { NcdActor, NcdFacility } from "./_ncd";
import type { GrantRole, NcdRole } from "@/lib/ncdreg/capabilities";
import type { TableAccess } from "@/lib/ncdreg/table-access";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { capabilitiesOf, NCD_ROLES } from "@/lib/ncdreg/capabilities";
import { TABLE_ACCESS } from "@/lib/ncdreg/table-access";
import { asNcd, bootLane, laneOn, ncdFacility } from "./_ncd";

type Op = "select" | "insert" | "update" | "delete";
const OPS: Op[] = ["select", "insert", "update", "delete"];

function expected(roles: readonly GrantRole[], a: TableAccess, op: Op): boolean {
  const caps = capabilitiesOf(roles);
  const rule = a[op];
  if (rule === "none") return false;
  if (rule === "any") return caps.size > 0;
  if (rule === "synthetic") return caps.has("demo_write");
  return rule.some((c) => caps.has(c));
}

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

/** One probe target row per table (nothing references it), plus the parents it needs. */
async function seed(pg: Pg, f: NcdFacility) {
  const F = f.facilityId;
  const q = (s: string, p: unknown[] = []) => pg.query(s, p);
  const person = (n: string) =>
    q(
      `INSERT INTO public.ncd_person (id, facility_id, registry_number, is_synthetic, given_name_ciphertext, family_name_ciphertext,
         sex, birth_year, privacy_notice_version, privacy_notice_ack_at)
       VALUES ($1, $2, $3, true, 'x', 'y', 'female', 1970, '0.1-draft', now())`,
      [n, F, `DEMO-P${n.slice(-6)}`],
    );
  const ids = {
    person: uid(),
    personLeaf: uid(),
    loser: uid(),
    reg: uid(),
    regLeaf: uid(),
    appt: uid(),
    apptLeaf: uid(),
    visit: uid(),
    visitLeaf: uid(),
    reminder: uid(),
    reminderLeaf: uid(),
  };
  await person(ids.person);
  await person(ids.personLeaf);
  await person(ids.loser);
  const reg = (id: string) =>
    q(
      `INSERT INTO public.ncd_registration (id, facility_id, person_id, condition_code, subtype, registration_date, diagnosis_year, basis_of_diagnosis)
       VALUES ($1, $2, $3, 'probe_condition', 'unknown', '2026-01-01', 2020, 'unknown')`,
      [id, F, ids.person],
    );
  await reg(ids.reg);
  await reg(ids.regLeaf);
  const appt = (id: string) =>
    q(
      `INSERT INTO public.ncd_appointment (id, facility_id, person_id, appointment_date) VALUES ($1, $2, $3, '2026-11-01')`,
      [id, F, ids.person],
    );
  await appt(ids.appt);
  await appt(ids.apptLeaf);
  const visit = (id: string) =>
    q(
      `INSERT INTO public.ncd_visit (id, facility_id, person_id, visit_date, visit_type) VALUES ($1, $2, $3, '2026-09-01', 'scheduled')`,
      [id, F, ids.person],
    );
  await visit(ids.visit);
  await visit(ids.visitLeaf);
  const reminder = (id: string) =>
    q(
      `INSERT INTO public.ncd_reminder (id, facility_id, person_id, appointment_id, kind, seq, due_on) VALUES ($1, $2, $3, $4, 'before', $5, '2026-10-30')`,
      [id, F, ids.person, ids.appt, ++seq],
    );
  await reminder(ids.reminder);
  await reminder(ids.reminderLeaf);

  const P = ids.person;
  // table → [probe target key column, key value, insert SQL (target table only), insert params]
  const rows: Record<string, { key: string; id: string; insert: [string, unknown[]] }> = {};
  const add = async (table: string, cols: Record<string, unknown>, key = "id") => {
    const names = Object.keys(cols);
    const vals = Object.values(cols);
    const sql = (v: unknown[]) =>
      [
        `INSERT INTO public.${table} (${names.join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
        v,
      ] as [string, unknown[]];
    const [s, p] = sql(vals);
    await q(s, p);
    const fresh = () => {
      const c = { ...cols };
      if (key in c && key !== "facility_id")
        c[key] = typeof c[key] === "number" ? 9_000_000 + ++seq : uid();
      if ("version" in c && typeof c.version === "number") c.version = ++seq;
      if ("seq" in c) c.seq = ++seq;
      if ("month" in c) c.month = `2025-${String((seq++ % 12) + 1).padStart(2, "0")}-01`;
      if ("visit_id" in c && table === "ncd_observation") c.code = `probe_${seq++}`;
      if (table === "ncd_definition_version") c.version = `v${++seq}`;
      return Object.values(c);
    };
    rows[table] = { key, id: String(cols[key]), insert: [s, fresh()] };
    // fresh() must run per probe for unique keys: store a thunk-like param list regenerated on read
    Object.defineProperty(rows[table]!, "insert", { get: () => [s, fresh()] });
  };

  await add("ncd_facility_settings", { facility_id: F }, "facility_id");
  await add("ncd_condition_setting", {
    id: uid(),
    facility_id: F,
    condition_code: "probe_condition",
    enabled: false,
    module_level: "core",
    module_status: "draft",
    module_version: "0",
    version: 1,
  });
  await add("ncd_staff_role", {
    id: uid(),
    facility_id: F,
    user_id: f.superadminId,
    ncd_role: "auditor",
    // Revoked: since 0094 an explicit assignment would give the superadmin that role, and the
    // "superadmin on staff here" actor below must hold none.
    revoked_at: "2026-10-01T00:00:00Z",
  });
  rows.ncd_person = {
    key: "id",
    id: ids.personLeaf,
    get insert(): [string, unknown[]] {
      const n = uid();
      return [
        `INSERT INTO public.ncd_person (id, facility_id, registry_number, is_synthetic, given_name_ciphertext, family_name_ciphertext,
           sex, birth_year, privacy_notice_version, privacy_notice_ack_at) VALUES ($1, $2, $3, true, 'x', 'y', 'male', 1960, '0.1-draft', now())`,
        [n, F, `DEMO-Q${n.slice(-6)}`],
      ];
    },
  };
  await add("ncd_name_index", { id: uid(), facility_id: F, person_id: P, token_hmac: "abc" });
  rows.ncd_registration = {
    key: "id",
    id: ids.regLeaf,
    get insert(): [string, unknown[]] {
      return [
        `INSERT INTO public.ncd_registration (id, facility_id, person_id, condition_code, subtype, registration_date, diagnosis_year, basis_of_diagnosis)
         VALUES ($1, $2, $3, 'probe_condition', 'unknown', '2026-01-01', 2020, 'unknown')`,
        [uid(), F, P],
      ];
    },
  };
  rows.ncd_appointment = {
    key: "id",
    id: ids.apptLeaf,
    get insert(): [string, unknown[]] {
      return [
        `INSERT INTO public.ncd_appointment (id, facility_id, person_id, appointment_date) VALUES ($1, $2, $3, '2026-12-01')`,
        [uid(), F, P],
      ];
    },
  };
  rows.ncd_visit = {
    key: "id",
    id: ids.visitLeaf,
    get insert(): [string, unknown[]] {
      return [
        `INSERT INTO public.ncd_visit (id, facility_id, person_id, visit_date, visit_type) VALUES ($1, $2, $3, '2026-09-02', 'scheduled')`,
        [uid(), F, P],
      ];
    },
  };
  rows.ncd_reminder = {
    key: "id",
    id: ids.reminderLeaf,
    get insert(): [string, unknown[]] {
      return [
        `INSERT INTO public.ncd_reminder (id, facility_id, person_id, appointment_id, kind, seq, due_on) VALUES ($1, $2, $3, $4, 'missed', $5, '2026-11-04')`,
        [uid(), F, P, ids.appt, ++seq],
      ];
    },
  };
  await add("ncd_observation", {
    id: uid(),
    facility_id: F,
    person_id: P,
    visit_id: ids.visit,
    registration_id: ids.reg,
    code: "probe",
  });
  await add("ncd_review", {
    id: uid(),
    facility_id: F,
    person_id: P,
    component: "lipids",
    review_date: "2026-08-01",
    data: "{}",
  });
  await add("ncd_event", {
    id: uid(),
    facility_id: F,
    person_id: P,
    event_type: "admission",
    event_date: "2026-05-01",
    reporting_unit: "ncd_clinic",
  });
  await add("ncd_call", {
    id: uid(),
    facility_id: F,
    person_id: P,
    call_date: "2026-10-01",
    outcome: "no_answer",
  });
  await add("ncd_sms_log", {
    id: uid(),
    facility_id: F,
    person_id: P,
    body: "probe",
    transport: "mock",
    result: "logged",
  });
  await add("ncd_sms_template", {
    id: uid(),
    facility_id: F,
    purpose: "missed_visit",
    language: "en",
    body: "probe",
  });
  await add("ncd_query", {
    id: uid(),
    facility_id: F,
    person_id: P,
    rule_id: "probe",
    status: "dismissed",
  });
  await add("ncd_audit_sample", {
    id: uid(),
    facility_id: F,
    person_id: P,
    visit_id: ids.visit,
    month: "2026-09-01",
    seed: "s",
  });
  await add("ncd_merge_request", {
    id: uid(),
    facility_id: F,
    person_id: P,
    loser_person_id: ids.loser,
    requested_by: f.users.registry_officer,
  });
  await add("ncd_record_version", {
    id: uid(),
    facility_id: F,
    person_id: P,
    record_table: "ncd_visit",
    record_id: ids.visit,
    version: 1,
    data: "{}",
    reason: "probe",
  });
  await add(
    "ncd_command_log",
    {
      command_id: uid(),
      facility_id: F,
      person_id: P,
      type: "probe",
      principal: "user",
      entered_at: "2026-10-01T08:00:00Z",
    },
    "command_id",
  );
  await add("ncd_indicator_snapshot", {
    id: uid(),
    facility_id: F,
    month: "2026-08-01",
    definition_version: "x",
    results: "{}",
    is_synthetic: true,
  });
  await add("ncd_demo_load", {
    id: uid(),
    facility_id: F,
    mode: "scenario",
    catalogue_version: "1",
    seed: 1,
    day0: "2026-10-05",
    status: "off",
    started_by: f.users.registry_lead,
  });
  // Born 'requested' (the guard allows nothing else), then withdrawn so a probe may insert a new one.
  const goLiveId = uid();
  await add("ncd_go_live_request", {
    id: goLiveId,
    facility_id: F,
    status: "requested",
    requested_by: f.users.registry_lead,
  });
  await q(`UPDATE public.ncd_go_live_request SET status = 'withdrawn' WHERE id = $1`, [goLiveId]);
  await add("ncd_export_request", {
    id: uid(),
    facility_id: F,
    kind: "aggregate_csv",
    requested_by: f.users.administrator,
  });
  await add("ncd_definition_version", {
    id: uid(),
    facility_id: F,
    definition_id: "probe",
    version: "v1",
    payload: "{}",
    author: f.users.registry_lead,
  });
  await add("ncd_access_event", { id: 9_000_000 + seq, facility_id: F, action: "probe" });
  return rows;
}

async function attempt(
  tx: PgQueryable,
  table: string,
  op: Op,
  r: { key: string; id: string; insert: [string, unknown[]] },
) {
  try {
    if (op === "select") {
      const { rows } = await tx.query(`SELECT 1 FROM public.${table} WHERE ${r.key}::text = $1`, [
        r.id,
      ]);
      return rows.length > 0;
    }
    if (op === "insert") {
      if (table === "ncd_facility_settings") {
        // The facility's one settings row exists; clear it as the owner, then insert as the actor.
        const role = (await tx.query<{ r: string }>("SELECT current_user AS r")).rows[0]!.r;
        await tx.query("RESET ROLE");
        await tx.query(`DELETE FROM public.ncd_facility_settings WHERE facility_id::text = $1`, [
          r.id,
        ]);
        await tx.query(`SET LOCAL ROLE ${role}`);
      }
      const [s, p] = r.insert;
      await tx.query(s, p);
      return true;
    }
    if (op === "update") {
      const res = await tx.query(
        `UPDATE public.${table} SET ${r.key} = ${r.key} WHERE ${r.key}::text = $1`,
        [r.id],
      );
      return (res.affectedRows ?? 0) > 0;
    }
    const res = await tx.query(`DELETE FROM public.${table} WHERE ${r.key}::text = $1`, [r.id]);
    return (res.affectedRows ?? 0) > 0;
  } catch (e) {
    const m = (e as Error).message;
    // Only a refusal counts as deny; anything else is a broken probe.
    if (/row-level security|permission denied|append-only|never deleted|to themselves/i.test(m))
      return false;
    throw new Error(`${table} ${op}: ${m}`);
  }
}

describe.skipIf(!laneOn)("§8.4 access probes", () => {
  let pg: Pg;
  let A: NcdFacility;
  let B: NcdFacility;
  let rows: Awaited<ReturnType<typeof seed>>;
  let run = 0;
  let passed = 0;

  beforeAll(async () => {
    pg = (await bootLane()).pg;
    A = await ncdFacility(pg, "Probe facility A");
    B = await ncdFacility(pg, "Probe facility B");
    rows = await seed(pg, A);
  }, 180_000);

  afterAll(() => {
    // The count the ledger records.
    process.stdout.write(`ncd access probes: ${passed}/${run} passed\n`);
  });

  const actors = (): [string, NcdActor, GrantRole[]][] => [
    ...NCD_ROLES.map((r): [string, NcdActor, GrantRole[]] => [
      r,
      { userId: A.users[r as NcdRole], facilityId: A.facilityId },
      [r],
    ]),
    [
      "other facility's registry lead",
      { userId: B.users.registry_lead, facilityId: B.facilityId },
      [],
    ],
    [
      "other facility's lead claiming facility A",
      { userId: B.users.registry_lead, facilityId: A.facilityId },
      [],
    ],
    ["unauthenticated app session", { userId: null, facilityId: A.facilityId }, []],
    ["anon role", { userId: null, facilityId: null, role: "anon" }, []],
    ["superadmin on staff here", { userId: A.superadminId, facilityId: A.facilityId }, []],
    [
      "demo loader without a manager",
      { userId: A.users.clinician, facilityId: A.facilityId, principal: "demo_loader" },
      [],
    ],
    [
      "demo loader for the registry lead",
      { userId: A.users.registry_lead, facilityId: A.facilityId, principal: "demo_loader" },
      ["demo_loader"],
    ],
    [
      "system principal",
      { userId: null, facilityId: A.facilityId, principal: "system" },
      ["system"],
    ],
  ];

  for (const table of Object.keys(TABLE_ACCESS)) {
    it(`${table}: every actor × operation`, async () => {
      const a = TABLE_ACCESS[table]!;
      const r = rows[table]!;
      const failures: string[] = [];
      for (const [name, actor, roles] of actors()) {
        // Another facility's user never reaches facility A's rows, whatever their roles.
        const crossFacility = actor.userId === B.users.registry_lead;
        for (const op of OPS) {
          const want = crossFacility ? false : expected(roles, a, op);
          const got = await asNcd(pg, actor, (tx) => attempt(tx, table, op, r));
          run++;
          if (got === want) passed++;
          else
            failures.push(
              `${name} ${op}: expected ${want ? "allow" : "deny"}, got ${got ? "allow" : "deny"}`,
            );
        }
      }
      expect(failures).toEqual([]);
    }, 120_000);
  }
});
