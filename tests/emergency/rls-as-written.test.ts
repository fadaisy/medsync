import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Migration 0066 (GATED) — RLS as written (PRD MS-PRD-SYM-001 §9.3; ADR 0098
 * ruling 5). Source-level like tests/notifications/gate-e-invariants: the dev
 * DB may not carry the migration, and these rules are about WHO reads WHERE.
 */
const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0066_symptom_catalog_and_emergency_pathway.sql"),
  "utf8",
);

const policies = [
  ...SQL.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)\s+FOR (\w+) TO ((?:\w+(?:,\s*)?)+)/g),
].map((m) => ({
  name: m[1] as string,
  table: m[2] as string,
  cmd: m[3] as string,
  roles: m[4] as string,
}));
const policyBody = (name: string) => {
  const start = SQL.indexOf(`CREATE POLICY ${name}`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf(";", start));
};
const forTable = (table: string) => policies.filter((p) => p.table === table);

const NEW_TABLES = [
  "patient_symptom_catalog_versions",
  "patient_symptom_catalog_items",
  "symptom_submissions",
  "emergency_pre_arrivals",
  "emergency_contacts",
  "pre_arrival_outbox",
];

describe("migration 0066 — RLS as written", () => {
  it("every new table has ENABLE + FORCE ROW LEVEL SECURITY", () => {
    for (const table of NEW_TABLES) {
      expect(SQL, table).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(SQL, table).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("symptom_submissions and emergency_pre_arrivals: exactly one policy each, SELECT, no superadmin", () => {
    for (const table of ["symptom_submissions", "emergency_pre_arrivals"]) {
      const own = forTable(table);
      expect(own, table).toHaveLength(1);
      expect(own[0]?.cmd).toBe("SELECT");
      expect(own[0]?.roles.trim()).toBe("authenticated");
      const body = policyBody(own[0]?.name ?? "");
      expect(body.toLowerCase(), `${table} admits superadmin`).not.toContain("superadmin");
      expect(body).toContain("auth.uid()");
      expect(body).toContain("staff_affiliations");
    }
  });

  it("emergency_contacts: one SELECT for anon + authenticated, verified rows only", () => {
    const own = forTable("emergency_contacts");
    expect(own).toHaveLength(1);
    expect(own[0]?.cmd).toBe("SELECT");
    expect(own[0]?.roles.replace(/\s/g, "")).toBe("anon,authenticated");
    expect(policyBody(own[0]?.name ?? "")).toContain(
      "USING (active = true AND verification_status = 'verified')",
    );
  });

  it("pre_arrival_outbox has ZERO policies (service role only)", () => {
    expect(forTable("pre_arrival_outbox")).toHaveLength(0);
  });

  it("patient_symptom_catalog_*: public SELECT to anon, authenticated — nothing else", () => {
    for (const table of ["patient_symptom_catalog_versions", "patient_symptom_catalog_items"]) {
      const own = forTable(table);
      expect(own, table).toHaveLength(1);
      expect(own[0]?.cmd).toBe("SELECT");
      expect(own[0]?.roles.replace(/\s/g, "")).toBe("anon,authenticated");
    }
  });

  it("no policy grants INSERT/UPDATE/DELETE to any client role", () => {
    expect(policies.every((p) => p.cmd === "SELECT")).toBe(true);
  });
});

describe("migration 0066 — the rest of the contract", () => {
  it("emergency_pre_arrivals is published to Realtime with a full replica identity", () => {
    expect(SQL).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_pre_arrivals;",
    );
    expect(SQL).toContain("ALTER TABLE public.emergency_pre_arrivals REPLICA IDENTITY FULL;");
  });

  it("the entry_types insert is ON CONFLICT DO NOTHING", () => {
    const start = SQL.indexOf("INSERT INTO public.entry_types");
    expect(start).toBeGreaterThan(-1);
    const stmt = SQL.slice(start, SQL.indexOf(";", start));
    expect(stmt).toContain("'self_presentation_prealerted'");
    expect(stmt).toContain("ON CONFLICT (code) DO NOTHING");
  });

  it("the sa_audit_log action CHECK carries the 10 new actions", () => {
    const start = SQL.indexOf("ADD CONSTRAINT sa_audit_log_action_check");
    const block = SQL.slice(start, SQL.indexOf(";", start));
    for (const action of [
      "submit_symptoms",
      "emergency_interrupt_shown",
      "emergency_declined",
      "emergency_call_tapped",
      "request_same_day",
      "create_pre_arrival",
      "update_pre_arrival",
      "sign_catalog_version",
      "verify_emergency_contact",
      "set_hospital_emergency_settings",
    ]) {
      expect(block, action).toContain(`'${action}'`);
    }
  });

  it("the sa_audit_log target-kind CHECK carries the 4 new kinds", () => {
    const start = SQL.indexOf("ADD CONSTRAINT sa_audit_log_target_kind_check");
    const block = SQL.slice(start, SQL.indexOf(";", start));
    for (const kind of [
      "symptom_submission",
      "emergency_pre_arrival",
      "emergency_contact",
      "patient_symptom_catalog_version",
    ]) {
      expect(block, kind).toContain(`'${kind}'`);
    }
  });

  it("nothing in the seed is verified — production shows the hospital phone until the runbook runs", () => {
    const start = SQL.indexOf("INSERT INTO public.emergency_contacts");
    const seed = SQL.slice(start, SQL.indexOf(";\n", start));
    expect(seed).toContain("ON CONFLICT (key) DO NOTHING");
    expect(seed).not.toMatch(/'verified'/);
  });
});
