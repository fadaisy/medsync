import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate D (ADR 0089) — the invariants a reviewer would otherwise grep for by
 * hand. Source-level on purpose: migration 0060 is GATED, so the dev DB may
 * not carry it, and these rules are about WHO may write, not what a row
 * holds.
 */
const ROOT = process.cwd();
const FUNCTIONS = resolve(ROOT, "supabase/functions");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}
const functionFiles = walk(FUNCTIONS).map(
  (p) => [p.slice(FUNCTIONS.length + 1), readFileSync(p, "utf8")] as const,
);
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fn = (name: string) => functionFiles.find(([p]) => p === `${name}/index.ts`)?.[1] ?? "";

describe("one writer of a reconciliation (PRD §2.8 — never automatic)", () => {
  it("only ha-reconcile-identity names reconciled_patient_user_id in the functions tree", () => {
    for (const [path, src] of functionFiles) {
      if (path === "ha-reconcile-identity/index.ts") continue;
      expect(src, path).not.toContain("reconciled_patient_user_id");
    }
    expect(fn("ha-reconcile-identity")).toContain("reconciled_patient_user_id");
  });

  it("only ha-reconcile-identity UPDATEs provisional_patients or sets patient_user_id on a row", () => {
    for (const [path, src] of functionFiles) {
      if (path === "ha-reconcile-identity/index.ts") continue;
      // An UPDATE of provisional_patients anywhere else.
      const provUpdate = /from\("provisional_patients"\)\s*\.update\(/.test(src);
      expect(provUpdate, `${path} updates provisional_patients`).toBe(false);
      // Setting patient_user_id after the fact anywhere else.
      expect(src, path).not.toMatch(/\.update\(\{\s*patient_user_id/);
    }
  });

  it("the Next side never writes reconciledPatientUserId (schema only)", () => {
    const next = [...walk(resolve(ROOT, "lib")), ...walk(resolve(ROOT, "app"))];
    for (const p of next) {
      expect(readFileSync(p, "utf8"), p).not.toContain("reconciledPatientUserId");
    }
  });

  it("the booking core inserts a provisional booking with patient_user_id NULL, never inherits", () => {
    const core = read("supabase/functions/_shared/book.ts");
    expect(core).toContain(
      "patient_user_id: null, provisional_patient_id: input.patient.provisionalId",
    );
    expect(core).not.toContain("reconciled_patient_user_id");
  });
});

describe("one booking core (no duplicated allocator / code / receipt logic)", () => {
  const writers = ["pt-request-appointment", "ha-book-on-behalf"] as const;

  it("both writers import bookAppointment from _shared/book.ts", () => {
    for (const w of writers) {
      expect(fn(w), w).toMatch(
        /import \{[^}]*bookAppointment[^}]*\} from "\.\.\/_shared\/book\.ts"/,
      );
    }
  });

  it("the allocator, the code, the window, the receipt and the reminders live in book.ts alone", () => {
    for (const [path, src] of functionFiles) {
      if (path === "_shared/book.ts" || path === "_shared/slots.ts") continue; // slots.ts DEFINES the helpers
      // ponytail: reschedule-appointment still mints its own code + receipt for
      // the NEW row of a slot reschedule (Gate C). Folding it into the core is
      // a different input (release + book); until then it is the one exemption.
      if (path === "reschedule-appointment/index.ts") continue;
      expect(src, path).not.toContain('rpc("allocate_session_position"');
      // (release_session_position is also cancel-appointment's — a cancel gives the place back.)
      expect(src, path).not.toContain("bookingCode(");
      expect(src, path).not.toContain("arrivalWindow(");
      expect(src, path).not.toContain('kind: "receipt"');
    }
    const core = read("supabase/functions/_shared/book.ts");
    for (const needle of [
      'rpc("allocate_session_position"',
      'rpc("release_session_position"',
      "bookingCode(",
      "arrivalWindow(",
      'kind: "receipt"',
      "reminder_lead_minutes",
    ]) {
      expect(core).toContain(needle);
    }
  });

  it("the core refuses a confidential line when a patient books for someone else", () => {
    const core = read("supabase/functions/_shared/book.ts");
    expect(core).toContain('input.origin === "patient" && !forSelf');
    expect(core).toContain("line.confidential");
  });
});

describe("migration 0060 — RLS and CHECKs as written", () => {
  const SQL = read("supabase/migrations/0060_identity_and_lifecycle.sql");
  const policies = [...SQL.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)\s+FOR (\w+)/g)].map(
    (m) => ({ name: m[1], table: m[2], cmd: m[3] }),
  );

  it("provisional_patients has exactly one policy, staff-only, SELECT only — no patient clause", () => {
    const own = policies.filter((p) => p.table === "provisional_patients");
    expect(own).toEqual([
      { name: "provisional_patients_select_staff", table: "provisional_patients", cmd: "SELECT" },
    ]);
    const body = SQL.slice(SQL.indexOf("CREATE POLICY provisional_patients_select_staff"));
    const policyText = body.slice(0, body.indexOf(";"));
    expect(policyText).not.toMatch(/patient_user_id\s*=\s*auth\.uid\(\)/);
    expect(policyText).not.toMatch(/created_by_user_id\s*=\s*auth\.uid\(\)/);
    // user_has_role(role, NULL) means "any hospital": a household row
    // (hospital_id NULL) must never match every hospital admin.
    expect(policyText).toContain(
      "(hospital_id IS NOT NULL AND public.user_has_role('hospital_admin', hospital_id))",
    );
    expect(policyText).not.toMatch(/OR public\.user_has_role\('hospital_admin', hospital_id\)/);
  });

  it("a booking agent reads only the bookings THEY created, and only reads", () => {
    const agent = policies.find((p) => p.name === "appointments_select_agent");
    expect(agent).toEqual({
      name: "appointments_select_agent",
      table: "appointments",
      cmd: "SELECT",
    });
    expect(SQL).toMatch(
      /appointments_select_agent[\s\S]*?USING \(created_by_user_id = auth\.uid\(\)\)/,
    );
    expect(
      policies.filter((p) => p.table === "appointments").every((p) => p.cmd === "SELECT"),
    ).toBe(true);
  });

  it("booking_agents: agent sees own live links; member sees links about them; adults only", () => {
    expect(SQL).toMatch(
      /booking_agents_select_agent[\s\S]*?USING \(agent_user_id = auth\.uid\(\) AND revoked_at IS NULL\)/,
    );
    expect(SQL).toMatch(
      /booking_agents_select_member[\s\S]*?USING \(patient_user_id = auth\.uid\(\)\)/,
    );
    expect(SQL).toContain("CONSTRAINT booking_agents_adults_only CHECK (declared_adult)");
    expect(SQL).toMatch(
      /booking_agents_member_exactly_one CHECK \(\s*\(patient_user_id IS NOT NULL\)::int \+ \(provisional_patient_id IS NOT NULL\)::int = 1/,
    );
  });

  it("the at-least-one CHECKs, the DROP NOT NULL, and `void` in the status CHECK", () => {
    expect(SQL).toContain("ALTER COLUMN patient_user_id DROP NOT NULL");
    expect(SQL).toMatch(
      /appointments_patient_or_provisional CHECK \(\s*patient_user_id IS NOT NULL OR provisional_patient_id IS NOT NULL\s*\)/,
    );
    expect(SQL).toMatch(
      /intakes_patient_or_unknown CHECK \(\s*patient_user_id IS NOT NULL\s*OR provisional_patient_id IS NOT NULL\s*OR patient_unknown_label IS NOT NULL\s*\)/,
    );
    expect(SQL).toMatch(
      /provisional_patients_dob_or_age CHECK \(\s*date_of_birth IS NOT NULL OR age_years IS NOT NULL/,
    );
    const status = SQL.slice(SQL.lastIndexOf("appointments_status_check CHECK"));
    expect(status.slice(0, status.indexOf(";"))).toContain("'void'");
  });

  it("no trigger or default ever sets reconciled_patient_user_id", () => {
    // The only mentions are the column definition and comments.
    const code = SQL.replace(/--.*$/gm, "");
    const mentions = code.match(/reconciled_patient_user_id/g) ?? [];
    expect(mentions.length).toBe(2); // the column, and the one-directional CHECK
    expect(code).not.toMatch(/SET reconciled_patient_user_id/i);
  });

  it("every SaAuditAction / SaAuditTargetKind in sa-audit.ts is in the re-issued CHECKs", () => {
    const ts = read("supabase/functions/_shared/sa-audit.ts");
    const union = (name: string) => {
      const start = ts.indexOf(`export type ${name} =`);
      const end = ts.indexOf(";", start);
      return [...ts.slice(start, end).matchAll(/"([a-z_]+)"/g)].map((m) => m[1] as string);
    };
    const check = (name: string) => {
      const start = SQL.lastIndexOf(`${name} CHECK`);
      return SQL.slice(start, SQL.indexOf(";", start));
    };
    const actions = check("sa_audit_log_action_check");
    for (const a of union("SaAuditAction")) expect(actions, a).toContain(`'${a}'`);
    const kinds = check("sa_audit_log_target_kind_check");
    for (const k of union("SaAuditTargetKind")) expect(kinds, k).toContain(`'${k}'`);
    for (const a of ["reconcile_identity", "unreconcile_identity", "add_booking_agent"]) {
      expect(actions).toContain(`'${a}'`);
    }
    for (const k of ["provisional_patient", "booking_agent"]) expect(kinds).toContain(`'${k}'`);
  });
});

describe("the dispatcher and the proxy (PRD §2.9)", () => {
  const route = stripComments(read("app/api/cron/dispatch-reminders/route.ts"));

  it("sends to the member's phone (profile or provisional), never resolved through the booking agent", () => {
    expect(route).toContain("provisionalPatients.phoneEncrypted");
    expect(route).toContain("patientProfiles.phoneEncrypted");
    expect(route).not.toContain("createdByUserId");
    expect(route).not.toContain("created_by_user_id");
  });

  it("never names a confidential service line in the SMS", () => {
    expect(route).toMatch(
      /case when \$\{serviceLines\.confidential\} or exists \(select 1 from public\.service_lines cl where cl\.department_id = \$\{appointments\.departmentId\} and cl\.confidential\) then 'Appointment'/,
    );
  });
});

describe("surfaces the server owns", () => {
  it("minors are refused with the one sentence, in both the declaration and the numbers", () => {
    const src = fn("pt-add-household-member");
    expect(src).toContain('"Booking for a child is not available yet."');
    expect(src).toContain("declared_adult: true");
    expect(src).toMatch(/statedAge < ADULT_YEARS/);
  });

  it("the desk's provisional caller is created encrypted with a blind index, never plaintext", () => {
    const src = fn("ha-book-on-behalf");
    expect(src).toContain("declared_name_encrypted: await encrypt(");
    expect(src).toContain("phone_encrypted: await encrypt(");
    expect(src).toContain("phone_hmac: await blindIndex(");
    expect(src).not.toMatch(/declared_name:\s*p\.declared_name/);
  });

  it("un-reconcile is hospital_admin-only with a reason of twenty characters", () => {
    const src = fn("ha-reconcile-identity");
    expect(src).toMatch(/action !== "unreconcile" \|\| \(i\.reason \?\? ""\)\.length >= 20/);
    expect(src).toContain('hasRole(caller.id, "hospital_admin", input.hospital_id)');
    expect(src).toContain('audit("unreconcile_identity", input.reason as string, after)');
  });
});
